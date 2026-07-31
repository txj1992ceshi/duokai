import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { AgentModel } from '@/models/Agent';
import { ProfileModel } from '@/models/Profile';

export const runtime = 'nodejs';
const AGENT_ACTIVE_WINDOW_MS = 2 * 60 * 1000;

function resolveEffectiveAgentStatus(item: { status?: string; lastSeenAt?: Date | string | null }) {
  if (item.status === 'DISABLED') return 'DISABLED';
  if (!item.lastSeenAt) return 'OFFLINE';
  const lastSeenAt = new Date(item.lastSeenAt);
  if (!Number.isFinite(lastSeenAt.getTime())) return 'OFFLINE';
  return lastSeenAt.getTime() >= Date.now() - AGENT_ACTIVE_WINDOW_MS ? 'ONLINE' : 'OFFLINE';
}

function getStringArrayField(runtimeStatus: Record<string, unknown> | null | undefined, key: string) {
  const raw = runtimeStatus?.[key];
  return Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

export async function GET(req: NextRequest) {
  let authUser: { userId: string };
  try {
    authUser = requireUser(req) as { userId: string };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json(
      { online: false, sessions: [], mode: 'control-plane', error: message === 'Unauthorized' ? 'Unauthorized' : 'Request failed' },
      { status: message === 'Unauthorized' ? 401 : 500 },
    );
  }

  try {
    await connectMongo();
    const [profiles, agents] = await Promise.all([
      ProfileModel.find({ userId: authUser.userId }).sort({ createdAt: -1 }).lean(),
      AgentModel.find({ ownerUserId: authUser.userId, status: { $ne: 'DISABLED' } })
        .sort({ lastSeenAt: -1, updatedAt: -1 })
        .lean(),
    ]);
    const onlineAgents = agents.filter((agent) => resolveEffectiveAgentStatus(agent) === 'ONLINE');
    const sessions = onlineAgents.flatMap((agent) =>
      getStringArrayField((agent.runtimeStatus || null) as Record<string, unknown> | null, 'runningProfileIds')
        .map((profileId) => {
          const profile = profiles.find((item) => String(item._id) === profileId) as { name?: string } | undefined;
          return {
            profileId,
            profileName: profile?.name || profileId,
            agentId: agent.agentId,
            agentName: agent.name || agent.agentId,
          };
        }),
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
        runtimeStatus: agent.runtimeStatus && typeof agent.runtimeStatus === 'object' ? agent.runtimeStatus : null,
        hostInfo: agent.hostInfo && typeof agent.hostInfo === 'object' ? agent.hostInfo : null,
        runtimeSummary: {
          runningProfileCount: getStringArrayField((agent.runtimeStatus || null) as Record<string, unknown> | null, 'runningProfileIds').length,
          lockedProfileCount: getStringArrayField((agent.runtimeStatus || null) as Record<string, unknown> | null, 'lockedProfileIds').length,
          staleLockProfileCount: getStringArrayField((agent.runtimeStatus || null) as Record<string, unknown> | null, 'staleLockProfileIds').length,
        },
      })),
    });
  } catch {
    return NextResponse.json({ online: false, sessions: [], agents: [], mode: 'control-plane', degraded: true });
  }
}
