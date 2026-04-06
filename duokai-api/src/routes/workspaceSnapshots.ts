import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { requireUser } from '../middlewares/auth.js';
import { ProfileModel } from '../models/Profile.js';
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
    createdAt: String(body.createdAt || '').trim(),
    updatedAt: String(body.updatedAt || '').trim(),
  };
}

router.get(
  '/:profileId',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const profileId = String(req.params.profileId);

    const profile = await ProfileModel.findOne({
      _id: profileId,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const snapshots = await WorkspaceSnapshotModel.find({
      userId: authUser.userId,
      profileId,
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      success: true,
      snapshots: snapshots.map((snapshot) => ({
        snapshotId: snapshot.snapshotId,
        profileId: String(snapshot.profileId),
        templateRevision: snapshot.templateRevision || '',
        templateFingerprintHash: snapshot.templateFingerprintHash || '',
        manifest: snapshot.manifest || {},
        workspaceMetadata: snapshot.workspaceMetadata || {},
        storageState: snapshot.storageState || {},
        directoryManifest: Array.isArray(snapshot.directoryManifest) ? snapshot.directoryManifest : [],
        healthSummary: snapshot.healthSummary || {},
        consistencySummary: snapshot.consistencySummary || {},
        validatedStartAt: snapshot.validatedStartAt || '',
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      })),
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

    const profile = await ProfileModel.findOne({
      _id: profileId,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const snapshot = await WorkspaceSnapshotModel.findOne({
      userId: authUser.userId,
      profileId,
      snapshotId,
    }).lean();

    if (!snapshot) {
      res.status(404).json({ success: false, error: 'Workspace snapshot not found' });
      return;
    }

    res.json({
      success: true,
      snapshot: {
        snapshotId: snapshot.snapshotId,
        profileId: String(snapshot.profileId),
        templateRevision: snapshot.templateRevision || '',
        templateFingerprintHash: snapshot.templateFingerprintHash || '',
        manifest: snapshot.manifest || {},
        workspaceMetadata: snapshot.workspaceMetadata || {},
        storageState: snapshot.storageState || {},
        directoryManifest: Array.isArray(snapshot.directoryManifest) ? snapshot.directoryManifest : [],
        healthSummary: snapshot.healthSummary || {},
        consistencySummary: snapshot.consistencySummary || {},
        validatedStartAt: snapshot.validatedStartAt || '',
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      },
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

    const profile = await ProfileModel.findOne({
      _id: profileId,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const payload = normalizeWorkspaceSnapshotPayload(profileId, snapshotId, body);

    const snapshot = await WorkspaceSnapshotModel.findOneAndUpdate(
      {
        userId: authUser.userId,
        profileId,
        snapshotId: payload.snapshotId,
      },
      {
        userId: authUser.userId,
        profileId,
        snapshotId: payload.snapshotId,
        templateRevision: payload.templateRevision,
        templateFingerprintHash: payload.templateFingerprintHash,
        manifest: payload.manifest,
        workspaceMetadata: payload.workspaceMetadata,
        storageState: payload.storageState,
        directoryManifest: payload.directoryManifest,
        healthSummary: payload.healthSummary,
        consistencySummary: payload.consistencySummary,
        validatedStartAt: payload.validatedStartAt,
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
      snapshot: {
        snapshotId: snapshot!.snapshotId,
        profileId: String(snapshot!.profileId),
        templateRevision: snapshot!.templateRevision || '',
        templateFingerprintHash: snapshot!.templateFingerprintHash || '',
        manifest: snapshot!.manifest || {},
        workspaceMetadata: snapshot!.workspaceMetadata || {},
        storageState: snapshot!.storageState || {},
        directoryManifest: Array.isArray(snapshot!.directoryManifest) ? snapshot!.directoryManifest : [],
        healthSummary: snapshot!.healthSummary || {},
        consistencySummary: snapshot!.consistencySummary || {},
        validatedStartAt: snapshot!.validatedStartAt || '',
        createdAt: snapshot!.createdAt,
        updatedAt: snapshot!.updatedAt,
      },
    });
  })
);

export default router;
