import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  buildTaskIdempotencyKey,
  getControlActionDefinition,
  normalizeControlPlaneAction,
} from '../lib/controlTasks.js';
import { asyncHandler } from '../lib/http.js';
import { validateProfileLeaseForStart } from '../lib/ipLease.js';
import { connectMongo } from '../lib/mongodb.js';
import { getDefaultPlatformPolicy } from '../lib/platformPolicies.js';
import { requireUser } from '../middlewares/auth.js';
import { AgentModel } from '../models/Agent.js';
import { ControlTaskModel } from '../models/ControlTask.js';
import { IpLeaseModel } from '../models/IpLease.js';
import { PlatformPolicyModel } from '../models/PlatformPolicy.js';
import { ProfileModel } from '../models/Profile.js';
import { ProxyAssetModel } from '../models/ProxyAsset.js';
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

function getStringArrayField(
  container: { runtimeStatus?: Record<string, unknown> | null } | null | undefined,
  key: string
) {
  const raw = container?.runtimeStatus?.[key];
  return Array.isArray(raw) ? raw.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function getAgentSelectionState(agent: { agentId: string; runtimeStatus?: Record<string, unknown> | null; lastSeenAt?: Date | null }) {
  const runningProfileIds = getRunningProfileIds(agent);
  const lockedProfileIds = getStringArrayField(agent, 'lockedProfileIds');
  const staleLockProfileIds = getStringArrayField(agent, 'staleLockProfileIds');
  return {
    runningProfileIds,
    lockedProfileIds,
    staleLockProfileIds,
    runningCount: runningProfileIds.length,
    lockedCount: lockedProfileIds.length,
    staleLockCount: staleLockProfileIds.length,
    lastSeenAtMs: agent.lastSeenAt?.getTime() || 0,
  };
}

async function persistLastLaunchBlock(
  userId: string,
  profileId: string,
  payload: { code: string; message: string; detail?: unknown }
) {
  await ProfileModel.updateOne(
    { _id: profileId, userId },
    {
      $set: {
        lastLaunchBlock: {
          code: payload.code,
          message: payload.message,
          detail: payload.detail || null,
          blockedAt: new Date().toISOString(),
        },
      },
    }
  );
}

async function clearLastLaunchBlock(userId: string, profileId: string) {
  await ProfileModel.updateOne(
    { _id: profileId, userId },
    {
      $set: {
        lastLaunchBlock: null,
      },
    }
  );
}

function compareAgentPriority(
  left: ReturnType<typeof getAgentSelectionState>,
  right: ReturnType<typeof getAgentSelectionState>
) {
  if (left.staleLockCount !== right.staleLockCount) {
    return left.staleLockCount - right.staleLockCount;
  }
  if (left.runningCount !== right.runningCount) {
    return left.runningCount - right.runningCount;
  }
  if (left.lockedCount !== right.lockedCount) {
    return left.lockedCount - right.lockedCount;
  }
  return right.lastSeenAtMs - left.lastSeenAtMs;
}

router.post(
  '/',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();

    const action = normalizeControlPlaneAction(req.body?.action);
    const profileId = String(req.body?.profileId || '').trim();
    const snapshotId = String(req.body?.snapshotId || '').trim();
    const targetUrl = String(req.body?.targetUrl || '').trim();

    if (!action) {
      res.status(400).json({ success: false, error: 'Unsupported action' });
      return;
    }
    const actionDefinition = getControlActionDefinition(action);

    if (actionDefinition.requiresProfileId && !profileId) {
      res.status(400).json({ success: false, error: 'profileId is required' });
      return;
    }
    if (actionDefinition.requiresSnapshotId && !snapshotId) {
      res.status(400).json({ success: false, error: 'snapshotId is required' });
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
    const requiredCapability = actionDefinition.requiredCapability;
    const capableAgents = onlineAgents.filter((agent) => hasCapability(agent, requiredCapability));

    let selectedAgent = capableAgents.find((agent) => getRunningProfileIds(agent).includes(profileId));
    if (!selectedAgent) {
      const rankedAgents = capableAgents
        .map((agent) => ({
          agent,
          state: getAgentSelectionState(agent),
        }))
        .filter(({ state }) => !state.lockedProfileIds.includes(profileId))
        .sort((left, right) => compareAgentPriority(left.state, right.state));
      selectedAgent = rankedAgents[0]?.agent;
    }

    if (!selectedAgent) {
      if (action === 'start') {
        await persistLastLaunchBlock(req.authUser?.userId || '', profileId, {
          code: action === 'start' ? 'NO_ONLINE_AGENT' : 'NO_STOP_AGENT',
          message: '当前没有在线的桌面 Agent 可用于启动环境',
          detail: {
            ownerUserId: req.authUser?.userId || '',
            onlineAgentCount: onlineAgents.length,
            capableAgentCount: capableAgents.length,
            requiredCapability,
          },
        });
      }
      res.status(409).json({
        success: false,
        code: action === 'start' ? 'NO_ONLINE_AGENT' : 'NO_STOP_AGENT',
        error:
          action === 'start'
            ? '当前没有在线的桌面 Agent 可用于启动环境'
            : `当前没有在线的桌面 Agent 可用于执行 ${action}`,
        detail: {
          ownerUserId: req.authUser?.userId || '',
          onlineAgentCount: onlineAgents.length,
          capableAgentCount: capableAgents.length,
          requiredCapability,
        },
      });
      return;
    }

    const selectedState = getAgentSelectionState(selectedAgent);
    const runningProfileIds = selectedState.runningProfileIds;
    if (action === 'start' && runningProfileIds.includes(profileId)) {
      await clearLastLaunchBlock(req.authUser?.userId || '', profileId);
      res.json({
        success: true,
        duplicate: true,
        alreadyRunning: true,
        agentId: selectedAgent.agentId,
        detail: {
          selectedAgent: {
            staleLockCount: selectedState.staleLockCount,
            lockedCount: selectedState.lockedCount,
            runningCount: selectedState.runningCount,
          },
        },
      });
      return;
    }

    if (action === 'start' && selectedState.lockedProfileIds.includes(profileId)) {
      await persistLastLaunchBlock(req.authUser?.userId || '', profileId, {
        code: 'RUNTIME_LOCK_EXISTS',
        message: '目标 Profile 当前存在本机运行锁，暂时不能重复启动',
        detail: {
          agentId: selectedAgent.agentId,
          lockedProfileIds: selectedState.lockedProfileIds,
          staleLockProfileIds: selectedState.staleLockProfileIds,
        },
      });
      res.status(409).json({
        success: false,
        code: 'RUNTIME_LOCK_EXISTS',
        error: '目标 Profile 当前存在本机运行锁，暂时不能重复启动',
        detail: {
          agentId: selectedAgent.agentId,
          lockedProfileIds: selectedState.lockedProfileIds,
          staleLockProfileIds: selectedState.staleLockProfileIds,
        },
      });
      return;
    }

    let leaseValidation:
      | ReturnType<typeof validateProfileLeaseForStart>
      | null = null;
    let activeLease: Record<string, unknown> | null = null;
    let proxyAsset: Record<string, unknown> | null = null;
    let platformPolicy: Record<string, unknown> | null = null;

    if (action === 'start') {
      activeLease = await IpLeaseModel.findOne({
        userId: req.authUser?.userId || '',
        profileId,
        state: 'active',
      }).lean();

      const conflictingLeases =
        activeLease && typeof activeLease.egressIp === 'string' && activeLease.egressIp.trim()
          ? await IpLeaseModel.find({
              userId: req.authUser?.userId || '',
              egressIp: activeLease.egressIp,
              state: 'active',
            }).lean()
          : [];

      const proxyAssetId =
        String((activeLease as { proxyAssetId?: unknown } | null)?.proxyAssetId || '').trim() ||
        String((profile as { proxyAssetId?: unknown }).proxyAssetId || '').trim();

      if (proxyAssetId) {
        proxyAsset = await ProxyAssetModel.findOne({
          _id: proxyAssetId,
          userId: req.authUser?.userId || '',
        }).lean();
      }

      platformPolicy = await PlatformPolicyModel.findOne({
        platform: String((profile as { platform?: unknown }).platform || '').trim(),
        purpose: String((profile as { purpose?: unknown }).purpose || 'operation').trim(),
        active: true,
      })
        .sort({ version: -1, updatedAt: -1 })
        .lean();

      if (!platformPolicy) {
        platformPolicy = getDefaultPlatformPolicy(
          String((profile as { platform?: unknown }).platform || '').trim(),
          String((profile as { purpose?: unknown }).purpose || 'operation').trim()
        );
      }

      const runningProfileIds = Array.from(
        new Set(capableAgents.flatMap((agent) => getRunningProfileIds(agent)))
      );

      leaseValidation = validateProfileLeaseForStart(profile, activeLease, conflictingLeases, {
        proxyAsset,
        proxyPolicy:
          platformPolicy && typeof platformPolicy === 'object'
            ? ((platformPolicy as { proxyPolicy?: Record<string, unknown> }).proxyPolicy ?? null)
            : null,
        runningProfileIds,
      });
      if (!leaseValidation.ok) {
        await persistLastLaunchBlock(req.authUser?.userId || '', profileId, {
          code: leaseValidation.code,
          message: leaseValidation.message,
          detail: leaseValidation.detail || null,
        });
        res.status(409).json({
          success: false,
          code: leaseValidation.code,
          error: leaseValidation.message,
          detail: leaseValidation.detail || null,
        });
        return;
      }
    }

    const taskType = actionDefinition.taskType;
    const taskId = randomUUID();
    const idempotencyKey = buildTaskIdempotencyKey(action, profileId, snapshotId);

    await ControlTaskModel.create({
      taskId,
      agentId: selectedAgent.agentId,
      type: taskType,
      status: 'PENDING',
      payload: {
        profileId,
        snapshotId,
        targetUrl,
        activeLeaseId:
          action === 'start'
            ? String((activeLease as { leaseId?: unknown } | null)?.leaseId || '').trim()
            : '',
        proxyAssetId:
          action === 'start'
            ? String((profile as { proxyAssetId?: unknown }).proxyAssetId || '').trim()
            : '',
        leaseValidation: action === 'start' ? leaseValidation : null,
        ipUsageMode:
          action === 'start'
            ? String((profile as { ipUsageMode?: unknown }).ipUsageMode || '').trim()
            : '',
        proxySharingMode:
          action === 'start'
            ? String((proxyAsset as { sharingMode?: unknown } | null)?.sharingMode || '').trim()
            : '',
      },
      idempotencyKey,
      createdByUserId: req.authUser?.userId || '',
      createdByEmail: req.authUser?.email || '',
    });

    await TaskEventModel.create({
      taskId,
      agentId: selectedAgent.agentId,
      status: 'PENDING',
      idempotencyKey,
      detail: {
        profileId,
        snapshotId,
        targetUrl,
        action,
        source: 'duokai-api',
        activeLeaseId: String((activeLease as { leaseId?: unknown } | null)?.leaseId || '').trim(),
        ipUsageMode: String((profile as { ipUsageMode?: unknown }).ipUsageMode || '').trim(),
        leaseValidationCode: leaseValidation?.code || '',
      },
      createdAt: new Date(),
    });

    if (action === 'start') {
      await clearLastLaunchBlock(req.authUser?.userId || '', profileId);
    }

    res.json({
      success: true,
      queued: true,
      taskId,
      agentId: selectedAgent.agentId,
      profileId,
      snapshotId,
      action,
      detail: {
        selectedAgent: {
          staleLockCount: selectedState.staleLockCount,
          lockedCount: selectedState.lockedCount,
          runningCount: selectedState.runningCount,
        },
      },
    });
  }),
);

export default router;
