import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  buildTaskIdempotencyKey,
  getControlActionDefinition,
  normalizeControlPlaneAction,
} from '../lib/controlTasks.js';
import {
  ACTIVE_CONTROL_TASK_STATUSES,
  evaluateProfilePreLaunch,
  resolveDuplicateTaskBlock,
  selectAgentForAction,
  validateAgentRuntimeModeSupport,
  validateStartWithLease,
} from '../lib/controlPlaneDecision.js';
import { normalizeRuntimeMode } from '../lib/runtimeModes.js';
import { asyncHandler } from '../lib/http.js';
import { connectMongo } from '../lib/mongodb.js';
import { getDefaultPlatformPolicy } from '../lib/platformPolicies.js';
import { resolveRuntimeProfileForUser, updateRuntimeProfileFieldsForUser } from '../lib/runtimeProfiles.js';
import { requireUser } from '../middlewares/auth.js';
import { AgentModel } from '../models/Agent.js';
import { ControlTaskModel } from '../models/ControlTask.js';
import { IpLeaseModel } from '../models/IpLease.js';
import { PlatformPolicyModel } from '../models/PlatformPolicy.js';
import { ProxyAssetModel } from '../models/ProxyAsset.js';
import { TaskEventModel } from '../models/TaskEvent.js';

const router = Router();

async function persistLastLaunchBlock(
  userId: string,
  profileId: string,
  payload: { code: string; message: string; detail?: unknown }
) {
  await updateRuntimeProfileFieldsForUser(userId, profileId, {
    lastLaunchBlock: {
      code: payload.code,
      message: payload.message,
      detail: payload.detail || null,
      blockedAt: new Date().toISOString(),
    },
  });
}

async function clearLastLaunchBlock(userId: string, profileId: string) {
  await updateRuntimeProfileFieldsForUser(userId, profileId, {
    lastLaunchBlock: null,
  });
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

    const resolvedProfile = await resolveRuntimeProfileForUser(req.authUser?.userId || '', profileId);
    const profile = resolvedProfile?.profile || null;
    const resolvedProfileId = resolvedProfile?.profileId || profileId;

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const preLaunchDecision = action === 'start' ? evaluateProfilePreLaunch(profile) : null;
    if (preLaunchDecision && !preLaunchDecision.ok) {
      await persistLastLaunchBlock(req.authUser?.userId || '', resolvedProfileId, {
        code: preLaunchDecision.code,
        message: preLaunchDecision.message,
        detail: preLaunchDecision.detail || null,
      });
      res.status(409).json({
        success: false,
        code: preLaunchDecision.code,
        error: preLaunchDecision.message,
        detail: preLaunchDecision.detail || null,
      });
      return;
    }

    const taskType = actionDefinition.taskType;
    const duplicateTask = await ControlTaskModel.findOne({
      createdByUserId: req.authUser?.userId || '',
      type: taskType,
      status: { $in: [...ACTIVE_CONTROL_TASK_STATUSES] },
      'payload.profileId': resolvedProfileId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const duplicateTaskBlock =
      action === 'start' || action === 'stop'
        ? resolveDuplicateTaskBlock({
            action,
            profileId: resolvedProfileId,
            duplicateTask: duplicateTask as Record<string, unknown> | null,
          })
        : null;
    if (duplicateTaskBlock) {
      if (action === 'start') {
        await persistLastLaunchBlock(req.authUser?.userId || '', resolvedProfileId, {
          code: duplicateTaskBlock.code,
          message: duplicateTaskBlock.message,
          detail: duplicateTaskBlock.detail || null,
        });
      }
      res.status(409).json({
        success: false,
        code: duplicateTaskBlock.code,
        error: duplicateTaskBlock.message,
        detail: duplicateTaskBlock.detail || null,
      });
      return;
    }

    const agents = await AgentModel.find({
      ownerUserId: req.authUser?.userId || '',
      status: { $ne: 'DISABLED' },
    })
      .sort({ lastSeenAt: -1, updatedAt: -1 })
      .lean();
    const requiredCapability = actionDefinition.requiredCapability;
    const { selectedAgent, onlineAgents, capableAgents, selectedState } = selectAgentForAction({
      agents,
      profileId: resolvedProfileId,
      requiredCapability,
    });

    if (!selectedAgent) {
      if (action === 'start') {
        await persistLastLaunchBlock(req.authUser?.userId || '', resolvedProfileId, {
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

    const requestedRuntimeMode = normalizeRuntimeMode((profile as { runtimeMode?: unknown }).runtimeMode);
    const agentRuntimeModeDecision =
      action === 'start'
        ? validateAgentRuntimeModeSupport({
            profile,
            agent: selectedAgent,
          })
        : null;
    if (agentRuntimeModeDecision && !agentRuntimeModeDecision.ok) {
      await persistLastLaunchBlock(req.authUser?.userId || '', resolvedProfileId, {
        code: agentRuntimeModeDecision.code,
        message: agentRuntimeModeDecision.message,
        detail: agentRuntimeModeDecision.detail || null,
      });
      res.status(409).json({
        success: false,
        code: agentRuntimeModeDecision.code,
        error: agentRuntimeModeDecision.message,
        detail: agentRuntimeModeDecision.detail || null,
      });
      return;
    }

    const runningProfileIds = selectedState?.runningProfileIds || [];
    if (action === 'start' && runningProfileIds.includes(resolvedProfileId)) {
      await clearLastLaunchBlock(req.authUser?.userId || '', resolvedProfileId);
      res.json({
        success: true,
        duplicate: true,
        alreadyRunning: true,
        agentId: selectedAgent.agentId,
        detail: {
          selectedAgent: {
            staleLockCount: selectedState?.staleLockCount || 0,
            lockedCount: selectedState?.lockedCount || 0,
            runningCount: selectedState?.runningCount || 0,
          },
        },
      });
      return;
    }

    if (action === 'start' && (selectedState?.lockedProfileIds || []).includes(resolvedProfileId)) {
      await persistLastLaunchBlock(req.authUser?.userId || '', resolvedProfileId, {
        code: 'RUNTIME_LOCK_EXISTS',
        message: '目标 Profile 当前存在本机运行锁，暂时不能重复启动',
        detail: {
          agentId: selectedAgent.agentId,
          lockedProfileIds: selectedState?.lockedProfileIds || [],
          staleLockProfileIds: selectedState?.staleLockProfileIds || [],
        },
      });
      res.status(409).json({
        success: false,
        code: 'RUNTIME_LOCK_EXISTS',
        error: '目标 Profile 当前存在本机运行锁，暂时不能重复启动',
        detail: {
          agentId: selectedAgent.agentId,
          lockedProfileIds: selectedState?.lockedProfileIds || [],
          staleLockProfileIds: selectedState?.staleLockProfileIds || [],
        },
      });
      return;
    }

    let leaseValidation = null;
    let activeLease: Record<string, unknown> | null = null;
    let proxyAsset: Record<string, unknown> | null = null;
    let platformPolicy: Record<string, unknown> | null = null;

    if (action === 'start') {
      activeLease = await IpLeaseModel.findOne({
        userId: req.authUser?.userId || '',
        profileId: resolvedProfileId,
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

      const runningProfileIds = Array.from(new Set(capableAgents.flatMap((agent) => agent.runtimeStatus?.runningProfileIds || [])))
        .map((item) => String(item || '').trim())
        .filter(Boolean);

      leaseValidation = validateStartWithLease({
        profile,
        activeLease,
        conflictingLeases: conflictingLeases as Record<string, unknown>[],
        proxyAsset: proxyAsset as Record<string, unknown> | null,
        platformPolicy: platformPolicy as Record<string, unknown> | null,
        runningProfileIds,
      });
      if (!leaseValidation.ok) {
        await persistLastLaunchBlock(req.authUser?.userId || '', resolvedProfileId, {
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

    const taskId = randomUUID();
    const idempotencyKey = buildTaskIdempotencyKey(action, resolvedProfileId, snapshotId);

    await ControlTaskModel.create({
      taskId,
      agentId: selectedAgent.agentId,
      type: taskType,
      status: 'PENDING',
      payload: {
        profileId: resolvedProfileId,
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
        runtimeMode: action === 'start' ? requestedRuntimeMode : '',
        proxySharingMode:
          action === 'start'
            ? String((proxyAsset as { sharingMode?: unknown } | null)?.sharingMode || '').trim()
            : '',
        preLaunchDecision:
          action === 'start'
            ? {
                approved: true,
                code: preLaunchDecision?.code || 'APPROVED',
                message: preLaunchDecision?.message || 'Approved by control-plane pre-launch checks.',
                detail: preLaunchDecision?.detail || null,
              }
            : {
                approved: true,
                code: 'APPROVED',
                message: 'Approved by control-plane stop checks.',
                detail: null,
              },
      },
      idempotencyKey,
      attemptCount: 1,
      maxAttempts: 1,
      retryOfTaskId: '',
      supersededByTaskId: '',
      terminalReasonCode: '',
      createdByUserId: req.authUser?.userId || '',
      createdByEmail: req.authUser?.email || '',
    });

    await TaskEventModel.create({
      taskId,
      agentId: selectedAgent.agentId,
      status: 'PENDING',
      idempotencyKey,
      detail: {
        profileId: resolvedProfileId,
        snapshotId,
        targetUrl,
        action,
        source: 'duokai-api',
        activeLeaseId: String((activeLease as { leaseId?: unknown } | null)?.leaseId || '').trim(),
        ipUsageMode: String((profile as { ipUsageMode?: unknown }).ipUsageMode || '').trim(),
        runtimeMode: requestedRuntimeMode,
        leaseValidationCode: leaseValidation?.code || '',
        preLaunchDecisionCode: action === 'start' ? preLaunchDecision?.code || 'APPROVED' : 'APPROVED',
      },
      createdAt: new Date(),
    });

    if (action === 'start') {
      await clearLastLaunchBlock(req.authUser?.userId || '', resolvedProfileId);
    }

    res.json({
      success: true,
      queued: true,
      taskId,
      agentId: selectedAgent.agentId,
      profileId: resolvedProfileId,
      snapshotId,
      action,
      detail: {
        selectedAgent: {
          staleLockCount: selectedState?.staleLockCount || 0,
          lockedCount: selectedState?.lockedCount || 0,
          runningCount: selectedState?.runningCount || 0,
        },
        preLaunchDecisionCode: action === 'start' ? preLaunchDecision?.code || 'APPROVED' : 'APPROVED',
        runtimeMode: requestedRuntimeMode,
      },
    });
  }),
);

export default router;
