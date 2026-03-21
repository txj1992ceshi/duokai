import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { serializeGroup } from '../lib/serializers.js';
import { requireUser } from '../middlewares/auth.js';
import { GroupModel } from '../models/Group.js';

const router = Router();

router.use(requireUser);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const groups = await GroupModel.find({ userId: authUser.userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      groups: groups.map(serializeGroup),
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
      res.status(400).json({ success: false, error: 'Group name is required' });
      return;
    }

    const group = await GroupModel.create({
      userId: authUser.userId,
      name,
      color: String(req.body?.color || ''),
      notes: String(req.body?.notes || ''),
    });

    res.json({
      success: true,
      group: serializeGroup(group),
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const group = await GroupModel.findOne({
      _id: req.params.id,
      userId: authUser.userId,
    }).lean();

    if (!group) {
      res.status(404).json({ success: false, error: 'Group not found' });
      return;
    }

    res.json({
      success: true,
      group: serializeGroup(group),
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
        res.status(400).json({ success: false, error: 'Group name is required' });
        return;
      }
      updateData.name = name;
    }
    if (typeof req.body?.color === 'string') updateData.color = req.body.color;
    if (typeof req.body?.notes === 'string') updateData.notes = req.body.notes;

    const group = await GroupModel.findOneAndUpdate(
      { _id: req.params.id, userId: authUser.userId },
      updateData,
      { new: true }
    ).lean();

    if (!group) {
      res.status(404).json({ success: false, error: 'Group not found' });
      return;
    }

    res.json({
      success: true,
      group: serializeGroup(group),
    });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const group = await GroupModel.findOneAndDelete({
      _id: req.params.id,
      userId: authUser.userId,
    }).lean();

    if (!group) {
      res.status(404).json({ success: false, error: 'Group not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Group deleted successfully',
    });
  })
);

export default router;
