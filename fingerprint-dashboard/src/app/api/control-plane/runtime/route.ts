import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { AgentModel } from '@/models/Agent';
import { ControlTaskModel } from '@/models/ControlTask';
import { ProfileModel } from '@/models/Profile';
import { TaskEventModel } from '@/models/TaskEvent';

export const runtime = 'nodejs';

const AGENT_ACTIVE_WINDOW_MS = 2 * 60 * 1000;

function isAgentOnline(agent: { status?: string; lastSeenAt?: Date | string | null }) {
  if (agent.status === 'DISABLED') {
    return false;
  }
  if (!agent.lastSeenAt) {
    return false;
  }
  const lastSeenAt = new Date(agent.lastSeenAt);
  return Number.isFinite(lastSeenAt.getTime()) && lastSeenAt.getTime() >= Date.now() - AGENT_ACTIVE_WINDOW_MS;
}

function hasCapability(agent: { capabilities?: unknown[] }, capability: string) {
  return Array.isArray(agent.capabilities) && agent.capabilities.includes(capability);
}

function getRunningProfileIds(agent: { runtimeStatus?: Record<string, unknown> | null }) {
  const raw = agent.runtimeStatus?.runningProfileIds;
  return Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

export async function POST(req: NextRequest) {
  try {
    const authUser = requireUser(req) as { userId: string; email?: string };
    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(payload.action || '').trim().toLowerCase();
    const profileId = String(payload.profileId || '').trim();

    if (action !== 'start' && action !== 'stop') {
      return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
    }
    if (!profileId) {
      return NextResponse.json({ success: false, error: 'profileId is required' }, { status: 400 });
    }

    await connectMongo();

    const profile = await ProfileModel.findOne({
      _id: profileId,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      return NextResponse.json({ success: false, error: 'Profile not found' }, { status: 404 });
    }

    const agents = await AgentModel.find({
      ownerUserId: authUser.userId,
      status: { $ne: 'DISABLED' },
    })
      .sort({ lastSeenAt: -1, updatedAt: -1 })
      .lean();

    const onlineAgents = agents.filter((agent) => isAgentOnline(agent));
    const requiredCapability = action === 'start' ? 'runtime.launch' : 'runtime.stop';
    const capableAgents = onlineAgents.filter((agent) => hasCapability(agent, requiredCapability));

    let selectedAgent =
      action === 'stop'
        ? capableAgents.find((agent) => getRunningProfileIds(agent).includes(profileId))
        : capableAgents.find((agent) => getRunningProfileIds(agent).includes(profileId));

    if (!selectedAgent) {
      selectedAgent = capableAgents[0];
    }

    if (!selectedAgent) {
      return NextResponse.json(
        {
          success: false,
          code: action === 'start' ? 'NO_ONLINE_AGENT' : 'NO_STOP_AGENT',
          error:
            action === 'start'
              ? '当前没有在线的桌面 Agent 可用于启动环境'
              : '当前没有在线的桌面 Agent 可用于停止环境',
          detail: {
            ownerUserId: authUser.userId,
            onlineAgentCount: onlineAgents.length,
            capableAgentCount: capableAgents.length,
            requiredCapability,
          },
        },
        { status: 409 }
      );
    }

    const runningProfileIds = getRunningProfileIds(selectedAgent);
    if (action === 'start' && runningProfileIds.includes(profileId)) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        alreadyRunning: true,
        agentId: selectedAgent.agentId,
      });
    }

    const taskType = action === 'start' ? 'PROFILE_START' : 'PROFILE_STOP';
    const taskId = randomUUID();
    const idempotencyKey = `${taskType.toLowerCase()}-${profileId}-${Date.now()}`;

    await ControlTaskModel.create({
      taskId,
      agentId: selectedAgent.agentId,
      type: taskType,
      status: 'PENDING',
      payload: { profileId },
      idempotencyKey,
      createdByUserId: authUser.userId,
      createdByEmail: authUser.email || '',
    });

    await TaskEventModel.create({
      taskId,
      agentId: selectedAgent.agentId,
      status: 'PENDING',
      idempotencyKey,
      detail: { profileId, action, source: 'fingerprint-dashboard' },
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      queued: true,
      taskId,
      agentId: selectedAgent.agentId,
      profileId,
      action,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    if (message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, code: 'CONTROL_PLANE_RUNTIME_ERROR', error: message }, { status: 500 });
  }
}
