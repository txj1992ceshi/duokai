import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { serializeSetting } from '../lib/serializers.js';
import { requireUser } from '../middlewares/auth.js';
import { SettingModel } from '../models/Setting.js';

const DEFAULT_SETTINGS = {
  autoFingerprint: true,
  autoProxyVerification: true,
  defaultStartupPlatform: '',
  defaultStartupUrl: '',
  theme: 'system',
};

const router = Router();

router.use(requireUser);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const settings = await SettingModel.findOne({ userId: authUser.userId }).lean();

    res.json({
      success: true,
      settings: settings ? serializeSetting(settings) : DEFAULT_SETTINGS,
    });
  })
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const body = req.body || {};

    const settings = await SettingModel.findOneAndUpdate(
      { userId: authUser.userId },
      {
        userId: authUser.userId,
        autoFingerprint:
          typeof body.autoFingerprint === 'boolean'
            ? body.autoFingerprint
            : DEFAULT_SETTINGS.autoFingerprint,
        autoProxyVerification:
          typeof body.autoProxyVerification === 'boolean'
            ? body.autoProxyVerification
            : DEFAULT_SETTINGS.autoProxyVerification,
        defaultStartupPlatform: String(body.defaultStartupPlatform || ''),
        defaultStartupUrl: String(body.defaultStartupUrl || ''),
        theme: String(body.theme || 'system'),
      },
      {
        upsert: true,
        new: true,
      }
    ).lean();

    res.json({
      success: true,
      settings: serializeSetting(settings),
    });
  })
);

export default router;
