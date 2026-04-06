import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { getDefaultPlatformPolicies } from '../lib/platformPolicies.js';
import { requireUser } from '../middlewares/auth.js';
import { PlatformPolicyModel } from '../models/PlatformPolicy.js';

const router = Router();

router.use(requireUser);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const requestedPlatform = String(req.query.platform || '').trim();
    const requestedPurpose = String(req.query.purpose || '').trim();
    const query: Record<string, unknown> = { active: true };
    if (requestedPlatform) {
      query.platform = requestedPlatform;
    }
    if (requestedPurpose) {
      query.purpose = requestedPurpose;
    }

    const policies = await PlatformPolicyModel.find(query)
      .sort({ platform: 1, purpose: 1, version: -1 })
      .lean();

    if (policies.length > 0) {
      res.json({ success: true, source: 'mongo', policies });
      return;
    }

    const defaults = getDefaultPlatformPolicies().filter((policy) => {
      if (requestedPlatform && policy.platform !== requestedPlatform) {
        return false;
      }
      if (requestedPurpose && policy.purpose !== requestedPurpose) {
        return false;
      }
      return true;
    });

    res.json({ success: true, source: 'defaults', policies: defaults });
  })
);

export default router;
