import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { AgentModel } from '@/models/Agent';
import { ProfileModel } from '@/models/Profile';
import { SettingModel } from '@/models/Setting';

export const runtime = 'nodejs';
const AGENT_ACTIVE_WINDOW_MS = 2 * 60 * 1000;

function resolveRuntimeUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value || value === 'http://127.0.0.1:3001') {
    return 'http://127.0.0.1:3101';
  }
  return value;
}

function isControlPlaneMode() {
  return process.env.NEXT_PUBLIC_RUNTIME_EXECUTION_MODE === 'control-plane';
}

function resolveEffectiveAgentStatus(item: { status?: string; lastSeenAt?: Date | string | null }) {
  if (item.status === 'DISABLED') {
    return 'DISABLED';
  }
  if (!item.lastSeenAt) {
    return 'OFFLINE';
  }
  const lastSeenAt = new Date(item.lastSeenAt);
  if (!Number.isFinite(lastSeenAt.getTime())) {
    return 'OFFLINE';
  }
  return lastSeenAt.getTime() >= Date.now() - AGENT_ACTIVE_WINDOW_MS ? 'ONLINE' : 'OFFLINE';
}

function getRunningProfileIds(runtimeStatus: Record<string, unknown> | null | undefined) {
  const raw = runtimeStatus?.runningProfileIds;
  return Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function getStringArrayField(runtimeStatus: Record<string, unknown> | null | undefined, key: string) {
  const raw = runtimeStatus?.[key];
  return Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

/**
 * GET /api/runtime/status
 * Returns the list of active sessions from the runtime server,
 * merged with profile names from MongoDB.
 */
export async function GET(req: NextRequest) {
  let authUser: { userId: string };
  try {
    authUser = requireUser(req) as { userId: string };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json(
      { online: false, sessions: [], error: message === 'Unauthorized' ? 'Unauthorized' : 'Request failed' },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
  let settingsDoc: Record<string, unknown> | null = null;
  let profiles: Array<Record<string, unknown>> = [];
  let dbDegraded = false;

  try {
    await connectMongo();
    settingsDoc = (await SettingModel.findOne({ userId: authUser.userId }).lean()) as Record<string, unknown> | null;
    profiles = (await ProfileModel.find({
      userId: authUser.userId,
    })
      .sort({ createdAt: -1 })
      .lean()) as Array<Record<string, unknown>>;
  } catch {
    dbDegraded = true;
  }

  if (isControlPlaneMode()) {
    try {
      const agents = await AgentModel.find({
        ownerUserId: authUser.userId,
        status: { $ne: 'DISABLED' },
      })
        .sort({ lastSeenAt: -1, updatedAt: -1 })
        .lean();

      const onlineAgents = agents.filter((agent) => resolveEffectiveAgentStatus(agent) === 'ONLINE');
      const sessions = onlineAgents.flatMap((agent) =>
        getRunningProfileIds((agent.runtimeStatus || null) as Record<string, unknown> | null).map((profileId) => {
          const profile = profiles.find((p) => String(p._id) === profileId) as { name?: string } | undefined;
          return {
            profileId,
            profileName: profile?.name || profileId,
            agentId: agent.agentId,
            agentName: agent.name || agent.agentId,
          };
        })
      );

      return NextResponse.json({
        online: onlineAgents.length > 0,
        sessions,
        mode: 'control-plane',
        agents: onlineAgents.map((agent) => ({
          agentId: agent.agentId,
          name: agent.name || '',
          lastSeenAt: agent.lastSeenAt || null,
          capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : [],
          runtimeStatus:
            agent.runtimeStatus && typeof agent.runtimeStatus === 'object' && !Array.isArray(agent.runtimeStatus)
              ? agent.runtimeStatus
              : null,
          hostInfo:
            agent.hostInfo && typeof agent.hostInfo === 'object' && !Array.isArray(agent.hostInfo)
              ? agent.hostInfo
              : null,
          runtimeSummary: {
            runningProfileCount: getRunningProfileIds((agent.runtimeStatus || null) as Record<string, unknown> | null)
              .length,
            lockedProfileCount: getStringArrayField(
              (agent.runtimeStatus || null) as Record<string, unknown> | null,
              'lockedProfileIds'
            ).length,
            staleLockProfileCount: getStringArrayField(
              (agent.runtimeStatus || null) as Record<string, unknown> | null,
              'staleLockProfileIds'
            ).length,
            effectiveRuntimeMode: String(
              ((agent.runtimeStatus || null) as Record<string, unknown> | null)?.effectiveRuntimeMode ||
                ((agent.hostInfo || null) as Record<string, unknown> | null)?.effectiveRuntimeMode ||
                ''
            ),
            degradeReason: String(
              ((agent.runtimeStatus || null) as Record<string, unknown> | null)?.degradeReason ||
                ((agent.hostInfo || null) as Record<string, unknown> | null)?.degradeReason ||
                ''
            ),
          },
        })),
        degraded: dbDegraded,
      });
    } catch {
      return NextResponse.json({ online: false, sessions: [], mode: 'control-plane', degraded: true });
    }
  }

  const runtimeUrl = resolveRuntimeUrl(
    process.env.RUNTIME_URL ||
      String((settingsDoc as Record<string, unknown> | null)?.runtimeUrl || '')
  );
  const apiKey =
    process.env.RUNTIME_API_KEY ||
    String((settingsDoc as Record<string, unknown> | null)?.runtimeApiKey || '') ||
    '';
  const baseUrl = runtimeUrl.replace(/\/$/, '');

  try {
    const health = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        'x-runtime-key': apiKey,
      },
      signal: AbortSignal.timeout(2000),
    });

    if (!health.ok) {
      return NextResponse.json({ online: false, sessions: [] });
    }

    try {
      const r = await fetch(`${baseUrl}/session/list`, {
        method: 'GET',
        headers: {
          'x-runtime-key': apiKey,
        },
        signal: AbortSignal.timeout(3000),
      });

      if (!r.ok) {
        return NextResponse.json({ online: true, sessions: [], degraded: true });
      }

      const sessions = (await r.json()) as Array<{ profileId: string } & Record<string, unknown>>;

      const enriched = sessions.map(s => {
        const profile = profiles.find((p) => String(p._id) === s.profileId) as { name?: string } | undefined;
        return { ...s, profileName: profile?.name || s.profileId };
      });

      return NextResponse.json({ online: true, sessions: enriched, degraded: dbDegraded });
    } catch {
      return NextResponse.json({ online: true, sessions: [], degraded: true });
    }
  } catch {
    return NextResponse.json({ online: false, sessions: [] });
  }
}
