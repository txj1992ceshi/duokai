import { setTimeout as sleep } from 'node:timers/promises';
import { Router } from 'express';
import {
  createSessionId,
  hashToken,
  signAgentAccessToken,
  signAgentRefreshToken,
  verifyAgentRefreshToken,
} from '../lib/agentAuth.js';
import {
  canTransitionTaskStatus,
  isTerminalTaskStatus,
  validateAckPayload,
  validateHeartbeatPayload,
} from '../lib/agentProtocol.js';
import { asyncHandler } from '../lib/http.js';
import { connectMongo } from '../lib/mongodb.js';
import { requireAgent, requireAgentProtocolV1 } from '../middlewares/agentAuth.js';
import { AgentModel } from '../models/Agent.js';
import { AgentSessionModel } from '../models/AgentSession.js';
import { AgentConfigStateModel } from '../models/AgentConfigState.js';
import { ControlTaskModel } from '../models/ControlTask.js';
import { TaskEventModel } from '../models/TaskEvent.js';

const router = Router();
const PUSH_MODES = new Set(['replace', 'merge']);
const MAX_CONFIG_ITEMS_PER_COLLECTION = 5000;
const MAX_SETTINGS_KEYS = 500;

const PROFILE_KEYS = [
  'id',
  'name',
  'proxyId',
  'groupName',
  'tags',
  'notes',
  'fingerprintConfig',
  'status',
  'lastStartedAt',
  'createdAt',
  'updatedAt',
] as const;
const PROXY_KEYS = [
  'id',
  'name',
  'type',
  'host',
  'port',
  'username',
  'password',
  'status',
  'lastCheckedAt',
  'createdAt',
  'updatedAt',
] as const;
const TEMPLATE_KEYS = [
  'id',
  'name',
  'proxyId',
  'groupName',
  'tags',
  'notes',
  'fingerprintConfig',
  'createdAt',
  'updatedAt',
] as const;
const CLOUD_PHONE_KEYS = [
  'id',
  'name',
  'groupName',
  'tags',
  'notes',
  'platform',
  'providerKey',
  'providerKind',
  'providerConfig',
  'providerInstanceId',
  'computeType',
  'status',
  'lastSyncedAt',
  'ipLookupChannel',
  'proxyType',
  'ipProtocol',
  'proxyHost',
  'proxyPort',
  'proxyUsername',
  'proxyPassword',
  'udpEnabled',
  'fingerprintSettings',
  'createdAt',
  'updatedAt',
] as const;

function pickAllowedObject(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in obj) {
      out[key] = obj[key];
    }
  }
  const id = String(out.id || '').trim();
  if (!id) {
    return null;
  }
  out.id = id;
  return out;
}

function sanitizeCollection(items: unknown[], keys: readonly string[]) {
  return items
    .map((item) => pickAllowedObject(item, keys))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function mergeById(existing: unknown[], incoming: unknown[]) {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of existing) {
    if (item && typeof item === 'object' && 'id' in item) {
      const id = String((item as { id?: unknown }).id || '').trim();
      if (id) {
        map.set(id, { ...(item as Record<string, unknown>) });
      }
    }
  }
  for (const item of incoming) {
    if (item && typeof item === 'object' && 'id' in item) {
      const id = String((item as { id?: unknown }).id || '').trim();
      if (!id) continue;
      const previous = map.get(id) || {};
      map.set(id, { ...previous, ...(item as Record<string, unknown>) });
    }
  }
  return [...map.values()];
}

async function findPendingTask(agentId: string) {
  const now = new Date();
  const task = await ControlTaskModel.findOneAndUpdate(
    { agentId, status: 'PENDING' },
    { $set: { status: 'RECEIVED', pulledAt: now } },
    {
      sort: { createdAt: 1 },
      new: true,
    }
  );

  if (!task) {
    return null;
  }

  await TaskEventModel.create({
    taskId: task.taskId,
    agentId,
    status: 'RECEIVED',
    idempotencyKey: '',
    detail: { pulledAt: now },
    createdAt: now,
  });

  return task;
}

router.post(
  '/auth/token',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const protocol = String(req.header('x-agent-protocol-version') || '').trim();
    if (protocol !== '1') {
      res.status(400).json({ success: false, error: 'Unsupported agent protocol version' });
      return;
    }

    const agentId = String(req.body?.agentId || '').trim();
    const registrationCode = String(req.body?.registrationCode || '').trim();
    const refreshToken = String(req.body?.refreshToken || '').trim();

    if (!agentId) {
      res.status(400).json({ success: false, error: 'agentId is required' });
      return;
    }

    const agent = await AgentModel.findOne({ agentId });
    if (!agent) {
      res.status(404).json({ success: false, error: 'Agent not found' });
      return;
    }

    if (agent.status === 'DISABLED') {
      res.status(403).json({ success: false, error: 'Agent is disabled' });
      return;
    }

    if (refreshToken) {
      let refreshPayload: ReturnType<typeof verifyAgentRefreshToken>;
      try {
        refreshPayload = verifyAgentRefreshToken(refreshToken);
      } catch {
        res.status(401).json({ success: false, error: 'Invalid refresh token' });
        return;
      }

      if (
        refreshPayload.tokenType !== 'agent_refresh' ||
        refreshPayload.agentId !== agentId ||
        !refreshPayload.sessionId
      ) {
        res.status(401).json({ success: false, error: 'Invalid refresh token payload' });
        return;
      }

      const session = await AgentSessionModel.findOne({
        sessionId: refreshPayload.sessionId,
        agentId,
        revokedAt: null,
      });

      if (!session || session.expiresAt.getTime() <= Date.now()) {
        res.status(401).json({ success: false, error: 'Refresh session expired' });
        return;
      }

      if (session.refreshTokenHash !== hashToken(refreshToken)) {
        await AgentSessionModel.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });
        res.status(401).json({ success: false, error: 'Refresh token mismatch' });
        return;
      }

      const nextRefreshToken = signAgentRefreshToken({ agentId, sessionId: session.sessionId });
      session.refreshTokenHash = hashToken(nextRefreshToken);
      session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await session.save();

      const accessToken = signAgentAccessToken({ agentId, sessionId: session.sessionId });
      res.json({
        success: true,
        accessToken,
        refreshToken: nextRefreshToken,
        expiresInSec: 20 * 60,
      });
      return;
    }

    if (!registrationCode) {
      res.status(400).json({ success: false, error: 'registrationCode or refreshToken is required' });
      return;
    }

    if (
      !agent.registrationCodeHash ||
      agent.registrationCodeHash !== hashToken(registrationCode) ||
      !agent.registrationCodeExpiresAt ||
      agent.registrationCodeExpiresAt.getTime() <= Date.now()
    ) {
      res.status(401).json({ success: false, error: 'Registration code invalid or expired' });
      return;
    }

    const sessionId = createSessionId();
    const accessToken = signAgentAccessToken({ agentId, sessionId });
    const nextRefreshToken = signAgentRefreshToken({ agentId, sessionId });

    await AgentSessionModel.create({
      sessionId,
      agentId,
      refreshTokenHash: hashToken(nextRefreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revokedAt: null,
    });

    agent.registrationCodeUsedAt = new Date();
    agent.status = 'ONLINE';
    agent.lastSeenAt = new Date();
    await agent.save();

    res.json({
      success: true,
      accessToken,
      refreshToken: nextRefreshToken,
      expiresInSec: 20 * 60,
    });
  })
);

router.use(requireAgentProtocolV1);
router.use(requireAgent);

router.post(
  '/heartbeat',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const agentId = req.agentAuth!.agentId;
    const input = validateHeartbeatPayload((req.body || {}) as Record<string, unknown>);

    const updated = await AgentModel.findOneAndUpdate(
      { agentId, status: { $ne: 'DISABLED' } },
      {
        $set: {
          status: 'ONLINE',
          lastSeenAt: new Date(),
          agentVersion: input.agentVersion,
          capabilities: input.capabilities,
          hostInfo: input.hostInfo,
          runtimeStatus: input.runtimeStatus,
        },
      },
      { new: true }
    ).lean();

    if (!updated) {
      res.status(403).json({ success: false, error: 'Agent disabled or missing' });
      return;
    }

    res.json({ success: true, serverTime: new Date().toISOString() });
  })
);

router.post(
  '/tasks/pull',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const agentId = req.agentAuth!.agentId;
    const timeoutMs = Math.max(1000, Math.min(25000, Number(req.body?.timeoutMs || 12000)));
    const tickMs = 1000;
    const started = Date.now();

    while (Date.now() - started <= timeoutMs) {
      const task = await findPendingTask(agentId);
      if (task) {
        res.json({
          success: true,
          task: {
            taskId: task.taskId,
            type: task.type,
            status: task.status,
            payload: task.payload,
            idempotencyKey: task.idempotencyKey,
            createdAt: task.createdAt,
          },
        });
        return;
      }
      await sleep(tickMs);
    }

    res.json({ success: true, task: null });
  })
);

router.post(
  '/tasks/:taskId/ack',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const agentId = req.agentAuth!.agentId;
    const taskId = String(req.params.taskId || '').trim();
    const validated = validateAckPayload((req.body || {}) as Record<string, unknown>);

    if (!taskId) {
      res.status(400).json({ success: false, error: 'taskId is required' });
      return;
    }
    if (!validated.ok) {
      res.status(400).json({ success: false, error: validated.error });
      return;
    }
    const { status, idempotencyKey, errorCode, errorMessage, outputRef, diagnostics, startedAt, endedAt } =
      validated.value;

    const task = await ControlTaskModel.findOne({ taskId, agentId });
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found for this agent' });
      return;
    }

    if (idempotencyKey) {
      const duplicate = await TaskEventModel.findOne({ taskId, status, idempotencyKey }).lean();
      if (duplicate) {
        res.json({ success: true, duplicate: true, task: { taskId: task.taskId, status: task.status } });
        return;
      }
    }

    const previousStatus = task.status;
    if (!canTransitionTaskStatus(previousStatus, status)) {
      res.status(409).json({
        success: false,
        error: `Illegal task status transition: ${previousStatus} -> ${status}`,
      });
      return;
    }
    if (isTerminalTaskStatus(previousStatus) && previousStatus !== status) {
      res.status(409).json({
        success: false,
        error: `Task already terminal: ${previousStatus}`,
      });
      return;
    }

    if (status === 'RUNNING') {
      task.startedAt =
        startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : task.startedAt || new Date();
    }
    if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED') {
      task.endedAt = endedAt && !Number.isNaN(endedAt.getTime()) ? endedAt : new Date();
    }

    task.status = status;
    task.errorCode = errorCode;
    task.errorMessage = errorMessage;
    task.outputRef = outputRef;
    task.diagnostics = diagnostics;
    await task.save();

    await TaskEventModel.create({
      taskId,
      agentId,
      status,
      idempotencyKey,
      detail: {
        startedAt: startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null,
        endedAt: endedAt && !Number.isNaN(endedAt.getTime()) ? endedAt : null,
        errorCode,
        errorMessage,
        outputRef,
        diagnostics,
      },
      createdAt: new Date(),
    });

    res.json({ success: true, task: { taskId: task.taskId, status: task.status } });
  })
);

router.get(
  '/config/snapshot',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const agentId = req.agentAuth!.agentId;

    const state = await AgentConfigStateModel.findOne({ agentId }).lean();
    if (!state) {
      res.json({
        success: true,
        snapshot: {
          syncVersion: 0,
          profiles: [],
          proxies: [],
          templates: [],
          cloudPhones: [],
          settings: {},
        },
      });
      return;
    }

    res.json({
      success: true,
      snapshot: {
        syncVersion: Number(state.syncVersion || 0),
        profiles: Array.isArray(state.profiles) ? state.profiles : [],
        proxies: Array.isArray(state.proxies) ? state.proxies : [],
        templates: Array.isArray(state.templates) ? state.templates : [],
        cloudPhones: Array.isArray(state.cloudPhones) ? state.cloudPhones : [],
        settings:
          state.settings && typeof state.settings === 'object'
            ? state.settings
            : {},
      },
    });
  })
);

router.post(
  '/config/push',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const agentId = req.agentAuth!.agentId;
    const clientSyncVersion = Number(req.body?.syncVersion || 0);

    const profiles = Array.isArray(req.body?.profiles) ? req.body.profiles : [];
    const proxies = Array.isArray(req.body?.proxies) ? req.body.proxies : [];
    const templates = Array.isArray(req.body?.templates) ? req.body.templates : [];
    const cloudPhones = Array.isArray(req.body?.cloudPhones) ? req.body.cloudPhones : [];
    const mode = String(req.body?.mode || 'replace').trim().toLowerCase();
    const settings =
      req.body?.settings && typeof req.body.settings === 'object'
        ? (req.body.settings as Record<string, unknown>)
        : {};
    const safeProfiles = sanitizeCollection(profiles, PROFILE_KEYS);
    const safeProxies = sanitizeCollection(proxies, PROXY_KEYS);
    const safeTemplates = sanitizeCollection(templates, TEMPLATE_KEYS);
    const safeCloudPhones = sanitizeCollection(cloudPhones, CLOUD_PHONE_KEYS);

    if (!PUSH_MODES.has(mode)) {
      res.status(400).json({ success: false, error: `invalid mode: ${mode}` });
      return;
    }
    if (
      safeProfiles.length > MAX_CONFIG_ITEMS_PER_COLLECTION ||
      safeProxies.length > MAX_CONFIG_ITEMS_PER_COLLECTION ||
      safeTemplates.length > MAX_CONFIG_ITEMS_PER_COLLECTION ||
      safeCloudPhones.length > MAX_CONFIG_ITEMS_PER_COLLECTION
    ) {
      res.status(413).json({ success: false, error: 'config payload too large' });
      return;
    }
    if (Object.keys(settings).length > MAX_SETTINGS_KEYS) {
      res.status(413).json({ success: false, error: 'settings payload too large' });
      return;
    }

    const current = await AgentConfigStateModel.findOne({ agentId });
    const currentVersion = Number(current?.syncVersion || 0);
    if (current && clientSyncVersion !== currentVersion) {
      res.status(409).json({
        success: false,
        error: 'sync version mismatch',
        snapshot: {
          syncVersion: currentVersion,
          profiles: Array.isArray(current.profiles) ? current.profiles : [],
          proxies: Array.isArray(current.proxies) ? current.proxies : [],
          templates: Array.isArray(current.templates) ? current.templates : [],
          cloudPhones: Array.isArray(current.cloudPhones) ? current.cloudPhones : [],
          settings:
            current.settings && typeof current.settings === 'object'
              ? current.settings
              : {},
        },
      });
      return;
    }

    const nextVersion = currentVersion + 1;
    const nextProfiles =
      mode === 'merge'
        ? mergeById(Array.isArray(current?.profiles) ? current!.profiles : [], safeProfiles)
        : safeProfiles;
    const nextProxies =
      mode === 'merge'
        ? mergeById(Array.isArray(current?.proxies) ? current!.proxies : [], safeProxies)
        : safeProxies;
    const nextTemplates =
      mode === 'merge'
        ? mergeById(Array.isArray(current?.templates) ? current!.templates : [], safeTemplates)
        : safeTemplates;
    const nextCloudPhones =
      mode === 'merge'
        ? mergeById(Array.isArray(current?.cloudPhones) ? current!.cloudPhones : [], safeCloudPhones)
        : safeCloudPhones;
    const nextSettings =
      mode === 'merge'
        ? {
            ...(current?.settings && typeof current.settings === 'object'
              ? (current.settings as Record<string, unknown>)
              : {}),
            ...settings,
          }
        : settings;

    const saved = await AgentConfigStateModel.findOneAndUpdate(
      { agentId },
      {
        $set: {
          syncVersion: nextVersion,
          profiles: nextProfiles,
          proxies: nextProxies,
          templates: nextTemplates,
          cloudPhones: nextCloudPhones,
          settings: nextSettings,
        },
      },
      { upsert: true, new: true }
    ).lean();

    res.json({
      success: true,
      syncVersion: Number(saved?.syncVersion || nextVersion),
      updatedAt: saved?.updatedAt || new Date(),
    });
  })
);

export default router;
