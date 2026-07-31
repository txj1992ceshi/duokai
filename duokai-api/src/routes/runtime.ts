import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { connectMongo } from '../lib/mongodb.js';
import { requireUser } from '../middlewares/auth.js';
import { AgentModel } from '../models/Agent.js';
import { ProfileModel } from '../models/Profile.js';

const router = Router();
const AGENT_ACTIVE_WINDOW_MS = 2 * 60 * 1000;

router.use(requireUser);

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function isOnline(agent: { status?: unknown; lastSeenAt?: Date | string | null }): boolean {
  if (agent.status === 'DISABLED' || !agent.lastSeenAt) return false;
  const lastSeenAt = new Date(agent.lastSeenAt);
  return Number.isFinite(lastSeenAt.getTime()) && lastSeenAt.getTime() >= Date.now() - AGENT_ACTIVE_WINDOW_MS;
}

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const admin = authUser.role === 'admin';
    const [agents, profiles] = await Promise.all([
      AgentModel.find(admin ? { status: { $ne: 'DISABLED' } } : { ownerUserId: authUser.userId, status: { $ne: 'DISABLED' } })
        .sort({ lastSeenAt: -1, updatedAt: -1 })
        .lean(),
      ProfileModel.find(admin ? {} : { userId: authUser.userId }).select('_id name').lean(),
    ]);
    const profileNames = new Map(profiles.map((profile) => [String(profile._id), String(profile.name || '')]));
    const onlineAgents = agents.filter(isOnline);
    const sessions = onlineAgents.flatMap((agent) =>
      stringArray(agent.runtimeStatus?.runningProfileIds).map((profileId) => ({
        sessionId: profileId,
        profileId,
        profileName: profileNames.get(profileId) || profileId,
        status: 'running',
        startedAt: '',
        agentId: agent.agentId,
        agentName: agent.name || agent.agentId,
      })),
    );

    res.json({
      online: onlineAgents.length > 0,
      degraded: onlineAgents.some((agent) => Boolean(agent.runtimeStatus?.degraded || agent.hostInfo?.degraded)),
      mode: 'control-plane',
      sessions,
      agents: onlineAgents.map((agent) => ({
        agentId: agent.agentId,
        name: agent.name || '',
        lastSeenAt: agent.lastSeenAt || null,
        capabilities: Array.isArray(agent.capabilities) ? agent.capabilities : [],
        runtimeSummary: {
          runningProfileCount: stringArray(agent.runtimeStatus?.runningProfileIds).length,
          queuedProfileCount: stringArray(agent.runtimeStatus?.queuedProfileIds).length,
          startingProfileCount: stringArray(agent.runtimeStatus?.startingProfileIds).length,
          lockedProfileCount: stringArray(agent.runtimeStatus?.lockedProfileIds).length,
          staleLockProfileCount: stringArray(agent.runtimeStatus?.staleLockProfileIds).length,
        },
      })),
    });
  }),
);

router.post(
  '/:action',
  asyncHandler(async (req, res) => {
    res.status(410).json({
      success: false,
      code: 'LEGACY_DIRECT_RUNTIME_RETIRED',
      action: String(req.params.action || ''),
      error: '旧直连 Runtime API 已退役。',
      detail: '使用 /api/control-plane/runtime 创建受支持的 start/stop 任务；不存在服务器端或普通 Chromium 回退。',
    });
  }),
);

export default router;
