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

    const existing = await ProfileStorageStateModel.findOne({
      userId: authUser.userId,
      profileId,
    }).lean();
    const nextVersion = existing ? (existing.version || 1) + 1 : 1;

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
        updatedAt: storageState!.updatedAt,
      },
    });
  })
);

export default router;
