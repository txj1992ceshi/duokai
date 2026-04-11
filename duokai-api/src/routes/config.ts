import { Router } from 'express';
import {
  deleteConfigProfileForUser,
  findConfigProfileForUser,
  normalizeConfigProfilePayload,
  resolveUserConfigStateId,
  upsertConfigProfileForUser,
} from '../lib/configProfiles.js';
import { asyncHandler } from '../lib/http.js';
import { connectMongo } from '../lib/mongodb.js';
import { normalizeWorkspacePayload } from '../lib/serializers.js';
import { logSyncRouteEvent, resolveProfileIdType } from '../lib/syncRouteLogger.js';
import { requireUser } from '../middlewares/auth.js';
import { AgentConfigStateModel } from '../models/AgentConfigState.js';

const router = Router();

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
    if (!Number.isFinite(baseVersion) || baseVersion < 0) {
      res.status(400).json({ success: false, error: 'baseVersion must be a non-negative number' });
      return;
    }

    const { profile } = await findConfigProfileForUser(req.authUser!.userId, profileId);
    const currentVersion = Number((profile as Record<string, unknown> | null)?.configSyncVersion || 0);
    if (profile && currentVersion !== baseVersion) {
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

export default router;
