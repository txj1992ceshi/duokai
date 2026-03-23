import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { requireUser } from '../middlewares/auth.js';
import { ProfileModel } from '../models/Profile.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';

const router = Router();

router.use(requireUser);

router.get(
  '/:profileId',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const profileId = req.params.profileId;

    const profile = await ProfileModel.findOne({
      _id: profileId,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const storageState = await ProfileStorageStateModel.findOne({
      userId: authUser.userId,
      profileId,
    }).lean();

    res.json({
      success: true,
      storageState: storageState
        ? {
            id: String(storageState._id),
            userId: String(storageState.userId),
            profileId: String(storageState.profileId),
            stateJson: storageState.stateJson,
            version: storageState.version,
            encrypted: storageState.encrypted,
            deviceId: storageState.deviceId || '',
            updatedBy: storageState.updatedBy || '',
            source: storageState.source || 'desktop',
            stateHash: storageState.stateHash || '',
            createdAt: storageState.createdAt,
            updatedAt: storageState.updatedAt,
          }
        : null,
    });
  })
);

router.put(
  '/:profileId',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const profileId = req.params.profileId;
    const body = req.body || {};

    const profile = await ProfileModel.findOne({
      _id: profileId,
      userId: authUser.userId,
    }).lean();

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    if (body.stateJson === undefined) {
      res.status(400).json({ success: false, error: 'stateJson is required' });
      return;
    }

    const baseVersion = Number(body.baseVersion ?? 0);
    if (!Number.isFinite(baseVersion) || baseVersion < 0) {
      res.status(400).json({ success: false, error: 'baseVersion must be a non-negative number' });
      return;
    }

    const deviceId = String(body.deviceId || '').trim();
    if (!deviceId) {
      res.status(400).json({ success: false, error: 'deviceId is required' });
      return;
    }

    const existing = await ProfileStorageStateModel.findOne({
      userId: authUser.userId,
      profileId,
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
    const source = String(body.source || 'desktop').trim() || 'desktop';
    const stateHash = String(body.stateHash || '').trim();

    const storageState = await ProfileStorageStateModel.findOneAndUpdate(
      {
        userId: authUser.userId,
        profileId,
      },
      {
        userId: authUser.userId,
        profileId,
        stateJson: body.stateJson,
        encrypted: !!body.encrypted,
        version: nextVersion,
        deviceId,
        updatedBy: String(authUser.userId),
        source,
        stateHash,
      },
      {
        upsert: true,
        new: true,
      }
    ).lean();

    res.json({
      success: true,
      storageState: {
        id: String(storageState!._id),
        userId: String(storageState!.userId),
        profileId: String(storageState!.profileId),
        version: storageState!.version,
        deviceId: storageState!.deviceId || '',
        updatedBy: storageState!.updatedBy || '',
        source: storageState!.source || 'desktop',
        stateHash: storageState!.stateHash || '',
        updatedAt: storageState!.updatedAt,
      },
    });
  })
);

export default router;
