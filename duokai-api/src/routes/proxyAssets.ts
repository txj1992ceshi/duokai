import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { connectMongo } from '../lib/mongodb.js';
import { buildProxyAssetUsageMap, serializeProxyAssetWithUsage } from '../lib/proxyAssetUsage.js';
import { requireUser } from '../middlewares/auth.js';
import { AgentModel } from '../models/Agent.js';
import { IpLeaseModel } from '../models/IpLease.js';
import { ProfileModel } from '../models/Profile.js';
import { ProxyAssetModel } from '../models/ProxyAsset.js';

const router = Router();

router.use(requireUser);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const userId = req.authUser!.userId;
    const [assets, profiles, leases, agents] = await Promise.all([
      ProxyAssetModel.find({
        userId,
      })
        .sort({ updatedAt: -1 })
        .lean(),
      ProfileModel.find({ userId }).select('_id proxyAssetId').lean(),
      IpLeaseModel.find({ userId }).select('proxyAssetId profileId state').lean(),
      AgentModel.find({ ownerUserId: userId }).select('runtimeStatus').lean(),
    ]);

    const runningProfileIds = agents.flatMap((agent) =>
      Array.isArray(agent.runtimeStatus?.runningProfileIds)
        ? agent.runtimeStatus.runningProfileIds
            .map((item: unknown) => String(item || '').trim())
            .filter(Boolean)
        : []
    );
    const usageMap = buildProxyAssetUsageMap(assets, profiles, leases, runningProfileIds);

    res.json({
      success: true,
      proxyAssets: assets.map((asset) =>
        serializeProxyAssetWithUsage(asset as Record<string, unknown>, usageMap.get(String(asset._id)))
      ),
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const body = req.body || {};

    const created = await ProxyAssetModel.create({
      userId: req.authUser!.userId,
      name: String(body.name || 'New Proxy Asset').trim(),
      type: String(body.type || 'http').trim(),
      host: String(body.host || '').trim(),
      port: Number(body.port || 0) || 0,
      username: String(body.username || '').trim(),
      password: String(body.password || ''),
      bindingMode: String(body.bindingMode || 'dedicated').trim() || 'dedicated',
      sharingMode: String(body.sharingMode || 'dedicated').trim() || 'dedicated',
      maxProfilesPerIp: Number(body.maxProfilesPerIp || 1) || 1,
      maxConcurrentRunsPerIp: Number(body.maxConcurrentRunsPerIp || 1) || 1,
      status: String(body.status || 'draft').trim() || 'draft',
      platformScope: Array.isArray(body.platformScope) ? body.platformScope : [],
      purposeScope: Array.isArray(body.purposeScope) ? body.purposeScope : [],
      cooldownUntil: body.cooldownUntil ? new Date(String(body.cooldownUntil)) : null,
      lastVerifiedIp: String(body.lastVerifiedIp || '').trim(),
      lastVerifiedCountry: String(body.lastVerifiedCountry || '').trim(),
      notes: String(body.notes || '').trim(),
    });

    res.status(201).json({ success: true, proxyAsset: created });
  })
);

export default router;
