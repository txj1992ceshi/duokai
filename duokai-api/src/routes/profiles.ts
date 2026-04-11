import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import {
  findConfigProfileForUser,
  isMongoObjectId,
  updateConfigProfileForUser,
} from '../lib/configProfiles.js';
import { asyncHandler } from '../lib/http.js';
import { normalizeRuntimeMode } from '../lib/runtimeModes.js';
import { resolveRuntimeProfileForUser } from '../lib/runtimeProfiles.js';
import { normalizeWorkspacePayload, serializeProfile } from '../lib/serializers.js';
import { logSyncRouteEvent, resolveProfileIdType } from '../lib/syncRouteLogger.js';
import { resolveDefaultIpUsageMode } from '../lib/platformPolicies.js';
import { requireUser } from '../middlewares/auth.js';
import { ProfileModel } from '../models/Profile.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';

const router = Router();

router.use(requireUser);

function normalizeCooldownSummary(input: unknown) {
  if (!input || typeof input !== 'object') {
    return { active: false, reason: '', until: '' };
  }
  const source = input as Record<string, unknown>;
  return {
    active: !!source.active,
    reason: String(source.reason || '').trim(),
    until: String(source.until || '').trim(),
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;

    const profiles = await ProfileModel.find({ userId: authUser.userId })
      .sort({ createdAt: -1 })
      .lean();

    const storageStates = await ProfileStorageStateModel.find({ userId: authUser.userId })
      .select('profileId')
      .lean();
    const syncedProfileIds = new Set(storageStates.map((item) => String(item.profileId)));

    res.json({
      success: true,
      profiles: profiles.map((profile) =>
        serializeProfile(profile, syncedProfileIds.has(String(profile._id)))
      ),
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const body = req.body || {};

    const profile = await ProfileModel.create({
      userId: authUser.userId,
      name: String(body.name || 'New Profile').trim(),
      platform: String(body.platform || body.startupPlatform || '').trim(),
      purpose: String(body.purpose || body.environmentPurpose || 'operation').trim() || 'operation',
      runtimeMode: normalizeRuntimeMode(body.runtimeMode),
      proxyBindingMode: String(body.proxyBindingMode || 'dedicated').trim() || 'dedicated',
      ipUsageMode:
        String(
          body.ipUsageMode ||
            resolveDefaultIpUsageMode(
              String(body.purpose || body.environmentPurpose || 'operation').trim() || 'operation'
            )
        ).trim() || 'dedicated',
      lifecycleState: String(body.lifecycleState || 'draft').trim() || 'draft',
      riskFlags: Array.isArray(body.riskFlags) ? body.riskFlags : [],
      cooldownSummary: normalizeCooldownSummary(body.cooldownSummary),
      fingerprintPresetRef: String(body.fingerprintPresetRef || '').trim(),
      workspaceManifestRef: String(body.workspaceManifestRef || '').trim(),
      proxyAssetId: String(body.proxyAssetId || '').trim(),
      activeLeaseId: String(body.activeLeaseId || '').trim(),
      ownerLabel: String(body.ownerLabel || '').trim(),
      status: body.status || 'Ready',
      lastActive: body.lastActive || '',
      lastLaunchAt: String(body.lastLaunchAt || '').trim(),
      lastSuccessAt: String(body.lastSuccessAt || '').trim(),
      lastRestoreAt: String(body.lastRestoreAt || '').trim(),
      tags: Array.isArray(body.tags) ? body.tags : [],
      proxy: body.proxy || '',
      proxyType: body.proxyType || 'direct',
      proxyHost: body.proxyHost || '',
      proxyPort: body.proxyPort || '',
      proxyUsername: body.proxyUsername || '',
      proxyPassword: body.proxyPassword || '',
      expectedProxyIp: body.expectedProxyIp || '',
      expectedProxyCountry: body.expectedProxyCountry || '',
      expectedProxyRegion: body.expectedProxyRegion || '',
      preferredProxyTransport: body.preferredProxyTransport || '',
      lastResolvedProxyTransport: body.lastResolvedProxyTransport || '',
      lastHostEnvironment: body.lastHostEnvironment || '',
      ua: body.ua || '',
      seed: body.seed || '',
      isMobile: !!body.isMobile,
      groupId: body.groupId || '',
      runtimeSessionId: body.runtimeSessionId || '',
      startupPlatform: body.startupPlatform || '',
      startupUrl: body.startupUrl || '',
      startupNavigation: body.startupNavigation || {
        ok: false,
        requestedUrl: '',
        attemptedUrl: '',
        finalUrl: '',
        reasonCode: '',
        error: '',
        checkedAt: '',
      },
      proxyVerification: body.proxyVerification || null,
      configFingerprintHash: body.configFingerprintHash || '',
      proxyFingerprintHash: body.proxyFingerprintHash || '',
      lastQuickIsolationCheck: body.lastQuickIsolationCheck || null,
      trustedLaunchSnapshot: body.trustedLaunchSnapshot || null,
      lastLaunchBlock: body.lastLaunchBlock || null,
      workspace: normalizeWorkspacePayload('pending-profile-id', body.workspace),
    });

    profile.workspace = normalizeWorkspacePayload(String(profile._id), profile.workspace);
    await profile.save();

    res.json({
      success: true,
      profile: serializeProfile(profile),
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;

    const profile = await ProfileModel.findOne({
      _id: req.params.id,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const storageState = await ProfileStorageStateModel.findOne({
      userId: authUser.userId,
      profileId: req.params.id,
    })
      .select('_id')
      .lean();

    res.json({
      success: true,
      profile: serializeProfile(profile, !!storageState),
    });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const body = req.body || {};
    const profileId = String(req.params.id);
    const updateData: Record<string, unknown> = {};
    const resolved = await resolveRuntimeProfileForUser(authUser.userId, profileId);

    if (typeof body.name === 'string') updateData.name = body.name.trim();
    if (typeof body.platform === 'string') updateData.platform = body.platform.trim();
    if (typeof body.purpose === 'string') updateData.purpose = body.purpose.trim();
    if (body.runtimeMode !== undefined) updateData.runtimeMode = normalizeRuntimeMode(body.runtimeMode);
    if (typeof body.proxyBindingMode === 'string') updateData.proxyBindingMode = body.proxyBindingMode.trim();
    if (typeof body.ipUsageMode === 'string') updateData.ipUsageMode = body.ipUsageMode.trim();
    if (typeof body.lifecycleState === 'string') updateData.lifecycleState = body.lifecycleState.trim();
    if (Array.isArray(body.riskFlags)) updateData.riskFlags = body.riskFlags;
    if (body.cooldownSummary !== undefined) updateData.cooldownSummary = normalizeCooldownSummary(body.cooldownSummary);
    if (typeof body.fingerprintPresetRef === 'string') updateData.fingerprintPresetRef = body.fingerprintPresetRef.trim();
    if (typeof body.workspaceManifestRef === 'string') updateData.workspaceManifestRef = body.workspaceManifestRef.trim();
    if (typeof body.proxyAssetId === 'string') updateData.proxyAssetId = body.proxyAssetId.trim();
    if (typeof body.activeLeaseId === 'string') updateData.activeLeaseId = body.activeLeaseId.trim();
    if (typeof body.ownerLabel === 'string') updateData.ownerLabel = body.ownerLabel.trim();
    if (typeof body.status === 'string') updateData.status = body.status;
    if (Array.isArray(body.tags)) updateData.tags = body.tags;
    if (typeof body.lastActive === 'string') updateData.lastActive = body.lastActive;
    if (typeof body.lastLaunchAt === 'string') updateData.lastLaunchAt = body.lastLaunchAt;
    if (typeof body.lastSuccessAt === 'string') updateData.lastSuccessAt = body.lastSuccessAt;
    if (typeof body.lastRestoreAt === 'string') updateData.lastRestoreAt = body.lastRestoreAt;
    if (typeof body.proxy === 'string') updateData.proxy = body.proxy;
    if (typeof body.proxyType === 'string') updateData.proxyType = body.proxyType;
    if (typeof body.proxyHost === 'string') updateData.proxyHost = body.proxyHost;
    if (typeof body.proxyPort === 'string') updateData.proxyPort = body.proxyPort;
    if (typeof body.proxyUsername === 'string') updateData.proxyUsername = body.proxyUsername;
    if (typeof body.proxyPassword === 'string') updateData.proxyPassword = body.proxyPassword;
    if (typeof body.expectedProxyIp === 'string') updateData.expectedProxyIp = body.expectedProxyIp;
    if (typeof body.expectedProxyCountry === 'string') updateData.expectedProxyCountry = body.expectedProxyCountry;
    if (typeof body.expectedProxyRegion === 'string') updateData.expectedProxyRegion = body.expectedProxyRegion;
    if (typeof body.preferredProxyTransport === 'string') {
      updateData.preferredProxyTransport = body.preferredProxyTransport;
    }
    if (typeof body.lastResolvedProxyTransport === 'string') {
      updateData.lastResolvedProxyTransport = body.lastResolvedProxyTransport;
    }
    if (typeof body.lastHostEnvironment === 'string') {
      updateData.lastHostEnvironment = body.lastHostEnvironment;
    }
    if (typeof body.ua === 'string') updateData.ua = body.ua;
    if (typeof body.seed === 'string') updateData.seed = body.seed;
    if (typeof body.isMobile === 'boolean') updateData.isMobile = body.isMobile;
    if (typeof body.groupId === 'string') updateData.groupId = body.groupId;
    if (typeof body.runtimeSessionId === 'string') updateData.runtimeSessionId = body.runtimeSessionId;
    if (typeof body.startupPlatform === 'string') updateData.startupPlatform = body.startupPlatform;
    if (typeof body.startupUrl === 'string') updateData.startupUrl = body.startupUrl;
    if (body.startupNavigation && typeof body.startupNavigation === 'object') {
      updateData.startupNavigation = body.startupNavigation;
    }
    if (body.proxyVerification !== undefined) updateData.proxyVerification = body.proxyVerification;
    if (typeof body.configFingerprintHash === 'string') {
      updateData.configFingerprintHash = body.configFingerprintHash;
    }
    if (typeof body.proxyFingerprintHash === 'string') {
      updateData.proxyFingerprintHash = body.proxyFingerprintHash;
    }
    if (body.lastQuickIsolationCheck !== undefined) {
      updateData.lastQuickIsolationCheck = body.lastQuickIsolationCheck;
    }
    if (body.trustedLaunchSnapshot !== undefined) {
      updateData.trustedLaunchSnapshot = body.trustedLaunchSnapshot;
    }
    if (body.lastLaunchBlock !== undefined) {
      updateData.lastLaunchBlock = body.lastLaunchBlock;
    }
    if (body.workspace !== undefined) {
      updateData.workspace = normalizeWorkspacePayload(profileId, body.workspace);
    }

    let profile: Record<string, unknown> | null = null;

    if (!resolved) {
      logSyncRouteEvent('warn', 'profile_patch_profile_missing', {
        route: 'PATCH /api/profiles/:id',
        profileId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: 'missing',
      });
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    if (resolved.source === 'mongo' && isMongoObjectId(profileId)) {
      profile = await ProfileModel.findOneAndUpdate(
        { _id: profileId, userId: authUser.userId },
        updateData,
        { new: true }
      ).lean();
    } else {
      const savedState = await updateConfigProfileForUser(authUser.userId, profileId, (existing) => ({
        ...existing,
        ...updateData,
        id: profileId,
      }));
      if (savedState) {
        const { profile: configProfile } = await findConfigProfileForUser(authUser.userId, profileId);
        profile = configProfile;
      }
    }

    if (!profile) {
      logSyncRouteEvent('warn', 'profile_patch_profile_missing_after_update', {
        route: 'PATCH /api/profiles/:id',
        profileId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: resolved.source,
      });
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const storageState = await ProfileStorageStateModel.findOne({
      userId: authUser.userId,
      profileId,
    })
      .select('_id')
      .lean();

    res.json({
      success: true,
      profile:
        '_id' in profile
          ? serializeProfile(profile, !!storageState)
          : {
              ...profile,
              id: profileId,
              storageStateSynced: !!storageState,
            },
    });
    logSyncRouteEvent('info', 'profile_patch_applied', {
      route: 'PATCH /api/profiles/:id',
      profileId,
      profileIdType: resolveProfileIdType(profileId),
      profileSource: resolved.source,
      updatedWorkspace: body.workspace !== undefined,
    });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;

    const profile = await ProfileModel.findOneAndDelete({
      _id: req.params.id,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Profile deleted successfully',
    });
  })
);

export default router;
