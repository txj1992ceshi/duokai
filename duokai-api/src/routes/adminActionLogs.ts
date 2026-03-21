import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { requireAdmin } from '../middlewares/auth.js';
import { AdminActionLogModel } from '../models/AdminActionLog.js';

const router = Router();

router.use(requireAdmin);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const filter: Record<string, unknown> = {};
    if (typeof req.query.userId === 'string' && req.query.userId) {
      filter.targetType = 'user';
      filter.targetId = req.query.userId;
    }
    if (typeof req.query.relatedUserId === 'string' && req.query.relatedUserId) {
      filter.$or = [
        { targetType: 'user', targetId: req.query.relatedUserId },
        { action: 'transfer_profile_ownership', 'detail.fromUserId': req.query.relatedUserId },
        { action: 'transfer_profile_ownership', 'detail.toUserId': req.query.relatedUserId },
      ];
    }

    const limit = Math.min(Number(req.query.limit || 20), 100);
    const logs = await AdminActionLogModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      logs: logs.map((log) => ({
        id: String(log._id),
        adminUserId: String(log.adminUserId),
        adminEmail: log.adminEmail || '',
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId || '',
        targetLabel: log.targetLabel || '',
        detail: log.detail ?? null,
        createdAt: log.createdAt,
        updatedAt: log.updatedAt,
      })),
    });
  })
);

export default router;
