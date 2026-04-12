import { Router } from 'express';
import { logAdminAction } from '../lib/audit.js';
import { connectMongo } from '../lib/mongodb.js';
import { HttpError, asyncHandler } from '../lib/http.js';
import { normalizeConfigProfilePayload, resolveUserConfigStateId } from '../lib/configProfiles.js';
import { normalizeWorkspacePayload } from '../lib/serializers.js';
import { collectStorageDiagnosticsSummary } from '../lib/storageDiagnostics.js';
import { hasLegacyInlineStorageStatePayload } from '../lib/storageView.js';
import { requireAdmin } from '../middlewares/auth.js';
import { AgentConfigStateModel } from '../models/AgentConfigState.js';
import { ConfigSyncEventModel } from '../models/ConfigSyncEvent.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';
import { WorkspaceSnapshotModel } from '../models/WorkspaceSnapshot.js';
import { UserModel } from '../models/User.js';

const router = Router();

router.use(requireAdmin);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAdminConfigProfile(profile: unknown) {
  if (!profile || typeof profile !== 'object') {
    return null;
  }
  const raw = profile as Record<string, unknown>;
  const profileId = String(raw.id || '').trim();
  if (!profileId) {
    return null;
  }
  const normalized = normalizeConfigProfilePayload(profileId, raw) as Record<string, unknown>;
  const fingerprintConfig =
    normalized.fingerprintConfig && typeof normalized.fingerprintConfig === 'object'
      ? (normalized.fingerprintConfig as Record<string, unknown>)
      : {};
  const proxySettings =
    fingerprintConfig.proxySettings && typeof fingerprintConfig.proxySettings === 'object'
      ? (fingerprintConfig.proxySettings as Record<string, unknown>)
      : {};
  const basicSettings =
    fingerprintConfig.basicSettings && typeof fingerprintConfig.basicSettings === 'object'
      ? (fingerprintConfig.basicSettings as Record<string, unknown>)
      : {};
  const runtimeMetadata =
    fingerprintConfig.runtimeMetadata && typeof fingerprintConfig.runtimeMetadata === 'object'
      ? (fingerprintConfig.runtimeMetadata as Record<string, unknown>)
      : {};
  const deviceProfile =
    normalized.deviceProfile && typeof normalized.deviceProfile === 'object'
      ? (normalized.deviceProfile as Record<string, unknown>)
      : {};
  const workspace = normalizeWorkspacePayload(profileId, normalized.workspace);

  return {
    id: profileId,
    name: String(normalized.name || '').trim(),
    userId: '',
    status: String(normalized.status || 'stopped').trim() || 'stopped',
    groupId: String(normalized.groupName || '').trim(),
    proxyType: String(proxySettings.proxyType || proxySettings.proxyMode || 'direct').trim() || 'direct',
    proxyHost: String(proxySettings.host || '').trim(),
    proxyPort: String(proxySettings.port || '').trim(),
    expectedProxyIp: String(runtimeMetadata.lastResolvedIp || '').trim(),
    ua: String(fingerprintConfig.userAgent || deviceProfile.userAgent || '').trim(),
    seed: String(fingerprintConfig.language || '').trim(),
    isMobile:
      String(deviceProfile.deviceClass || '').trim() === 'mobile' ||
      String(deviceProfile.platform || '').trim().toLowerCase().includes('android') ||
      String(deviceProfile.platform || '').trim().toLowerCase().includes('ios'),
    startupPlatform: String(
      normalized.platform || basicSettings.platform || normalized.environmentPurpose || ''
    ).trim(),
    startupUrl: String(basicSettings.customPlatformUrl || '').trim(),
    storageStateSynced: false,
    ownerEmail: '',
    ownerName: '',
    createdAt: String(normalized.createdAt || '').trim(),
    updatedAt: String(normalized.updatedAt || '').trim(),
    canonicalSyncVersion: Number(raw.configSyncVersion || normalized.configSyncVersion || 0),
    lastEnvironmentSyncStatus: String(runtimeMetadata.lastEnvironmentSyncStatus || '').trim(),
    lastEnvironmentSyncMessage: String(runtimeMetadata.lastEnvironmentSyncMessage || '').trim(),
    lastEnvironmentSyncVersion: Number(runtimeMetadata.lastEnvironmentSyncVersion || 0),
    workspace,
    environmentPurpose: String(normalized.environmentPurpose || '').trim(),
    notes: String(normalized.notes || '').trim(),
    tags: Array.isArray(normalized.tags) ? normalized.tags : [],
  };
}

function getSyncProfileStatus(profile: {
  proxyType?: string;
  proxyHost?: string;
  proxyPort?: string;
  ua?: string;
  seed?: string;
  isMobile?: boolean;
  startupPlatform?: string;
  startupUrl?: string;
}) {
  const hasProxy =
    profile.proxyType === 'direct' || Boolean(profile.proxyHost) || Boolean(profile.proxyPort);
  const hasFingerprint =
    Boolean(profile.ua) || Boolean(profile.seed) || typeof profile.isMobile === 'boolean';
  const hasEnvironment = Boolean(profile.startupPlatform) || Boolean(profile.startupUrl);

  if (hasProxy && hasFingerprint && hasEnvironment) return 'ready';
  if (hasProxy || hasFingerprint || hasEnvironment) return 'partial';
  return 'empty';
}

async function listCanonicalAdminProfiles() {
  const [configStates, storageStates, workspaceSnapshots, users, syncEvents] = await Promise.all([
    AgentConfigStateModel.find({
      agentId: /^user:/,
    })
      .select('agentId profiles updatedAt')
      .lean(),
    ProfileStorageStateModel.find({}).select('profileId fileRef inlineStateJson stateJson').lean(),
    WorkspaceSnapshotModel.find({}).select('profileId fileRef').lean(),
    UserModel.find({}).select('_id email name status').lean(),
    ConfigSyncEventModel.find({ scope: 'environment' })
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean(),
  ]);

  const syncedProfileIds = new Set(storageStates.map((item) => String(item.profileId)));
  const workspaceSnapshotProfileIds = new Set(workspaceSnapshots.map((item) => String(item.profileId)));
  const storageStateBackedByFile = storageStates.filter((item) => String(item.fileRef || '').trim()).length;
  const storageStateLegacyInlineCount = storageStates.filter(
    (item) => hasLegacyInlineStorageStatePayload(item as Record<string, unknown>)
  ).length;
  const workspaceSnapshotBackedByFile = workspaceSnapshots.filter((item) =>
    String(item.fileRef || '').trim()
  ).length;
  const userMap = new Map(
    users.map((user) => [
      String(user._id),
      {
        ownerEmail: user.email || '',
        ownerName: user.name || '',
        status: user.status || '',
      },
    ]),
  );
  const profileEventMap = new Map<string, Record<string, unknown>[]>();
  const userEventCountMap = new Map<string, number>();
  for (const event of syncEvents) {
    const eventUserId = String(event.userId || '');
    userEventCountMap.set(eventUserId, (userEventCountMap.get(eventUserId) || 0) + 1);
    const eventProfileIds = Array.isArray(event.profileIds)
      ? event.profileIds
          .map((item: unknown) => String(item || '').trim())
          .filter(Boolean)
      : [];
    for (const profileId of eventProfileIds) {
      const existing = profileEventMap.get(profileId) || [];
      existing.push(event as unknown as Record<string, unknown>);
      profileEventMap.set(profileId, existing);
    }
  }

  const profiles: Array<Record<string, unknown>> = [];
  for (const state of configStates) {
    const agentId = String(state.agentId || '').trim();
    if (!agentId.startsWith('user:')) {
      continue;
    }
    const userId = agentId.slice('user:'.length);
    const owner = userMap.get(userId) || { ownerEmail: '', ownerName: '', status: '' };
    const stateProfiles = Array.isArray(state.profiles) ? state.profiles : [];
    for (const rawProfile of stateProfiles) {
      const normalized = normalizeAdminConfigProfile(rawProfile);
      if (!normalized) {
        continue;
      }
      const profileEvents = profileEventMap.get(String(normalized.id)) || [];
      const latestAutoPushEvent =
        profileEvents.find(
          (event) =>
            String(event.mode || '') === 'auto' &&
            String(event.direction || '') === 'push'
        ) || null;
      const latestAutoPullEvent =
        profileEvents.find(
          (event) =>
            String(event.mode || '') === 'auto' &&
            String(event.direction || '') === 'pull'
        ) || null;
      const latestErrorEvent =
        profileEvents.find((event) => String(event.status || '').includes('failed')) || null;
      const latestEvent = profileEvents[0] || null;
      profiles.push({
        ...normalized,
        userId,
        ownerEmail: owner.ownerEmail,
        ownerName: owner.ownerName,
        storageStateSynced: syncedProfileIds.has(String(normalized.id)),
        workspaceSnapshotSynced: workspaceSnapshotProfileIds.has(String(normalized.id)),
        autoSyncTaskCount: userEventCountMap.get(userId) || 0,
        lastAutoPushAt: String(latestAutoPushEvent?.createdAt || '').trim(),
        lastAutoPullAt: String(latestAutoPullEvent?.createdAt || '').trim(),
        lastAutoSyncError: String(latestErrorEvent?.errorMessage || '').trim(),
        lastWriterDeviceId: String(latestEvent?.deviceId || '').trim(),
      });
    }
  }

  profiles.sort((left, right) => {
    const rightTime = Date.parse(String(right.updatedAt || right.createdAt || ''));
    const leftTime = Date.parse(String(left.updatedAt || left.createdAt || ''));
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });

  return {
    profiles,
    users,
    storageSummary: {
      storageStateBackedByFile,
      workspaceSnapshotBackedByFile,
      legacyInlinePayloadCount: storageStateLegacyInlineCount,
      storageStateLegacyInlineCount,
    },
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const syncFilter = typeof req.query.syncFilter === 'string' ? req.query.syncFilter.trim() : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)));

    const [{ profiles, users, storageSummary }, diagnostics] = await Promise.all([
      listCanonicalAdminProfiles(),
      collectStorageDiagnosticsSummary(),
    ]);
    const matchedUserIds =
      keyword.length > 0
        ? new Set(
            users
              .filter((user) => {
                const regex = new RegExp(escapeRegExp(keyword), 'i');
                return regex.test(String(user.email || '')) || regex.test(String(user.name || ''));
              })
              .map((user) => String(user._id)),
          )
        : null;
    const keywordRegex = keyword.length > 0 ? new RegExp(escapeRegExp(keyword), 'i') : null;

    const filteredProfiles = profiles.filter((profile) => {
      if (userId && String(profile.userId || '') !== userId) {
        return false;
      }

      if (keywordRegex) {
        const matchesKeyword =
          keywordRegex.test(String(profile.name || '')) ||
          keywordRegex.test(String(profile.proxyHost || '')) ||
          keywordRegex.test(String(profile.expectedProxyIp || '')) ||
          keywordRegex.test(String(profile.ownerEmail || '')) ||
          keywordRegex.test(String(profile.ownerName || '')) ||
          Boolean(matchedUserIds?.has(String(profile.userId || '')));
        if (!matchesKeyword) {
          return false;
        }
      }

      if (syncFilter === 'ready' || syncFilter === 'partial' || syncFilter === 'empty') {
        return getSyncProfileStatus(profile) === syncFilter;
      }

      return true;
    });

    const total = filteredProfiles.length;
    const pagedProfiles = filteredProfiles.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      success: true,
      profiles: pagedProfiles,
      total,
      page,
      pageSize,
      stats: {
        totalProfiles: total,
        readyProfiles: filteredProfiles.filter((profile) => getSyncProfileStatus(profile) === 'ready')
          .length,
        partialProfiles: filteredProfiles.filter((profile) => getSyncProfileStatus(profile) === 'partial')
          .length,
        syncedStorageProfiles: filteredProfiles.filter((profile) => Boolean(profile.storageStateSynced))
          .length,
        autoSyncTaskCount: filteredProfiles.reduce(
          (total, profile) => total + Number(profile.autoSyncTaskCount || 0),
          0
        ),
        storageStateBackedByFile: storageSummary.storageStateBackedByFile,
        workspaceSnapshotBackedByFile: storageSummary.workspaceSnapshotBackedByFile,
        legacyInlinePayloadCount: diagnostics.legacyInlinePayloadCount,
      },
      diagnostics,
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const profileId = String(req.params.id || '').trim();
    const { profiles } = await listCanonicalAdminProfiles();
    const profile = profiles.find((item) => String(item.id || '') === profileId) || null;

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    res.json({
      success: true,
      profile,
    });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const profileId = String(req.params.id || '').trim();
    const nextUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    if (!profileId) {
      throw new HttpError(400, 'profileId is required');
    }
    if (!nextUserId) {
      throw new HttpError(400, 'userId is required');
    }

    const [configStates, targetUser, users, storageState] = await Promise.all([
      AgentConfigStateModel.find({ agentId: /^user:/ }).lean(),
      UserModel.findById(nextUserId).lean(),
      UserModel.find({}).select('_id email name').lean(),
      ProfileStorageStateModel.findOne({ profileId }).select('_id').lean(),
    ]);

    if (!targetUser) {
      throw new HttpError(404, 'Target user not found');
    }
    if (targetUser.status !== 'active') {
      throw new HttpError(400, 'Target user is disabled');
    }

    const ownerMap = new Map(
      users.map((user) => [
        String(user._id),
        {
          ownerEmail: user.email || '',
          ownerName: user.name || '',
        },
      ]),
    );

    const sourceState = configStates.find((state) =>
      Array.isArray(state.profiles) &&
      state.profiles.some(
        (item: unknown) =>
          Boolean(item) &&
          typeof item === 'object' &&
          String((item as Record<string, unknown>).id || '').trim() === profileId,
      ),
    );

    if (!sourceState) {
      throw new HttpError(404, 'Profile not found');
    }

    const sourceUserId = String(sourceState.agentId || '').replace(/^user:/, '');
    const sourceProfiles = Array.isArray(sourceState.profiles) ? sourceState.profiles : [];
    const movedProfile =
      sourceProfiles.find(
        (item: unknown) =>
          Boolean(item) &&
          typeof item === 'object' &&
          String((item as Record<string, unknown>).id || '').trim() === profileId,
      ) || null;

    if (!movedProfile) {
      throw new HttpError(404, 'Profile not found');
    }

    if (sourceUserId !== nextUserId) {
      const nextSourceProfiles = sourceProfiles.filter((item: unknown) => {
        if (!item || typeof item !== 'object') {
          return true;
        }
        return String((item as Record<string, unknown>).id || '').trim() !== profileId;
      });

      await AgentConfigStateModel.findOneAndUpdate(
        { agentId: sourceState.agentId },
        {
          $set: { profiles: nextSourceProfiles },
          $inc: { syncVersion: 1 },
        },
        { new: true },
      );

      const targetState = configStates.find(
        (state) => String(state.agentId || '') === resolveUserConfigStateId(nextUserId),
      );
      const targetProfiles = Array.isArray(targetState?.profiles) ? targetState!.profiles : [];
      const dedupedTargetProfiles = targetProfiles.filter((item: unknown) => {
        if (!item || typeof item !== 'object') {
          return true;
        }
        return String((item as Record<string, unknown>).id || '').trim() !== profileId;
      });

      await AgentConfigStateModel.findOneAndUpdate(
        { agentId: resolveUserConfigStateId(nextUserId) },
        {
          $set: { profiles: [...dedupedTargetProfiles, movedProfile] },
          ...(targetState
            ? { $inc: { syncVersion: 1 } }
            : { $setOnInsert: { syncVersion: 1, globalConfigSyncVersion: 0 } }),
        },
        { upsert: true, new: true },
      );
    }

    const normalized = normalizeAdminConfigProfile(movedProfile);
    const toOwner = ownerMap.get(String(targetUser._id)) || {
      ownerEmail: targetUser.email || '',
      ownerName: targetUser.name || '',
    };
    const fromOwner = ownerMap.get(sourceUserId) || { ownerEmail: '', ownerName: '' };

    await logAdminAction({
      adminUserId: req.authUser!.userId,
      adminEmail: req.authUser!.email,
      action: 'transfer_profile_ownership',
      targetType: 'profile',
      targetId: profileId,
      targetLabel: normalized?.name || profileId,
      detail: {
        fromUserId: sourceUserId,
        fromOwnerEmail: fromOwner.ownerEmail,
        toUserId: String(targetUser._id),
        toOwnerEmail: toOwner.ownerEmail,
      },
    });

    res.json({
      success: true,
      profile: {
        ...normalized,
        userId: String(targetUser._id),
        ownerEmail: toOwner.ownerEmail,
        ownerName: toOwner.ownerName,
        storageStateSynced: Boolean(storageState),
      },
    });
  })
);

export default router;
