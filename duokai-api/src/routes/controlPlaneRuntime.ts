import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { connectMongo } from '../lib/mongodb.js';
import { requireUser } from '../middlewares/auth.js';
import { AgentModel } from '../models/Agent.js';
import { ControlTaskModel } from '../models/ControlTask.js';
import { ProfileModel } from '../models/Profile.js';
import { TaskEventModel } from '../models/TaskEvent.js';

const router = Router();
const AGENT_ACTIVE_WINDOW_MS = 2 * 60 * 1000;

function isAgentOnline(agent: { status?: string; lastSeenAt?: Date | null }) {
  if (agent.status === 'DISABLED') {
    return false;
  }
  if (!agent.lastSeenAt) {
    return false;
  }
  return agent.lastSeenAt.getTime() >= Date.now() - AGENT_ACTIVE_WINDOW_MS;
}

function hasCapability(agent: { capabilities?: unknown[] }, capability: string) {
  return Array.isArray(agent.capabilities) && agent.capabilities.includes(capability);
}

function getRunningProfileIds(agent: { runtimeStatus?: Record<string, unknown> | null }) {
  const raw = agent.runtimeStatus?.runningProfileIds;
  return Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

router.post(
  '/',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();

    const action = String(req.body?.action || '').trim().toLowerCase();
    const profileId = String(req.body?.profileId || '').trim();

    if (action !== 'start' && action !== 'stop') {
      res.status(400).json({ success: false, error: 'Unsupported action' });
      return;
    }
    if (!profileId) {
      res.status(400).json({ success: false, error: 'profileId is required' });
      return;
    }

    const profile = await ProfileModel.findOne({
      _id: profileId,
      userId: req.authUser?.userId || '',
    }).lean();

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const agents = await AgentModel.find({
      ownerUserId: req.authUser?.userId || '',
      status: { $ne: 'DISABLED' },
    })
      .sort({ lastSeenAt: -1, updatedAt: -1 })
      .lean();

    const onlineAgents = agents.filter((agent) => isAgentOnline(agent));
    const requiredCapability = action === 'start' ? 'runtime.launch' : 'runtime.stop';
    const capableAgents = onlineAgents.filter((agent) => hasCapability(agent, requiredCapability));

    let selectedAgent = capableAgents.find((agent) => getRunningProfileIds(agent).includes(profileId));
    if (!selectedAgent) {
      selectedAgent = capableAgents[0];
    }

    if (!selectedAgent) {
      res.status(409).json({
        success: false,
        code: action === 'start' ? 'NO_ONLINE_AGENT' : 'NO_STOP_AGENT',
        error:
          action === 'start'
            ? '当前没有在线的桌面 Agent 可用于启动环境'
            : '当前没有在线的桌面 Agent 可用于停止环境',
        detail: {
          ownerUserId: req.authUser?.userId || '',
          onlineAgentCount: onlineAgents.length,
          capableAgentCount: capableAgents.length,
          requiredCapability,
        },
      });
      return;
    }

    const runningProfileIds = getRunningProfileIds(selectedAgent);
    if (action === 'start' && runningProfileIds.includes(profileId)) {
      res.json({
        success: true,
        duplicate: true,
        alreadyRunning: true,
        agentId: selectedAgent.agentId,
      });
      return;
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
      createdByUserId: req.authUser?.userId || '',
      createdByEmail: req.authUser?.email || '',
    });

    await TaskEventModel.create({
      taskId,
      agentId: selectedAgent.agentId,
      status: 'PENDING',
      idempotencyKey,
      detail: { profileId, action, source: 'duokai-api' },
      createdAt: new Date(),
    });

    res.json({
      success: true,
      queued: true,
      taskId,
      agentId: selectedAgent.agentId,
      profileId,
      action,
    });
  }),
);

export default router;
