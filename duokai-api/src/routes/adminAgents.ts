import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { createRegistrationCode, hashToken } from '../lib/agentAuth.js';
import { isTaskType } from '../lib/agentTypes.js';
import { logAdminAction } from '../lib/audit.js';
import { asyncHandler } from '../lib/http.js';
import { connectMongo } from '../lib/mongodb.js';
import { buildProxyAssetUsageMap, serializeProxyAssetWithUsage } from '../lib/proxyAssetUsage.js';
import { buildRetryTaskPayload, normalizeTaskAttemptCount } from '../lib/taskRetries.js';
import { resolveControlTaskReasonCode } from '../lib/taskResults.js';
import { requireAdmin } from '../middlewares/auth.js';
import { AdminActionLogModel } from '../models/AdminActionLog.js';
import { AgentModel } from '../models/Agent.js';
import { AgentConfigStateModel } from '../models/AgentConfigState.js';
import { AgentSessionModel } from '../models/AgentSession.js';
import { ControlTaskModel } from '../models/ControlTask.js';
import { IpLeaseModel } from '../models/IpLease.js';
import { ProfileModel } from '../models/Profile.js';
import { ProxyAssetModel } from '../models/ProxyAsset.js';
import { TaskEventModel } from '../models/TaskEvent.js';

const router = Router();
const AGENT_ACTIVE_WINDOW_MS = 2 * 60 * 1000;

function resolveEffectiveAgentStatus(item: { status: string; lastSeenAt?: Date | null }) {
  if (item.status === 'DISABLED') {
    return 'DISABLED';
  }
  if (item.lastSeenAt && item.lastSeenAt.getTime() >= Date.now() - AGENT_ACTIVE_WINDOW_MS) {
    return 'ONLINE';
  }
  return 'OFFLINE';
}

router.use(requireAdmin);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    await connectMongo();

    const agents = await AgentModel.find({})
      .sort({ updatedAt: -1 })
      .lean();
    const agentIds = agents.map((item) => item.agentId).filter(Boolean);
    const configStates = await AgentConfigStateModel.find({
      agentId: { $in: agentIds },
    }).lean();
    const configMap = new Map(
      configStates.map((item) => [item.agentId, { syncVersion: item.syncVersion, updatedAt: item.updatedAt }])
    );

    const pendingByAgent = await ControlTaskModel.aggregate([
      { $match: { status: { $in: ['PENDING', 'RECEIVED', 'RUNNING'] } } },
      { $group: { _id: '$agentId', count: { $sum: 1 } } },
    ]);

    const countMap = new Map<string, number>();
    for (const item of pendingByAgent) {
      if (item && typeof item._id === 'string') {
        countMap.set(item._id, Number(item.count || 0));
      }
    }

    res.json({
      success: true,
      agents: agents.map((item) => ({
        id: String(item._id),
        agentId: item.agentId,
        name: item.name || '',
        status: resolveEffectiveAgentStatus({ status: item.status, lastSeenAt: item.lastSeenAt }),
        lastSeenAt: item.lastSeenAt || null,
        updatedAt: item.updatedAt || null,
        pendingTasks: countMap.get(item.agentId) || 0,
        capabilities: Array.isArray(item.capabilities) ? item.capabilities : [],
        hostInfo:
          item.hostInfo && typeof item.hostInfo === 'object' && !Array.isArray(item.hostInfo)
            ? item.hostInfo
            : null,
        runtimeStatus:
          item.runtimeStatus && typeof item.runtimeStatus === 'object' && !Array.isArray(item.runtimeStatus)
            ? item.runtimeStatus
            : null,
        runtimeSummary: {
          runningProfileCount: Array.isArray(item.runtimeStatus?.runningProfileIds)
            ? item.runtimeStatus.runningProfileIds.length
            : 0,
          queuedProfileCount: Array.isArray(item.runtimeStatus?.queuedProfileIds)
            ? item.runtimeStatus.queuedProfileIds.length
            : 0,
          startingProfileCount: Array.isArray(item.runtimeStatus?.startingProfileIds)
            ? item.runtimeStatus.startingProfileIds.length
            : 0,
          effectiveRuntimeMode: String(item.hostInfo?.effectiveRuntimeMode || item.runtimeStatus?.effectiveRuntimeMode || ''),
          supportedRuntimeModes: Array.isArray(item.hostInfo?.supportedRuntimeModes)
            ? item.hostInfo.supportedRuntimeModes
            : Array.isArray(item.runtimeStatus?.supportedRuntimeModes)
              ? item.runtimeStatus.supportedRuntimeModes
              : [],
          degraded: Boolean(item.hostInfo?.degraded || item.runtimeStatus?.degraded),
          degradeReason: String(item.hostInfo?.degradeReason || item.runtimeStatus?.degradeReason || ''),
          lockState: String(item.hostInfo?.lockState || ''),
        },
        syncVersion: Number(configMap.get(item.agentId)?.syncVersion || 0),
        lastConfigSyncedAt: configMap.get(item.agentId)?.updatedAt || null,
      })),
    });
  })
);

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const agentId = String(req.body?.agentId || randomUUID()).trim();
    const name = String(req.body?.name || '').trim();

    if (!agentId) {
      res.status(400).json({ success: false, error: 'agentId is required' });
      return;
    }

    const exists = await AgentModel.findOne({ agentId }).lean();
    if (exists) {
      res.status(409).json({ success: false, error: 'agentId already exists' });
      return;
    }

    const registrationCode = createRegistrationCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    const created = await AgentModel.create({
      agentId,
      name,
      ownerUserId: req.authUser?.userId || '',
      status: 'OFFLINE',
      registrationCodeHash: hashToken(registrationCode),
      registrationCodeExpiresAt: expiresAt,
      registrationCodeUsedAt: null,
      lastSeenAt: null,
    });

    await logAdminAction({
      adminUserId: req.authUser?.userId || '',
      adminEmail: req.authUser?.email || '',
      action: 'agent.register',
      targetType: 'agent',
      targetId: created.agentId,
      targetLabel: created.name || created.agentId,
      detail: { expiresAt },
    });

    res.status(201).json({
      success: true,
      agent: {
        agentId: created.agentId,
        name: created.name || '',
        status: created.status,
      },
      registrationCode,
      registrationCodeExpiresAt: expiresAt,
    });
  })
);

router.post(
  '/:agentId/revoke',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const agentId = String(req.params.agentId || '').trim();
    if (!agentId) {
      res.status(400).json({ success: false, error: 'agentId is required' });
      return;
    }

    const agent = await AgentModel.findOneAndUpdate(
      { agentId },
      {
        $set: {
          status: 'DISABLED',
          registrationCodeHash: '',
          registrationCodeExpiresAt: null,
        },
      },
      { new: true }
    ).lean();

    if (!agent) {
      res.status(404).json({ success: false, error: 'Agent not found' });
      return;
    }

    await AgentSessionModel.updateMany({ agentId, revokedAt: null }, { $set: { revokedAt: new Date() } });

    await logAdminAction({
      adminUserId: req.authUser?.userId || '',
      adminEmail: req.authUser?.email || '',
      action: 'agent.revoke',
      targetType: 'agent',
      targetId: agent.agentId,
      targetLabel: agent.name || agent.agentId,
    });

    res.json({ success: true, agentId: agent.agentId, status: agent.status });
  })
);

router.post(
  '/revoke/batch',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const rawAgentIds = Array.isArray(req.body?.agentIds) ? (req.body.agentIds as unknown[]) : [];
    const agentIds: string[] = [
      ...new Set(rawAgentIds.map((item: unknown) => String(item || '').trim()).filter(Boolean)),
    ];
    if (agentIds.length === 0) {
      res.status(400).json({ success: false, error: 'agentIds are required' });
      return;
    }
    if (agentIds.length > 200) {
      res.status(400).json({ success: false, error: 'agentIds too many, max 200' });
      return;
    }

    const agents = await AgentModel.find({ agentId: { $in: agentIds } }).lean();
    const existingIds = new Set(agents.map((item) => item.agentId));
    const targetIds = agents.map((item) => item.agentId);

    if (targetIds.length > 0) {
      await AgentModel.updateMany(
        { agentId: { $in: targetIds } },
        {
          $set: {
            status: 'DISABLED',
            registrationCodeHash: '',
            registrationCodeExpiresAt: null,
          },
        }
      );
      await AgentSessionModel.updateMany(
        { agentId: { $in: targetIds }, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    }

    const skipped = agentIds
      .filter((agentId) => !existingIds.has(agentId))
      .map((agentId) => ({ agentId, reason: 'AGENT_NOT_FOUND' }));

    await logAdminAction({
      adminUserId: req.authUser?.userId || '',
      adminEmail: req.authUser?.email || '',
      action: 'agent.revoke.batch',
      targetType: 'agent_batch',
      targetId: `batch-${Date.now()}`,
      targetLabel: `${targetIds.length}/${agentIds.length}`,
      detail: {
        requested: agentIds.length,
        revoked: targetIds.length,
        skipped: skipped.length,
      },
    });

    res.json({
      success: true,
      result: {
        requested: agentIds.length,
        revoked: targetIds,
        skipped,
      },
    });
  })
);

router.post(
  '/tasks',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const agentId = String(req.body?.agentId || '').trim();
    const type = String(req.body?.type || '').trim();
    const payload = (req.body?.payload || {}) as Record<string, unknown>;
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    const maxAttempts = normalizeTaskAttemptCount(req.body?.maxAttempts, 1);

    if (!agentId || !type) {
      res.status(400).json({ success: false, error: 'agentId and type are required' });
      return;
    }

    if (!isTaskType(type)) {
      res.status(400).json({ success: false, error: `Unsupported task type: ${type}` });
      return;
    }

    const agent = await AgentModel.findOne({ agentId }).lean();
    if (!agent) {
      res.status(404).json({ success: false, error: 'Agent not found' });
      return;
    }

    if (agent.status === 'DISABLED') {
      res.status(403).json({ success: false, error: 'Agent is disabled' });
      return;
    }

    const taskId = randomUUID();
    let task;

    try {
      task = await ControlTaskModel.create({
        taskId,
        agentId,
        type,
        status: 'PENDING',
        payload,
        idempotencyKey,
        attemptCount: 1,
        maxAttempts,
        retryOfTaskId: '',
        supersededByTaskId: '',
        terminalReasonCode: '',
        createdByUserId: req.authUser?.userId || '',
        createdByEmail: req.authUser?.email || '',
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as { code?: number }).code === 11000) {
        const existing = await ControlTaskModel.findOne({ agentId, idempotencyKey }).lean();
        res.status(200).json({
          success: true,
          duplicate: true,
          task: existing,
        });
        return;
      }
      throw error;
    }

    await TaskEventModel.create({
      taskId,
      agentId,
      status: 'PENDING',
      idempotencyKey,
      detail: { payload },
      createdAt: new Date(),
    });

    await logAdminAction({
      adminUserId: req.authUser?.userId || '',
      adminEmail: req.authUser?.email || '',
      action: 'agent.task.create',
      targetType: 'task',
      targetId: task.taskId,
      targetLabel: `${type}:${agentId}`,
      detail: { agentId, type, idempotencyKey },
    });

    res.status(201).json({
      success: true,
      task: {
        taskId: task.taskId,
        agentId: task.agentId,
        type: task.type,
        status: task.status,
        payload: task.payload,
        idempotencyKey: task.idempotencyKey,
        createdAt: task.createdAt,
      },
    });
  })
);

router.post(
  '/tasks/batch',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const type = String(req.body?.type || '').trim();
    const payload = (req.body?.payload || {}) as Record<string, unknown>;
    const idempotencyKeyPrefix = String(req.body?.idempotencyKeyPrefix || '').trim();
    const rawAgentIds = Array.isArray(req.body?.agentIds) ? (req.body.agentIds as unknown[]) : [];
    const agentIds: string[] = [
      ...new Set(rawAgentIds.map((item: unknown) => String(item || '').trim()).filter(Boolean)),
    ];

    if (!type || agentIds.length === 0) {
      res.status(400).json({ success: false, error: 'type and agentIds are required' });
      return;
    }
    if (agentIds.length > 200) {
      res.status(400).json({ success: false, error: 'agentIds too many, max 200' });
      return;
    }
    if (!isTaskType(type)) {
      res.status(400).json({ success: false, error: `Unsupported task type: ${type}` });
      return;
    }

    const agents = await AgentModel.find({ agentId: { $in: agentIds } }).lean();
    const agentMap = new Map(agents.map((item) => [item.agentId, item]));

    const created: Array<{ taskId: string; agentId: string; status: string }> = [];
    const duplicates: Array<{ taskId: string; agentId: string; status: string }> = [];
    const skipped: Array<{ agentId: string; reason: string }> = [];
    const batchKeyPrefix = idempotencyKeyPrefix || `batch-${Date.now()}`;

    for (const agentId of agentIds) {
      const agent = agentMap.get(agentId);
      if (!agent) {
        skipped.push({ agentId, reason: 'AGENT_NOT_FOUND' });
        continue;
      }
      if (agent.status === 'DISABLED') {
        skipped.push({ agentId, reason: 'AGENT_DISABLED' });
        continue;
      }

      const taskId = randomUUID();
      const idempotencyKey = `${batchKeyPrefix}-${agentId}`;
      try {
        const task = await ControlTaskModel.create({
          taskId,
          agentId,
          type,
          status: 'PENDING',
          payload,
          idempotencyKey,
          createdByUserId: req.authUser?.userId || '',
          createdByEmail: req.authUser?.email || '',
        });

        await TaskEventModel.create({
          taskId: task.taskId,
          agentId: task.agentId,
          status: 'PENDING',
          idempotencyKey,
          detail: { payload },
          createdAt: new Date(),
        });
        created.push({ taskId: task.taskId, agentId: task.agentId, status: String(task.status || '') });
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && (error as { code?: number }).code === 11000) {
          const existing = await ControlTaskModel.findOne({ agentId, idempotencyKey }).lean();
          if (existing) {
            duplicates.push({
              taskId: existing.taskId,
              agentId: existing.agentId,
              status: String(existing.status || ''),
            });
            continue;
          }
        }
        throw error;
      }
    }

    await logAdminAction({
      adminUserId: req.authUser?.userId || '',
      adminEmail: req.authUser?.email || '',
      action: 'agent.task.batch_create',
      targetType: 'task_batch',
      targetId: batchKeyPrefix,
      targetLabel: `${type}:${agentIds.length}`,
      detail: {
        type,
        total: agentIds.length,
        created: created.length,
        duplicates: duplicates.length,
        skipped: skipped.length,
      },
    });

    res.status(201).json({
      success: true,
      result: {
        type,
        total: agentIds.length,
        created,
        duplicates,
        skipped,
      },
    });
  })
);

router.post(
  '/tasks/cancel-stuck',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const runningTimeoutMinutes = Math.max(1, Math.min(24 * 60, Number(req.body?.runningTimeoutMinutes || 10)));
    const filterAgentIds = Array.isArray(req.body?.agentIds)
      ? [...new Set((req.body.agentIds as unknown[]).map((item) => String(item || '').trim()).filter(Boolean))]
      : [];
    const runningBefore = new Date(Date.now() - runningTimeoutMinutes * 60 * 1000);

    const query: Record<string, unknown> = {
      status: 'RUNNING',
      startedAt: { $lte: runningBefore, $ne: null },
    };
    if (filterAgentIds.length > 0) {
      query.agentId = { $in: filterAgentIds };
    }

    const stuckTasks = await ControlTaskModel.find(query).lean();
    const taskIds = stuckTasks.map((item) => item.taskId).filter(Boolean);

    if (taskIds.length === 0) {
      res.json({
        success: true,
        result: {
          runningTimeoutMinutes,
          cancelled: [],
        },
      });
      return;
    }

    await ControlTaskModel.updateMany(
      { taskId: { $in: taskIds } },
      {
        $set: {
          status: 'CANCELLED',
          endedAt: new Date(),
          cancelledByUserId: req.authUser?.userId || '',
        },
      }
    );

    await TaskEventModel.insertMany(
      stuckTasks.map((task) => ({
        taskId: task.taskId,
        agentId: task.agentId,
        status: 'CANCELLED',
        idempotencyKey: '',
        detail: {
          cancelledByUserId: req.authUser?.userId || '',
          cancelledByEmail: req.authUser?.email || '',
          reason: 'STUCK_RUNNING_TIMEOUT',
          runningTimeoutMinutes,
        },
        createdAt: new Date(),
      }))
    );

    await logAdminAction({
      adminUserId: req.authUser?.userId || '',
      adminEmail: req.authUser?.email || '',
      action: 'agent.task.cancel_stuck',
      targetType: 'task_batch',
      targetId: `cancel-stuck-${Date.now()}`,
      targetLabel: `${taskIds.length}`,
      detail: {
        runningTimeoutMinutes,
        cancelled: taskIds.length,
        agentFilterCount: filterAgentIds.length,
      },
    });

    res.json({
      success: true,
      result: {
        runningTimeoutMinutes,
        cancelled: stuckTasks.map((task) => ({
          taskId: task.taskId,
          agentId: task.agentId,
        })),
      },
    });
  })
);

router.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const agentId = String(req.query.agentId || '').trim();
    const status = String(req.query.status || '').trim();
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));

    const query: Record<string, unknown> = {};
    if (agentId) {
      query.agentId = agentId;
    }
    if (status) {
      query.status = status;
    }

    const tasks = await ControlTaskModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();

    res.json({
      success: true,
      tasks: tasks.map((item) => ({
        id: String(item._id),
        taskId: item.taskId,
        agentId: item.agentId,
        type: item.type,
        status: item.status,
        idempotencyKey: item.idempotencyKey,
        payload: item.payload ?? {},
        createdAt: item.createdAt,
        attemptCount: Number(item.attemptCount || 1),
        maxAttempts: Number(item.maxAttempts || 1),
        retryOfTaskId: item.retryOfTaskId || '',
        supersededByTaskId: item.supersededByTaskId || '',
        terminalReasonCode: item.terminalReasonCode || '',
        pulledAt: item.pulledAt,
        startedAt: item.startedAt,
        endedAt: item.endedAt,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
        outputRef: item.outputRef,
        diagnostics: item.diagnostics ?? null,
        createdByUserId: item.createdByUserId || '',
        createdByEmail: item.createdByEmail || '',
        summary: {
          profileId: String((item.payload as Record<string, unknown> | null)?.profileId || '').trim(),
          snapshotId: String((item.payload as Record<string, unknown> | null)?.snapshotId || '').trim(),
          ipUsageMode: String((item.payload as Record<string, unknown> | null)?.ipUsageMode || '').trim(),
          proxySharingMode: String((item.payload as Record<string, unknown> | null)?.proxySharingMode || '').trim(),
          leaseValidationCode: String(
            ((item.payload as Record<string, unknown> | null)?.leaseValidation as Record<string, unknown> | null)
              ?.code || ''
          ).trim(),
          preLaunchDecisionCode: String(
            ((item.payload as Record<string, unknown> | null)?.preLaunchDecision as Record<string, unknown> | null)
              ?.code || ''
          ).trim(),
          preLaunchApproved: Boolean(
            ((item.payload as Record<string, unknown> | null)?.preLaunchDecision as Record<string, unknown> | null)
              ?.approved
          ),
          blockedReasonCode: resolveControlTaskReasonCode({
            status: item.status,
            errorCode: item.errorCode,
            terminalReasonCode: item.terminalReasonCode,
            payload:
              item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
                ? (item.payload as Record<string, unknown>)
                : null,
          }),
        },
      })),
    });
  })
);

router.get(
  '/proxy-usage',
  asyncHandler(async (_req, res) => {
    await connectMongo();

    const [assets, profiles, leases, agents] = await Promise.all([
      ProxyAssetModel.find({}).sort({ updatedAt: -1 }).lean(),
      ProfileModel.find({}).select('_id name proxyAssetId ipUsageMode').lean(),
      IpLeaseModel.find({}).select('proxyAssetId profileId state ipUsageMode').lean(),
      AgentModel.find({}).select('runtimeStatus').lean(),
    ]);
    const runningProfileIds = agents.flatMap((agent) =>
      Array.isArray(agent.runtimeStatus?.runningProfileIds)
        ? agent.runtimeStatus.runningProfileIds
            .map((item: unknown) => String(item || '').trim())
            .filter(Boolean)
        : []
    );
    const usageMap = buildProxyAssetUsageMap(assets, profiles, leases, runningProfileIds);
    const nameMap = new Map(profiles.map((profile) => [String(profile._id), String(profile.name || '').trim()]));

    res.json({
      success: true,
      proxyAssets: assets.map((asset) => {
        const serialized = serializeProxyAssetWithUsage(
          asset as Record<string, unknown>,
          usageMap.get(String(asset._id))
        );
        return {
          ...serialized,
          affectedProfiles: Array.isArray(serialized.affectedProfileIds)
            ? serialized.affectedProfileIds.map((profileId) => ({
                profileId,
                name: nameMap.get(profileId) || profileId,
              }))
            : [],
        };
      }),
    });
  })
);

router.get(
  '/tasks/events',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const agentId = String(req.query.agentId || '').trim();
    const taskId = String(req.query.taskId || '').trim();
    const limit = Math.max(1, Math.min(300, Number(req.query.limit || 100)));

    const query: Record<string, unknown> = {};
    if (agentId) {
      query.agentId = agentId;
    }
    if (taskId) {
      query.taskId = taskId;
    }

    const events = await TaskEventModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({
      success: true,
      events: events.map((item) => ({
        id: String(item._id),
        taskId: item.taskId,
        agentId: item.agentId,
        status: item.status,
        idempotencyKey: item.idempotencyKey,
        detail: item.detail,
        createdAt: item.createdAt,
        summary: {
          profileId: String((item.detail as Record<string, unknown> | null)?.profileId || '').trim(),
          action: String((item.detail as Record<string, unknown> | null)?.action || '').trim(),
          ipUsageMode: String((item.detail as Record<string, unknown> | null)?.ipUsageMode || '').trim(),
          leaseValidationCode: String(
            (item.detail as Record<string, unknown> | null)?.leaseValidationCode || ''
          ).trim(),
          preLaunchDecisionCode: String(
            (item.detail as Record<string, unknown> | null)?.preLaunchDecisionCode || ''
          ).trim(),
        },
      })),
    });
  })
);

router.get(
  '/tasks/failures-summary',
  asyncHandler(async (_req, res) => {
    await connectMongo();
    const failedTasks = await ControlTaskModel.find({ status: 'FAILED' })
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
    const summaryMap = new Map<string, { type: string; reasonCode: string; count: number; lastAt: Date | null }>();

    for (const item of failedTasks) {
      const reasonCode =
        resolveControlTaskReasonCode({
          status: item.status,
          errorCode: item.errorCode,
          terminalReasonCode: item.terminalReasonCode,
          payload:
            item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
              ? (item.payload as Record<string, unknown>)
              : null,
        }) || 'FAILED_UNKNOWN';
      const type = String(item.type || '').trim();
      const key = `${type}:${reasonCode}`;
      const current = summaryMap.get(key) || { type, reasonCode, count: 0, lastAt: null };
      current.count += 1;
      const updatedAt =
        item.updatedAt instanceof Date ? item.updatedAt : item.updatedAt ? new Date(item.updatedAt) : null;
      if (!current.lastAt || ((updatedAt && updatedAt.getTime()) || 0) > current.lastAt.getTime()) {
        current.lastAt = updatedAt;
      }
      summaryMap.set(key, current);
    }

    const failures = [...summaryMap.values()]
      .sort((left, right) => {
        if (left.count !== right.count) {
          return right.count - left.count;
        }
        return (right.lastAt?.getTime() || 0) - (left.lastAt?.getTime() || 0);
      })
      .slice(0, 20);

    res.json({
      success: true,
      failures: failures.map((item) => ({
        type: item.type,
        errorCode: item.reasonCode,
        count: item.count,
        lastAt: item.lastAt,
      })),
    });
  })
);

router.get(
  '/actions/recent',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 50)));
    const rangeHours = Math.max(0, Math.min(24 * 30, Number(req.query.rangeHours || 0)));
    const adminEmail = String(req.query.adminEmail || '').trim().toLowerCase();
    const action = String(req.query.action || '').trim();
    const createdAtQuery =
      rangeHours > 0 ? { $gte: new Date(Date.now() - rangeHours * 60 * 60 * 1000) } : null;
    const allowedActions = new Set([
      'agent.task.batch_create',
      'agent.revoke.batch',
      'agent.task.cancel_stuck',
    ]);

    const query: Record<string, unknown> = {
      action: action && allowedActions.has(action)
        ? action
        : {
            $in: [...allowedActions],
          },
    };
    if (createdAtQuery) {
      query.createdAt = createdAtQuery;
    }
    if (adminEmail) {
      query.adminEmail = adminEmail;
    }

    const actions = await AdminActionLogModel.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      rangeHours,
      adminEmail,
      actions: actions.map((item) => ({
        id: String(item._id),
        adminUserId: String(item.adminUserId || ''),
        adminEmail: item.adminEmail || '',
        action: item.action,
        targetType: item.targetType,
        targetId: item.targetId || '',
        targetLabel: item.targetLabel || '',
        detail: item.detail ?? null,
        createdAt: item.createdAt || null,
      })),
    });
  })
);

router.get(
  '/metrics',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const windowMinutes = Math.max(5, Math.min(24 * 60, Number(req.query.windowMinutes || 60)));
    const runningTimeoutMinutes = Math.max(1, Math.min(24 * 60, Number(req.query.runningTimeoutMinutes || 10)));
    const now = Date.now();
    const windowStart = new Date(now - windowMinutes * 60 * 1000);
    const runningBefore = new Date(now - runningTimeoutMinutes * 60 * 1000);
    const activeSince = new Date(now - 2 * 60 * 1000);

    const [agentTotal, activeAgents, windowTasks, windowSucceeded, windowFailed, windowCancelled, stuckRunning] =
      await Promise.all([
        AgentModel.countDocuments({
          status: { $ne: 'DISABLED' },
          lastSeenAt: { $gte: windowStart },
        }),
        AgentModel.countDocuments({ status: { $ne: 'DISABLED' }, lastSeenAt: { $gte: activeSince } }),
        ControlTaskModel.countDocuments({
          status: { $in: ['SUCCEEDED', 'FAILED', 'CANCELLED'] },
          updatedAt: { $gte: windowStart },
        }),
        ControlTaskModel.countDocuments({
          status: 'SUCCEEDED',
          updatedAt: { $gte: windowStart },
        }),
        ControlTaskModel.countDocuments({
          status: 'FAILED',
          updatedAt: { $gte: windowStart },
        }),
        ControlTaskModel.countDocuments({
          status: 'CANCELLED',
          updatedAt: { $gte: windowStart },
        }),
        ControlTaskModel.countDocuments({
          status: 'RUNNING',
          startedAt: { $lte: runningBefore, $ne: null },
        }),
      ]);

    const heartbeatActiveRate = agentTotal > 0 ? Number(((activeAgents / agentTotal) * 100).toFixed(2)) : 0;
    const taskSuccessRate = windowTasks > 0 ? Number(((windowSucceeded / windowTasks) * 100).toFixed(2)) : 0;

    res.json({
      success: true,
      metrics: {
        windowMinutes,
        runningTimeoutMinutes,
        heartbeat: {
          totalAgents: agentTotal,
          activeAgents,
          activeRatePercent: heartbeatActiveRate,
        },
        tasks: {
          totalFinishedInWindow: windowTasks,
          succeeded: windowSucceeded,
          failed: windowFailed,
          cancelled: windowCancelled,
          successRatePercent: taskSuccessRate,
          stuckRunning,
        },
      },
    });
  })
);

router.get(
  '/health-summary',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const windowMinutes = Math.max(5, Math.min(24 * 60, Number(req.query.windowMinutes || 60)));
    const runningTimeoutMinutes = Math.max(1, Math.min(24 * 60, Number(req.query.runningTimeoutMinutes || 10)));
    const now = Date.now();
    const windowStart = new Date(now - windowMinutes * 60 * 1000);
    const runningBefore = new Date(now - runningTimeoutMinutes * 60 * 1000);

    const [agentRows, finishedByAgentStatus, stuckByAgent, lastTerminalByAgent] = await Promise.all([
      AgentModel.find({}).select({ agentId: 1, status: 1, lastSeenAt: 1 }).lean(),
      ControlTaskModel.aggregate([
        {
          $match: {
            status: { $in: ['SUCCEEDED', 'FAILED', 'CANCELLED'] },
            updatedAt: { $gte: windowStart },
          },
        },
        {
          $group: {
            _id: { agentId: '$agentId', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),
      ControlTaskModel.aggregate([
        {
          $match: {
            status: 'RUNNING',
            startedAt: { $lte: runningBefore, $ne: null },
          },
        },
        {
          $group: {
            _id: '$agentId',
            count: { $sum: 1 },
          },
        },
      ]),
      ControlTaskModel.aggregate([
        { $match: { status: { $in: ['SUCCEEDED', 'FAILED', 'CANCELLED'] } } },
        { $sort: { updatedAt: -1 } },
        {
          $group: {
            _id: '$agentId',
            taskId: { $first: '$taskId' },
            status: { $first: '$status' },
            updatedAt: { $first: '$updatedAt' },
            errorCode: { $first: '$errorCode' },
            errorMessage: { $first: '$errorMessage' },
          },
        },
      ]),
    ]);

    const finishedMap = new Map<string, { succeeded: number; failed: number; cancelled: number }>();
    for (const row of finishedByAgentStatus) {
      const agentId = String(row?._id?.agentId || '');
      const status = String(row?._id?.status || '');
      if (!agentId) continue;
      const current = finishedMap.get(agentId) || { succeeded: 0, failed: 0, cancelled: 0 };
      if (status === 'SUCCEEDED') current.succeeded += Number(row?.count || 0);
      if (status === 'FAILED') current.failed += Number(row?.count || 0);
      if (status === 'CANCELLED') current.cancelled += Number(row?.count || 0);
      finishedMap.set(agentId, current);
    }

    const stuckMap = new Map<string, number>();
    for (const row of stuckByAgent) {
      const agentId = String(row?._id || '');
      if (!agentId) continue;
      stuckMap.set(agentId, Number(row?.count || 0));
    }

    const lastMap = new Map<string, Record<string, unknown>>();
    for (const row of lastTerminalByAgent) {
      const agentId = String(row?._id || '');
      if (!agentId) continue;
      lastMap.set(agentId, {
        taskId: String(row?.taskId || ''),
        status: String(row?.status || ''),
        updatedAt: row?.updatedAt || null,
        errorCode: String(row?.errorCode || ''),
        errorMessage: String(row?.errorMessage || ''),
      });
    }

    const agents = agentRows.map((item) => {
      const agentId = String(item.agentId || '');
      const finished = finishedMap.get(agentId) || { succeeded: 0, failed: 0, cancelled: 0 };
      const totalFinished = finished.succeeded + finished.failed + finished.cancelled;
      const successRatePercent = totalFinished > 0 ? Number(((finished.succeeded / totalFinished) * 100).toFixed(2)) : 0;
      const stuckRunning = Number(stuckMap.get(agentId) || 0);
      const lastTask = lastMap.get(agentId) || null;
      return {
        agentId,
        status: resolveEffectiveAgentStatus({ status: item.status, lastSeenAt: item.lastSeenAt }),
        lastSeenAt: item.lastSeenAt || null,
        windowMinutes,
        finished: {
          total: totalFinished,
          succeeded: finished.succeeded,
          failed: finished.failed,
          cancelled: finished.cancelled,
          successRatePercent,
        },
        stuckRunning,
        lastTask,
      };
    });

    res.json({
      success: true,
      windowMinutes,
      runningTimeoutMinutes,
      agents,
    });
  })
);

router.post(
  '/tasks/:taskId/retry',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const taskId = String(req.params.taskId || '').trim();
    if (!taskId) {
      res.status(400).json({ success: false, error: 'taskId is required' });
      return;
    }

    const task = await ControlTaskModel.findOne({ taskId });
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' });
      return;
    }

    if (!['FAILED', 'CANCELLED'].includes(task.status)) {
      res.status(409).json({ success: false, error: 'Only failed or cancelled tasks can be retried' });
      return;
    }

    const attemptCount = normalizeTaskAttemptCount(task.attemptCount, 1);
    const maxAttempts = normalizeTaskAttemptCount(task.maxAttempts, 1);
    if (attemptCount >= maxAttempts) {
      res.status(409).json({
        success: false,
        error: 'Task has reached maxAttempts and cannot be retried',
        detail: { taskId: task.taskId, attemptCount, maxAttempts },
      });
      return;
    }

    const retryPayload = buildRetryTaskPayload({
      existingTask: {
        taskId: task.taskId,
        agentId: task.agentId,
        type: task.type,
        payload: task.payload && typeof task.payload === 'object' && !Array.isArray(task.payload) ? task.payload : {},
        idempotencyKey: task.idempotencyKey,
        createdByUserId: task.createdByUserId,
        createdByEmail: task.createdByEmail,
        attemptCount,
        maxAttempts,
      },
    });

    const retriedTask = await ControlTaskModel.create(retryPayload);
    task.supersededByTaskId = retriedTask.taskId;
    await task.save();

    await TaskEventModel.create({
      taskId: retriedTask.taskId,
      agentId: retriedTask.agentId,
      status: 'PENDING',
      idempotencyKey: retriedTask.idempotencyKey,
      detail: {
        source: 'admin-retry',
        retryOfTaskId: task.taskId,
        attemptCount: retriedTask.attemptCount,
        maxAttempts: retriedTask.maxAttempts,
      },
      createdAt: new Date(),
    });

    await logAdminAction({
      adminUserId: req.authUser?.userId || '',
      adminEmail: req.authUser?.email || '',
      action: 'agent.task.retry',
      targetType: 'task',
      targetId: retriedTask.taskId,
      targetLabel: `${retriedTask.type}:${retriedTask.agentId}`,
      detail: {
        retryOfTaskId: task.taskId,
        attemptCount: retriedTask.attemptCount,
        maxAttempts: retriedTask.maxAttempts,
      },
    });

    res.status(201).json({
      success: true,
      task: {
        taskId: retriedTask.taskId,
        retryOfTaskId: retriedTask.retryOfTaskId || '',
        attemptCount: retriedTask.attemptCount || 1,
        maxAttempts: retriedTask.maxAttempts || 1,
        status: retriedTask.status,
      },
    });
  })
);

router.post(
  '/tasks/:taskId/cancel',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const taskId = String(req.params.taskId || '').trim();
    if (!taskId) {
      res.status(400).json({ success: false, error: 'taskId is required' });
      return;
    }

    const task = await ControlTaskModel.findOne({ taskId });
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' });
      return;
    }

    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(task.status)) {
      res.json({ success: true, task: { taskId: task.taskId, status: task.status } });
      return;
    }

    task.status = 'CANCELLED';
    task.endedAt = new Date();
    task.cancelledByUserId = req.authUser?.userId || '';
    task.terminalReasonCode = resolveControlTaskReasonCode({
      status: 'CANCELLED',
      errorCode: task.errorCode,
      terminalReasonCode: task.terminalReasonCode,
      payload: task.payload && typeof task.payload === 'object' && !Array.isArray(task.payload) ? task.payload : null,
    });
    await task.save();

    await TaskEventModel.create({
      taskId: task.taskId,
      agentId: task.agentId,
      status: 'CANCELLED',
      idempotencyKey: '',
      detail: {
        cancelledByUserId: req.authUser?.userId || '',
        cancelledByEmail: req.authUser?.email || '',
      },
      createdAt: new Date(),
    });

    await logAdminAction({
      adminUserId: req.authUser?.userId || '',
      adminEmail: req.authUser?.email || '',
      action: 'agent.task.cancel',
      targetType: 'task',
      targetId: task.taskId,
      targetLabel: `${task.type}:${task.agentId}`,
    });

    res.json({ success: true, task: { taskId: task.taskId, status: task.status } });
  })
);

export default router;
