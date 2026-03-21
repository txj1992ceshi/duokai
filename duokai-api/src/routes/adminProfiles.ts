import { Router } from 'express';
import { logAdminAction } from '../lib/audit.js';
import { connectMongo } from '../lib/mongodb.js';
import { HttpError, asyncHandler } from '../lib/http.js';
import { serializeProfile } from '../lib/serializers.js';
import { requireAdmin } from '../middlewares/auth.js';
import { ProfileModel } from '../models/Profile.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';
import { UserModel } from '../models/User.js';

const router = Router();

router.use(requireAdmin);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : '';
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    const syncFilter = typeof req.query.syncFilter === 'string' ? req.query.syncFilter.trim() : '';
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 10)));

    const profileQuery: Record<string, unknown> = {};
    if (userId) {
      profileQuery.userId = userId;
    }

    if (keyword) {
      const regex = new RegExp(escapeRegExp(keyword), 'i');
      const matchedUsers = await UserModel.find({
        $or: [{ email: regex }, { name: regex }],
      })
        .select('_id')
        .lean();

      profileQuery.$or = [
        { name: regex },
        { proxyHost: regex },
        { expectedProxyIp: regex },
        ...(matchedUsers.length ? [{ userId: { $in: matchedUsers.map((user) => user._id) } }] : []),
      ];
    }

    const [profiles, storageStates, users] = await Promise.all([
      ProfileModel.find(profileQuery).sort({ createdAt: -1 }).lean(),
      ProfileStorageStateModel.find({}).select('profileId').lean(),
      UserModel.find({}).select('_id email name status').lean(),
    ]);

    const syncedProfileIds = new Set(storageStates.map((item) => String(item.profileId)));
    const userMap = new Map(
      users.map((user) => [
        String(user._id),
        {
          ownerEmail: user.email,
          ownerName: user.name || '',
        },
      ])
    );

    const hydratedProfiles = profiles.map((profile) => ({
      ...serializeProfile(profile, syncedProfileIds.has(String(profile._id))),
      ...(userMap.get(String(profile.userId)) || { ownerEmail: '', ownerName: '' }),
    }));

    const filteredProfiles =
      syncFilter === 'ready' || syncFilter === 'partial' || syncFilter === 'empty'
        ? hydratedProfiles.filter((profile) => getSyncProfileStatus(profile) === syncFilter)
        : hydratedProfiles;

    const total = filteredProfiles.length;
    const pagedProfiles = filteredProfiles.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      success: true,
      profiles: pagedProfiles.map((profile) => ({
        ...profile,
      })),
      total,
      page,
      pageSize,
      stats: {
        totalProfiles: total,
        readyProfiles: filteredProfiles.filter((profile) => getSyncProfileStatus(profile) === 'ready')
          .length,
        partialProfiles: filteredProfiles.filter(
          (profile) => getSyncProfileStatus(profile) === 'partial'
        ).length,
        syncedStorageProfiles: filteredProfiles.filter((profile) => Boolean(profile.storageStateSynced))
          .length,
      },
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const [profile, storageState, users] = await Promise.all([
      ProfileModel.findById(req.params.id).lean(),
      ProfileStorageStateModel.findOne({ profileId: req.params.id }).select('_id').lean(),
      UserModel.find({}).select('_id email name').lean(),
    ]);

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const owner = users.find((item) => String(item._id) === String(profile.userId));

    res.json({
      success: true,
      profile: {
        ...serializeProfile(profile, !!storageState),
        ownerEmail: owner?.email || '',
        ownerName: owner?.name || '',
      },
    });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const nextUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    if (!nextUserId) {
      throw new HttpError(400, 'userId is required');
    }

    const [profile, targetUser, users, storageState] = await Promise.all([
      ProfileModel.findById(req.params.id),
      UserModel.findById(nextUserId).lean(),
      UserModel.find({}).select('_id email name').lean(),
      ProfileStorageStateModel.findOne({ profileId: req.params.id }).select('_id').lean(),
    ]);

    if (!profile) {
      throw new HttpError(404, 'Profile not found');
    }

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
      ])
    );

    const fromUserId = String(profile.userId);
    const fromOwner = ownerMap.get(fromUserId) || { ownerEmail: '', ownerName: '' };
    const toOwner = ownerMap.get(String(targetUser._id)) || {
      ownerEmail: targetUser.email || '',
      ownerName: targetUser.name || '',
    };

    profile.userId = targetUser._id;
    await profile.save();

    await logAdminAction({
      adminUserId: req.authUser!.userId,
      adminEmail: req.authUser!.email,
      action: 'transfer_profile_ownership',
      targetType: 'profile',
      targetId: String(profile._id),
      targetLabel: profile.name,
      detail: {
        fromUserId,
        fromOwnerEmail: fromOwner.ownerEmail,
        toUserId: String(targetUser._id),
        toOwnerEmail: toOwner.ownerEmail,
      },
    });

    res.json({
      success: true,
      profile: {
        ...serializeProfile(profile.toObject(), !!storageState),
        ownerEmail: toOwner.ownerEmail,
        ownerName: toOwner.ownerName,
      },
    });
  })
);

export default router;
