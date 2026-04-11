import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { requireUser } from '../middlewares/auth.js';
import { resolveRuntimeProfileForUser } from '../lib/runtimeProfiles.js';
import {
  buildArtifactContext,
  logSyncRouteEvent,
  resolveProfileIdType,
} from '../lib/syncRouteLogger.js';
import {
  resolveStorageStateJson,
  writeStorageStateArtifact,
} from '../lib/storageArtifacts.js';
import { shouldIncludeArtifactContent } from '../lib/storageView.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';

const router = Router();

router.use(requireUser);

function normalizeStorageStatePayload(body: Record<string, unknown>) {
  const inlineStateJson =
    body.inlineStateJson !== undefined ? body.inlineStateJson : body.stateJson !== undefined ? body.stateJson : null;
  return {
    inlineStateJson,
    encrypted: !!body.encrypted,
    deviceId: String(body.deviceId || '').trim(),
    source: String(body.source || 'desktop').trim() || 'desktop',
    stateHash: String(body.stateHash || '').trim(),
    fileRef: String(body.fileRef || '').trim(),
    checksum: String(body.checksum || '').trim(),
    size: Number(body.size || 0) || 0,
    contentType: String(body.contentType || 'application/json').trim() || 'application/json',
    retentionPolicy: String(body.retentionPolicy || 'latest-only').trim() || 'latest-only',
  };
}

async function serializeStorageStateRecord(
  storageState: Record<string, unknown> | null,
  includeContent = false
) {
  if (!storageState) {
    return null;
  }
  const resolvedStateJson = includeContent
    ? await resolveStorageStateJson({
        inlineStateJson: storageState.inlineStateJson,
        stateJson: storageState.stateJson,
        fileRef: String(storageState.fileRef || ''),
      })
    : null;
  return {
    id: String(storageState._id),
    userId: String(storageState.userId),
    profileId: String(storageState.profileId),
    version: Number(storageState.version || 0),
    encrypted: Boolean(storageState.encrypted),
    deviceId: String(storageState.deviceId || ''),
    updatedBy: String(storageState.updatedBy || ''),
    source: String(storageState.source || 'desktop'),
    stateHash: String(storageState.stateHash || ''),
    fileRef: String(storageState.fileRef || ''),
    checksum: String(storageState.checksum || ''),
    size: Number(storageState.size || 0),
    contentType: String(storageState.contentType || 'application/json'),
    retentionPolicy: String(storageState.retentionPolicy || 'latest-only'),
    inlineStateJson: includeContent ? resolvedStateJson : null,
    stateJson: includeContent ? resolvedStateJson : null,
    createdAt: storageState.createdAt,
    updatedAt: storageState.updatedAt,
  };
}

router.get(
  '/:profileId',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const profileId = String(req.params.profileId || '').trim();
    const resolved = await resolveRuntimeProfileForUser(authUser.userId, profileId);
    if (!resolved) {
      logSyncRouteEvent('warn', 'profile_storage_state_profile_missing', {
        route: 'GET /api/profile-storage-state/:profileId',
        profileId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: 'missing',
      });
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const storageState = await ProfileStorageStateModel.findOne({
      userId: authUser.userId,
      profileId: resolved.profileId,
    }).lean();
    const includeContent = shouldIncludeArtifactContent(req.query.includeContent);

    res.json({
      success: true,
      storageState: await serializeStorageStateRecord(
        storageState as Record<string, unknown> | null,
        includeContent
      ),
    });
  })
);

router.put(
  '/:profileId',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const profileId = String(req.params.profileId || '').trim();
    const body = req.body || {};
    const resolved = await resolveRuntimeProfileForUser(authUser.userId, profileId);
    if (!resolved) {
      logSyncRouteEvent('warn', 'profile_storage_state_profile_missing', {
        route: 'PUT /api/profile-storage-state/:profileId',
        profileId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: 'missing',
      });
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const baseVersion = Number(body.baseVersion ?? 0);
    if (!Number.isFinite(baseVersion) || baseVersion < 0) {
      res.status(400).json({ success: false, error: 'baseVersion must be a non-negative number' });
      return;
    }

    const normalized = normalizeStorageStatePayload(body);
    if (!normalized.deviceId) {
      res.status(400).json({ success: false, error: 'deviceId is required' });
      return;
    }
    if (!normalized.fileRef && normalized.inlineStateJson === null) {
      res.status(400).json({ success: false, error: 'inlineStateJson or fileRef is required' });
      return;
    }

    const existing = await ProfileStorageStateModel.findOne({
      userId: authUser.userId,
      profileId: resolved.profileId,
    }).lean();

    if ((existing?.version || 0) !== baseVersion) {
      res.status(409).json({
        success: false,
        error: 'Storage state version conflict',
        conflict: {
          currentVersion: existing?.version || 0,
          updatedAt: existing?.updatedAt || null,
          deviceId: existing?.deviceId || '',
          updatedBy: existing?.updatedBy || '',
        },
      });
      return;
    }

    const nextVersion = existing ? (existing.version || 0) + 1 : 1;
    let artifact = null;
    try {
      artifact =
        normalized.inlineStateJson !== null
          ? await writeStorageStateArtifact({
              userId: String(authUser.userId),
              profileId: resolved.profileId,
              version: nextVersion,
              stateJson: normalized.inlineStateJson,
              stateHash: normalized.stateHash,
              deviceId: normalized.deviceId,
              source: normalized.source,
            })
          : null;
    } catch (error) {
      logSyncRouteEvent('error', 'profile_storage_state_artifact_write_failed', {
        route: 'PUT /api/profile-storage-state/:profileId',
        profileId,
        resolvedProfileId: resolved.profileId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: resolved.source,
        version: nextVersion,
        deviceId: normalized.deviceId,
        errorMessage: error instanceof Error ? error.message : String(error),
        ...buildArtifactContext(),
      });
      throw error;
    }
    const storageState = await ProfileStorageStateModel.findOneAndUpdate(
      {
        userId: authUser.userId,
        profileId: resolved.profileId,
      },
      {
        userId: authUser.userId,
        profileId: resolved.profileId,
        stateJson: null,
        inlineStateJson: null,
        encrypted: normalized.encrypted,
        version: nextVersion,
        deviceId: normalized.deviceId,
        updatedBy: String(authUser.userId),
        source: normalized.source,
        stateHash: normalized.stateHash,
        fileRef: artifact?.fileRef || normalized.fileRef,
        checksum: artifact?.checksum || normalized.checksum,
        size: artifact?.size || normalized.size,
        contentType: artifact?.contentType || normalized.contentType,
        retentionPolicy: artifact?.retentionPolicy || normalized.retentionPolicy,
      },
      {
        upsert: true,
        new: true,
      }
    ).lean();

    const serialized = await serializeStorageStateRecord(storageState as Record<string, unknown> | null);
    logSyncRouteEvent('info', 'profile_storage_state_upserted', {
      route: 'PUT /api/profile-storage-state/:profileId',
      profileId,
      resolvedProfileId: resolved.profileId,
      profileIdType: resolveProfileIdType(profileId),
      profileSource: resolved.source,
      version: Number(serialized?.version || nextVersion),
      fileRef: serialized?.fileRef || '',
      ...buildArtifactContext(),
    });
    res.json({
      success: true,
      storageState: serialized
        ? {
            ...serialized,
            updatedAt: serialized.updatedAt,
          }
        : null,
    });
  })
);

export default router;
