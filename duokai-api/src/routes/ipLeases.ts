import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { logAdminAction } from '../lib/audit.js';
import { asyncHandler } from '../lib/http.js';
import { validateProfileLeaseForStart } from '../lib/ipLease.js';
import { connectMongo } from '../lib/mongodb.js';
import { requireUser } from '../middlewares/auth.js';
import { IpLeaseModel } from '../models/IpLease.js';
import { ProfileModel } from '../models/Profile.js';
import { ProxyAssetModel } from '../models/ProxyAsset.js';

const router = Router();

router.use(requireUser);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const leases = await IpLeaseModel.find({
      userId: req.authUser!.userId,
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ success: true, ipLeases: leases });
  })
);

router.post(
  '/acquire',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const body = req.body || {};
    const profileId = String(body.profileId || '').trim();
    const proxyAssetId = String(body.proxyAssetId || '').trim();
    const deviceId = String(body.deviceId || '').trim();

    if (!profileId || !proxyAssetId || !deviceId) {
      res.status(400).json({ success: false, error: 'profileId, proxyAssetId, and deviceId are required' });
      return;
    }

    const [profile, proxyAsset] = await Promise.all([
      ProfileModel.findOne({ _id: profileId, userId: req.authUser!.userId }),
      ProxyAssetModel.findOne({ _id: proxyAssetId, userId: req.authUser!.userId }),
    ]);

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }
    if (!proxyAsset) {
      res.status(404).json({ success: false, error: 'Proxy asset not found' });
      return;
    }

    const existingActive = await IpLeaseModel.findOne({
      userId: req.authUser!.userId,
      proxyAssetId,
      state: 'active',
      profileId: { $ne: profileId },
    }).lean();

    if (existingActive && proxyAsset.bindingMode === 'dedicated') {
      res.status(409).json({
        success: false,
        error: 'Dedicated proxy asset is already leased by another profile',
        code: 'DEDICATED_LEASE_CONFLICT',
        detail: {
          conflictingProfileId: existingActive.profileId,
          leaseId: existingActive.leaseId,
        },
      });
      return;
    }

    const leaseId = randomUUID();
    const lease = await IpLeaseModel.create({
      leaseId,
      userId: req.authUser!.userId,
      proxyAssetId,
      profileId,
      platform: String(profile.platform || profile.startupPlatform || '').trim(),
      purpose: String(profile.purpose || 'operation').trim() || 'operation',
      bindingMode: String(proxyAsset.bindingMode || 'dedicated').trim() || 'dedicated',
      state: 'active',
      egressIp: String(body.egressIp || proxyAsset.lastVerifiedIp || '').trim(),
      cooldownUntil: null,
      acquiredByDeviceId: deviceId,
    });

    profile.proxyAssetId = String(proxyAsset._id);
    profile.activeLeaseId = lease.leaseId;
    await profile.save();

    proxyAsset.currentLeaseId = lease.leaseId;
    proxyAsset.currentLeaseProfileId = profileId;
    proxyAsset.status = 'active';
    await proxyAsset.save();

    await logAdminAction({
      adminUserId: req.authUser!.userId,
      adminEmail: req.authUser!.email || '',
      action: 'ip_lease.acquire',
      targetType: 'ip_lease',
      targetId: lease.leaseId,
      targetLabel: `${profile.name}:${proxyAsset.name}`,
      detail: {
        profileId,
        proxyAssetId,
        deviceId,
      },
    });

    res.status(201).json({ success: true, ipLease: lease });
  })
);

router.post(
  '/release',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const leaseId = String(req.body?.leaseId || '').trim();

    if (!leaseId) {
      res.status(400).json({ success: false, error: 'leaseId is required' });
      return;
    }

    const lease = await IpLeaseModel.findOne({
      leaseId,
      userId: req.authUser!.userId,
    });

    if (!lease) {
      res.status(404).json({ success: false, error: 'Lease not found' });
      return;
    }

    lease.state = 'released';
    lease.releasedAt = new Date();
    if (req.body?.cooldownUntil) {
      lease.cooldownUntil = new Date(String(req.body.cooldownUntil));
    }
    await lease.save();

    await ProfileModel.updateOne(
      { _id: lease.profileId, userId: req.authUser!.userId, activeLeaseId: lease.leaseId },
      { $set: { activeLeaseId: '' } }
    );
    await ProxyAssetModel.updateOne(
      { _id: lease.proxyAssetId, userId: req.authUser!.userId },
      {
        $set: {
          currentLeaseId: '',
          currentLeaseProfileId: '',
          status: lease.cooldownUntil ? 'cooldown' : 'active',
          cooldownUntil: lease.cooldownUntil || null,
        },
      }
    );

    await logAdminAction({
      adminUserId: req.authUser!.userId,
      adminEmail: req.authUser!.email || '',
      action: 'ip_lease.release',
      targetType: 'ip_lease',
      targetId: lease.leaseId,
      targetLabel: lease.profileId,
      detail: {
        profileId: lease.profileId,
        proxyAssetId: lease.proxyAssetId,
        cooldownUntil: lease.cooldownUntil || null,
      },
    });

    res.json({ success: true, ipLease: lease });
  })
);

router.post(
  '/validate-launch',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const profileId = String(req.body?.profileId || '').trim();

    if (!profileId) {
      res.status(400).json({ success: false, error: 'profileId is required' });
      return;
    }

    const profile = await ProfileModel.findOne({
      _id: profileId,
      userId: req.authUser!.userId,
    }).lean();

    if (!profile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    const activeLease = await IpLeaseModel.findOne({
      userId: req.authUser!.userId,
      profileId,
      state: 'active',
    }).lean();

    const conflictingLeases =
      activeLease?.egressIp
        ? await IpLeaseModel.find({
            userId: req.authUser!.userId,
            egressIp: activeLease.egressIp,
            state: 'active',
          }).lean()
        : [];

    const validation = validateProfileLeaseForStart(profile, activeLease, conflictingLeases);
    res.status(validation.ok ? 200 : 409).json({ success: validation.ok, validation });
  })
);

export default router;
