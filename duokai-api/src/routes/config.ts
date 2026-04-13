import { Router } from 'express';
import {
  deleteConfigProfileForUser,
  findConfigProfileForUser,
  listConfigProfilesForUser,
  normalizeConfigProfilePayload,
  resolveUserConfigStateId,
  updateConfigProfileStorageStateStatusForUser,
  updateConfigProfileWorkspaceSummaryForUser,
  upsertConfigProfileForUser,
} from '../lib/configProfiles.js';
import { asyncHandler } from '../lib/http.js';
import { connectMongo } from '../lib/mongodb.js';
import { normalizeWorkspacePayload } from '../lib/serializers.js';
import { logSyncRouteEvent, resolveProfileIdType } from '../lib/syncRouteLogger.js';
import { requireUser } from '../middlewares/auth.js';
import { AgentConfigStateModel } from '../models/AgentConfigState.js';
import { ConfigSyncEventModel } from '../models/ConfigSyncEvent.js';

const router = Router();

router.use((req, _res, next) => {
  logSyncRouteEvent('info', 'config_router_request_received', {
    route: req.originalUrl,
    method: req.method,
    hasAuthorizationHeader: Boolean(req.headers.authorization),
  });
  next();
});

function buildEmptyGlobalSnapshot() {
  return {
    syncVersion: 0,
    proxies: [],
    templates: [],
    cloudPhones: [],
    settings: {},
  };
}

function normalizeGlobalSettings(input: unknown) {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
}

function normalizeProfilePayload(profileId: string, profile: unknown) {
  if (!profile || typeof profile !== 'object') {
    return null;
  }
  const nextProfile = normalizeConfigProfilePayload(
    profileId,
    profile as Record<string, unknown>
  ) as Record<string, unknown>;
  return {
    ...nextProfile,
    workspace: normalizeWorkspacePayload(profileId, nextProfile.workspace),
  };
}

router.get(
  '/global',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();
    const stateId = resolveUserConfigStateId(req.authUser!.userId);
    const state = await AgentConfigStateModel.findOne({ agentId: stateId }).lean();

    if (!state) {
      res.json({ success: true, snapshot: buildEmptyGlobalSnapshot() });
      return;
    }

    res.json({
      success: true,
      snapshot: {
        syncVersion: Number(state.globalConfigSyncVersion ?? state.syncVersion ?? 0),
        proxies: Array.isArray(state.proxies) ? state.proxies : [],
        templates: Array.isArray(state.templates) ? state.templates : [],
        cloudPhones: Array.isArray(state.cloudPhones) ? state.cloudPhones : [],
        settings: normalizeGlobalSettings(state.settings),
      },
    });
  })
);

router.post(
  '/global',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();

    const stateId = resolveUserConfigStateId(req.authUser!.userId);
    const clientSyncVersion = Number(req.body?.syncVersion || 0);
    const proxies = Array.isArray(req.body?.proxies) ? req.body.proxies : [];
    const templates = Array.isArray(req.body?.templates) ? req.body.templates : [];
    const cloudPhones = Array.isArray(req.body?.cloudPhones) ? req.body.cloudPhones : [];
    const settings = normalizeGlobalSettings(req.body?.settings);

    const current = await AgentConfigStateModel.findOne({ agentId: stateId });
    const currentVersion = Number(current?.globalConfigSyncVersion ?? current?.syncVersion ?? 0);

    if (current && clientSyncVersion !== currentVersion) {
      res.status(409).json({
        success: false,
        error: 'global config sync version mismatch',
        snapshot: {
          syncVersion: currentVersion,
          proxies: Array.isArray(current.proxies) ? current.proxies : [],
          templates: Array.isArray(current.templates) ? current.templates : [],
          cloudPhones: Array.isArray(current.cloudPhones) ? current.cloudPhones : [],
          settings: normalizeGlobalSettings(current.settings),
        },
      });
      return;
    }

    const nextVersion = currentVersion + 1;
    const saved = await AgentConfigStateModel.findOneAndUpdate(
      { agentId: stateId },
      {
        $set: {
          globalConfigSyncVersion: nextVersion,
          proxies,
          templates,
          cloudPhones,
          settings,
        },
        ...(current ? {} : { $setOnInsert: { syncVersion: 0, profiles: [] } }),
      },
      { upsert: true, new: true }
    ).lean();

    res.json({
      success: true,
      syncVersion: Number(saved?.globalConfigSyncVersion ?? nextVersion),
      updatedAt: saved?.updatedAt || new Date(),
    });
  })
);

router.get(
  '/profiles',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();
    const { profiles } = await listConfigProfilesForUser(req.authUser!.userId);
    const normalizedProfiles = profiles
      .map((profile: Record<string, unknown>) =>
        normalizeProfilePayload(String((profile as Record<string, unknown>).id || '').trim(), profile)
      )
      .filter(Boolean);

    logSyncRouteEvent('info', 'config_profile_index_listed', {
      route: 'GET /api/config/profiles',
      userId: req.authUser!.userId,
      count: normalizedProfiles.length,
    });

    res.json({
      success: true,
      profiles: normalizedProfiles,
      count: normalizedProfiles.length,
    });
  })
);

router.get(
  '/profiles/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();
    const profileId = String(req.params.id || '').trim();
    if (!profileId) {
      res.status(400).json({ success: false, error: 'Profile id is required' });
      return;
    }

    const { profile } = await findConfigProfileForUser(req.authUser!.userId, profileId);
    if (!profile) {
      logSyncRouteEvent('warn', 'config_profile_missing', {
        route: 'GET /api/config/profiles/:id',
        profileId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: 'missing',
      });
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    res.json({
      success: true,
      profile: normalizeProfilePayload(profileId, profile),
      syncVersion: Number((profile as Record<string, unknown>).configSyncVersion || 0),
    });
  })
);

router.put(
  '/profiles/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();
    const profileId = String(req.params.id || '').trim();
    if (!profileId) {
      res.status(400).json({ success: false, error: 'Profile id is required' });
      return;
    }

    const incoming = normalizeProfilePayload(profileId, req.body?.profile ?? req.body);
    if (!incoming) {
      res.status(400).json({ success: false, error: 'profile payload is required' });
      return;
    }

    const incomingRecord = incoming as Record<string, unknown>;
    const baseVersion = Number(req.body?.baseVersion ?? incomingRecord.configSyncVersion ?? 0);
    const force = req.body?.force === true;
    if (!Number.isFinite(baseVersion) || baseVersion < 0) {
      res.status(400).json({ success: false, error: 'baseVersion must be a non-negative number' });
      return;
    }

    const { profile } = await findConfigProfileForUser(req.authUser!.userId, profileId);
    const currentVersion = Number((profile as Record<string, unknown> | null)?.configSyncVersion || 0);
    if (!force && profile && currentVersion !== baseVersion) {
      res.status(409).json({
        success: false,
        error: 'profile config sync version mismatch',
        profile: normalizeProfilePayload(profileId, profile),
        syncVersion: currentVersion,
      });
      return;
    }

    const nextVersion = profile ? currentVersion + 1 : 1;
    const savedState = await upsertConfigProfileForUser(req.authUser!.userId, profileId, {
      ...incoming,
      configSyncVersion: nextVersion,
    });
    const { profile: savedProfile } = await findConfigProfileForUser(req.authUser!.userId, profileId);
    logSyncRouteEvent('info', 'config_profile_upserted', {
      route: 'PUT /api/config/profiles/:id',
      profileId,
      profileIdType: resolveProfileIdType(profileId),
      profileSource: 'config',
      syncVersion: nextVersion,
      updatedAt: savedState?.updatedAt || new Date(),
    });

    res.json({
      success: true,
      profile: normalizeProfilePayload(profileId, savedProfile),
      syncVersion: nextVersion,
      updatedAt: savedState?.updatedAt || new Date(),
    });
  })
);

router.delete(
  '/profiles/:id',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();
    const profileId = String(req.params.id || '').trim();
    if (!profileId) {
      res.status(400).json({ success: false, error: 'Profile id is required' });
      return;
    }

    const deleted = await deleteConfigProfileForUser(req.authUser!.userId, profileId);
    if (!deleted) {
      logSyncRouteEvent('warn', 'config_profile_missing', {
        route: 'DELETE /api/config/profiles/:id',
        profileId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: 'missing',
      });
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Profile config deleted successfully',
    });
  })
);

router.post(
  '/profiles/:id/workspace-summary',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();
    const profileId = String(req.params.id || '').trim();
    if (!profileId) {
      res.status(400).json({ success: false, error: 'Profile id is required' });
      return;
    }

    const workspace = normalizeWorkspacePayload(profileId, req.body?.workspace);
    const status = String(req.body?.status || '').trim() || 'synced';
    const message = String(req.body?.message || '').trim() || '环境摘要已同步到云端';
    const updatedAt = String(req.body?.updatedAt || '').trim() || new Date().toISOString();

    const savedState = await updateConfigProfileWorkspaceSummaryForUser(req.authUser!.userId, profileId, {
      workspace,
      status,
      message,
      updatedAt,
    });

    if (!savedState) {
      logSyncRouteEvent('warn', 'config_profile_missing', {
        route: 'POST /api/config/profiles/:id/workspace-summary',
        profileId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: 'missing',
      });
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    logSyncRouteEvent('info', 'config_profile_workspace_summary_updated', {
      route: 'POST /api/config/profiles/:id/workspace-summary',
      profileId,
      profileIdType: resolveProfileIdType(profileId),
      status,
      updatedAt,
    });

    res.json({
      success: true,
      status,
      updatedAt,
    });
  }),
);

router.post(
  '/profiles/:id/storage-state-status',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();
    const profileId = String(req.params.id || '').trim();
    if (!profileId) {
      res.status(400).json({ success: false, error: 'Profile id is required' });
      return;
    }

    const status = String(req.body?.status || '').trim();
    const message = String(req.body?.message || '').trim();
    const updatedAt = String(req.body?.updatedAt || '').trim() || new Date().toISOString();
    const versionRaw = req.body?.version;
    const version =
      versionRaw === undefined || versionRaw === null || versionRaw === ''
        ? undefined
        : Number(versionRaw);
    const deviceId = String(req.body?.deviceId || '').trim();

    if (!status) {
      res.status(400).json({ success: false, error: 'status is required' });
      return;
    }
    if (!updatedAt) {
      res.status(400).json({ success: false, error: 'updatedAt is required' });
      return;
    }
    if (version !== undefined && (!Number.isFinite(version) || version < 0)) {
      res.status(400).json({ success: false, error: 'version must be a non-negative number' });
      return;
    }

    const savedState = await updateConfigProfileStorageStateStatusForUser(
      req.authUser!.userId,
      profileId,
      {
        status,
        message,
        updatedAt,
        ...(version !== undefined ? { version } : {}),
        ...(deviceId ? { deviceId } : {}),
      },
    );

    if (!savedState) {
      logSyncRouteEvent('warn', 'config_profile_missing', {
        route: 'POST /api/config/profiles/:id/storage-state-status',
        profileId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: 'missing',
      });
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    logSyncRouteEvent('info', 'config_profile_storage_state_status_updated', {
      route: 'POST /api/config/profiles/:id/storage-state-status',
      profileId,
      profileIdType: resolveProfileIdType(profileId),
      status,
      updatedAt,
      deviceId,
      version: version ?? null,
    });

    res.json({
      success: true,
      status,
      updatedAt,
    });
  }),
);

router.post(
  '/sync-events',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();

    const scope = String(req.body?.scope || '').trim();
    const direction = String(req.body?.direction || '').trim();
    const mode = String(req.body?.mode || '').trim();
    const status = String(req.body?.status || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();
    const reason = String(req.body?.reason || '').trim();
    const errorMessage = String(req.body?.errorMessage || '').trim();
    const profileIds = Array.isArray(req.body?.profileIds)
      ? req.body.profileIds.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [];

    if (!scope || !direction || !mode || !status) {
      res.status(400).json({ success: false, error: 'scope, direction, mode and status are required' });
      return;
    }

    const created = await ConfigSyncEventModel.create({
      userId: req.authUser!.userId,
      deviceId,
      scope,
      direction,
      mode,
      status,
      profileIds,
      reason,
      errorMessage,
      cloudProfileCount: Number(req.body?.cloudProfileCount || 0),
      localMirroredProfileCount: Number(req.body?.localMirroredProfileCount || 0),
    });

    res.json({
      success: true,
      id: String(created._id),
      createdAt: created.createdAt || new Date(),
    });
  })
);

export default router;
