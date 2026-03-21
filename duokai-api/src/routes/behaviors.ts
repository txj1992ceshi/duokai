import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { serializeBehavior } from '../lib/serializers.js';
import { requireUser } from '../middlewares/auth.js';
import { BehaviorModel } from '../models/Behavior.js';

const router = Router();

router.use(requireUser);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const behaviors = await BehaviorModel.find({ userId: authUser.userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      behaviors: behaviors.map(serializeBehavior),
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const name = String(req.body?.name || '').trim();

    if (!name) {
      res.status(400).json({ success: false, error: 'Behavior name is required' });
      return;
    }

    const behavior = await BehaviorModel.create({
      userId: authUser.userId,
      name,
      description: String(req.body?.description || ''),
      enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : true,
      actions: Array.isArray(req.body?.actions) ? req.body.actions : [],
    });

    res.json({
      success: true,
      behavior: serializeBehavior(behavior),
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const behavior = await BehaviorModel.findOne({
      _id: req.params.id,
      userId: authUser.userId,
    }).lean();

    if (!behavior) {
      res.status(404).json({ success: false, error: 'Behavior not found' });
      return;
    }

    res.json({
      success: true,
      behavior: serializeBehavior(behavior),
    });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const updateData: Record<string, unknown> = {};

    if (typeof req.body?.name === 'string') {
      const name = req.body.name.trim();
      if (!name) {
        res.status(400).json({ success: false, error: 'Behavior name is required' });
        return;
      }
      updateData.name = name;
    }
    if (typeof req.body?.description === 'string') updateData.description = req.body.description;
    if (typeof req.body?.enabled === 'boolean') updateData.enabled = req.body.enabled;
    if (Array.isArray(req.body?.actions)) updateData.actions = req.body.actions;

    const behavior = await BehaviorModel.findOneAndUpdate(
      { _id: req.params.id, userId: authUser.userId },
      updateData,
      { new: true }
    ).lean();

    if (!behavior) {
      res.status(404).json({ success: false, error: 'Behavior not found' });
      return;
    }

    res.json({
      success: true,
      behavior: serializeBehavior(behavior),
    });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const behavior = await BehaviorModel.findOneAndDelete({
      _id: req.params.id,
      userId: authUser.userId,
    }).lean();

    if (!behavior) {
      res.status(404).json({ success: false, error: 'Behavior not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Behavior deleted successfully',
    });
  })
);

export default router;
