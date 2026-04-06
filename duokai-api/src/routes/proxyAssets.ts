import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { connectMongo } from '../lib/mongodb.js';
import { requireUser } from '../middlewares/auth.js';
import { ProxyAssetModel } from '../models/ProxyAsset.js';

const router = Router();

router.use(requireUser);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const assets = await ProxyAssetModel.find({
      userId: req.authUser!.userId,
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ success: true, proxyAssets: assets });
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
