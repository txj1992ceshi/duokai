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
  resolveWorkspaceSnapshotArtifact,
  writeWorkspaceSnapshotArtifact,
} from '../lib/storageArtifacts.js';
import {
  compactWorkspaceSnapshotDocument,
  shouldIncludeArtifactContent,
} from '../lib/storageView.js';
import { WorkspaceSnapshotModel } from '../models/WorkspaceSnapshot.js';

const router = Router();

router.use(requireUser);

export function normalizeWorkspaceSnapshotPayload(
  profileId: string,
  snapshotId: string,
  body: Record<string, unknown>
) {
  return {
    snapshotId: String(body.snapshotId || snapshotId).trim() || snapshotId,
    profileId,
    templateRevision: String(body.templateRevision || '').trim(),
    templateFingerprintHash: String(body.templateFingerprintHash || '').trim(),
    manifest: body.manifest && typeof body.manifest === 'object' ? body.manifest : {},
    workspaceManifestRef: String(body.workspaceManifestRef || '').trim(),
    storageStateRef: String(body.storageStateRef || '').trim(),
    workspaceMetadata:
      body.workspaceMetadata && typeof body.workspaceMetadata === 'object'
        ? body.workspaceMetadata
        : {},
    storageState: body.storageState && typeof body.storageState === 'object' ? body.storageState : {},
    directoryManifest: Array.isArray(body.directoryManifest) ? body.directoryManifest : [],
    healthSummary: body.healthSummary && typeof body.healthSummary === 'object' ? body.healthSummary : {},
    consistencySummary:
      body.consistencySummary && typeof body.consistencySummary === 'object'
        ? body.consistencySummary
        : {},
    validatedStartAt: String(body.validatedStartAt || '').trim(),
    fileRef: String(body.fileRef || '').trim(),
    checksum: String(body.checksum || '').trim(),
    size: Number(body.size || 0) || 0,
    contentType: String(body.contentType || 'application/json').trim() || 'application/json',
    retentionPolicy: String(body.retentionPolicy || 'recent-n').trim() || 'recent-n',
    createdAt: String(body.createdAt || '').trim(),
    updatedAt: String(body.updatedAt || '').trim(),
  };
}

async function serializeWorkspaceSnapshot(
  snapshot: Record<string, unknown> | null,
  includeContent = false
) {
  if (!snapshot) {
    return null;
  }
  const artifactPayload = includeContent
    ? await resolveWorkspaceSnapshotArtifact(String(snapshot.fileRef || ''))
    : null;
  return {
    snapshotId: String(snapshot.snapshotId || ''),
    profileId: String(snapshot.profileId || ''),
    templateRevision: String(snapshot.templateRevision || ''),
    templateFingerprintHash: String(snapshot.templateFingerprintHash || ''),
    manifest:
      (artifactPayload?.manifest && typeof artifactPayload.manifest === 'object'
        ? artifactPayload.manifest
        : snapshot.manifest) || {},
    workspaceManifestRef: String(snapshot.workspaceManifestRef || ''),
    storageStateRef: String(snapshot.storageStateRef || ''),
    workspaceMetadata:
      (artifactPayload?.workspaceMetadata && typeof artifactPayload.workspaceMetadata === 'object'
        ? artifactPayload.workspaceMetadata
        : snapshot.workspaceMetadata) || {},
    storageState:
      (artifactPayload?.storageState && typeof artifactPayload.storageState === 'object'
        ? artifactPayload.storageState
        : snapshot.storageState) || {},
    directoryManifest: Array.isArray(artifactPayload?.directoryManifest)
      ? artifactPayload!.directoryManifest
      : Array.isArray(snapshot.directoryManifest)
        ? snapshot.directoryManifest
        : [],
    healthSummary:
      (artifactPayload?.healthSummary && typeof artifactPayload.healthSummary === 'object'
        ? artifactPayload.healthSummary
        : snapshot.healthSummary) || {},
    consistencySummary:
      (artifactPayload?.consistencySummary && typeof artifactPayload.consistencySummary === 'object'
        ? artifactPayload.consistencySummary
        : snapshot.consistencySummary) || {},
    validatedStartAt: String(snapshot.validatedStartAt || ''),
    fileRef: String(snapshot.fileRef || ''),
    checksum: String(snapshot.checksum || ''),
    size: Number(snapshot.size || 0),
    contentType: String(snapshot.contentType || 'application/json'),
    retentionPolicy: String(snapshot.retentionPolicy || 'recent-n'),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

router.get(
  '/:profileId',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const profileId = String(req.params.profileId);
    const resolved = await resolveRuntimeProfileForUser(authUser.userId, profileId);
    if (!resolved) {
      logSyncRouteEvent('warn', 'workspace_snapshot_profile_missing', {
        route: 'GET /api/workspace-snapshots/:profileId',
        profileId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: 'missing',
      });
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const snapshots = await WorkspaceSnapshotModel.find({
      userId: authUser.userId,
      profileId: resolved.profileId,
    })
      .sort({ updatedAt: -1 })
      .lean();
    const includeContent = shouldIncludeArtifactContent(req.query.includeContent);

    res.json({
      success: true,
      snapshots: await Promise.all(
        snapshots.map((snapshot) =>
          serializeWorkspaceSnapshot(snapshot as Record<string, unknown>, includeContent)
        )
      ),
    });
  })
);

router.get(
  '/:profileId/:snapshotId',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const profileId = String(req.params.profileId);
    const snapshotId = String(req.params.snapshotId);
    const resolved = await resolveRuntimeProfileForUser(authUser.userId, profileId);
    if (!resolved) {
      logSyncRouteEvent('warn', 'workspace_snapshot_profile_missing', {
        route: 'GET /api/workspace-snapshots/:profileId/:snapshotId',
        profileId,
        snapshotId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: 'missing',
      });
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const snapshot = await WorkspaceSnapshotModel.findOne({
      userId: authUser.userId,
      profileId: resolved.profileId,
      snapshotId,
    }).lean();
    const includeContent = shouldIncludeArtifactContent(req.query.includeContent);

    if (!snapshot) {
      res.status(404).json({ success: false, error: 'Workspace snapshot not found' });
      return;
    }

    res.json({
      success: true,
      snapshot: await serializeWorkspaceSnapshot(snapshot as Record<string, unknown>, includeContent),
    });
  })
);

router.put(
  '/:profileId/:snapshotId',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const profileId = String(req.params.profileId);
    const snapshotId = String(req.params.snapshotId);
    const body = req.body || {};
    const resolved = await resolveRuntimeProfileForUser(authUser.userId, profileId);
    if (!resolved) {
      logSyncRouteEvent('warn', 'workspace_snapshot_profile_missing', {
        route: 'PUT /api/workspace-snapshots/:profileId/:snapshotId',
        profileId,
        snapshotId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: 'missing',
      });
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const payload = normalizeWorkspaceSnapshotPayload(resolved.profileId, snapshotId, body);

    let artifact;
    try {
      artifact = await writeWorkspaceSnapshotArtifact({
        userId: String(authUser.userId),
        profileId: resolved.profileId,
        snapshotId: payload.snapshotId,
        payload: {
          snapshotId: payload.snapshotId,
          profileId: resolved.profileId,
          templateRevision: payload.templateRevision,
          templateFingerprintHash: payload.templateFingerprintHash,
          manifest: payload.manifest,
          workspaceMetadata: payload.workspaceMetadata,
          storageState: payload.storageState,
          directoryManifest: payload.directoryManifest,
          healthSummary: payload.healthSummary,
          consistencySummary: payload.consistencySummary,
          validatedStartAt: payload.validatedStartAt,
          createdAt: payload.createdAt,
          updatedAt: payload.updatedAt,
        },
      });
    } catch (error) {
      logSyncRouteEvent('error', 'workspace_snapshot_artifact_write_failed', {
        route: 'PUT /api/workspace-snapshots/:profileId/:snapshotId',
        profileId,
        resolvedProfileId: resolved.profileId,
        snapshotId: payload.snapshotId,
        profileIdType: resolveProfileIdType(profileId),
        profileSource: resolved.source,
        errorMessage: error instanceof Error ? error.message : String(error),
        ...buildArtifactContext(),
      });
      throw error;
    }

    const snapshot = await WorkspaceSnapshotModel.findOneAndUpdate(
      {
        userId: authUser.userId,
        profileId: resolved.profileId,
        snapshotId: payload.snapshotId,
      },
      {
        userId: authUser.userId,
        profileId: resolved.profileId,
        snapshotId: payload.snapshotId,
        templateRevision: payload.templateRevision,
        templateFingerprintHash: payload.templateFingerprintHash,
        ...compactWorkspaceSnapshotDocument({
          manifest: payload.manifest,
          workspaceMetadata: payload.workspaceMetadata,
          storageState: payload.storageState,
          directoryManifest: payload.directoryManifest,
          healthSummary: payload.healthSummary,
          consistencySummary: payload.consistencySummary,
        }),
        workspaceManifestRef: payload.workspaceManifestRef,
        storageStateRef: payload.storageStateRef,
        validatedStartAt: payload.validatedStartAt,
        fileRef: artifact.fileRef || payload.fileRef,
        checksum: artifact.checksum || payload.checksum,
        size: artifact.size || payload.size,
        contentType: artifact.contentType || payload.contentType,
        retentionPolicy: artifact.retentionPolicy || payload.retentionPolicy,
        createdAt: payload.createdAt || undefined,
        updatedAt: payload.updatedAt || undefined,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    res.json({
      success: true,
      snapshot: await serializeWorkspaceSnapshot(snapshot as Record<string, unknown>, true),
    });
    logSyncRouteEvent('info', 'workspace_snapshot_upserted', {
      route: 'PUT /api/workspace-snapshots/:profileId/:snapshotId',
      profileId,
      resolvedProfileId: resolved.profileId,
      snapshotId: payload.snapshotId,
      profileIdType: resolveProfileIdType(profileId),
      profileSource: resolved.source,
      fileRef: String((snapshot as Record<string, unknown> | null)?.fileRef || ''),
      ...buildArtifactContext(),
    });
  })
);

export default router;
