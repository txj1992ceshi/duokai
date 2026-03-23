import { Router } from 'express';
import { logAdminAction } from '../lib/audit.js';
import { hashPassword } from '../lib/auth.js';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { serializeUser } from '../lib/serializers.js';
import { isValidSubscriptionStatus, normalizeSubscriptionShape, syncUserSubscriptionState } from '../lib/subscription.js';
import { requireAdmin } from '../middlewares/auth.js';
import { UserModel } from '../models/User.js';

const router = Router();

router.use(requireAdmin);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    await connectMongo();
    const users = await UserModel.find({}).sort({ createdAt: -1 });
    await Promise.all(users.map((user) => syncUserSubscriptionState(user)));
    res.json({
      success: true,
      users: users.map(serializeUser),
    });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const email = String(req.body?.email || '').trim().toLowerCase();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();
    const role = req.body?.role === 'admin' ? 'admin' : 'user';

    if ((!email && !username) || !password) {
      res
        .status(400)
        .json({ success: false, error: '请输入邮箱或账号，以及密码' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      return;
    }

    if (email) {
      const exists = await UserModel.findOne({ email }).lean();
      if (exists) {
        res.status(409).json({ success: false, error: 'Email already exists' });
        return;
      }
    }

    if (username) {
      const exists = await UserModel.findOne({ username }).lean();
      if (exists) {
        res.status(409).json({ success: false, error: '账号已存在' });
        return;
      }
    }

    const passwordHash = await hashPassword(password);
    const user = await UserModel.create({
      ...(email ? { email } : {}),
      ...(username ? { username } : {}),
      passwordHash,
      name,
      role,
      status: 'active',
    });

    await logAdminAction({
      adminUserId: req.authUser!.userId,
      adminEmail: req.authUser!.email,
      action: 'create_user',
      targetType: 'user',
      targetId: String(user._id),
      targetLabel: user.email || user.username || String(user._id),
      detail: {
        email: user.email || '',
        username: user.username || '',
        role: user.role,
        status: user.status,
      },
    });

    res.json({
      success: true,
      user: serializeUser(user),
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
      updateData.name = req.body.name.trim();
    }
    if (typeof req.body?.username === 'string') {
      const username = req.body.username.trim().toLowerCase();
      if (!username) {
        updateData.$unset = { ...(updateData.$unset as Record<string, string> | undefined), username: '' };
      } else {
        const exists = await UserModel.findOne({
          username,
          _id: { $ne: req.params.id },
        }).lean();
        if (exists) {
          res.status(409).json({ success: false, error: '账号已存在' });
          return;
        }
        updateData.username = username;
      }
    }
    if (req.body?.role === 'user' || req.body?.role === 'admin') {
      updateData.role = req.body.role;
    }
    if (req.body?.status === 'active' || req.body?.status === 'disabled') {
      updateData.status = req.body.status;
    }
    if (typeof req.body?.password === 'string') {
      const password = req.body.password;
      if (password.length < 6) {
        res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        return;
      }
      updateData.passwordHash = await hashPassword(password);
    }
    if (req.body?.subscription && typeof req.body.subscription === 'object') {
      const subscription = req.body.subscription as Record<string, unknown>;
      const nextPlan = String(subscription.plan || '').trim();
      const nextStatus = String(subscription.status || '').trim().toLowerCase();
      const nextExpiresAt = subscription.expiresAt ? new Date(String(subscription.expiresAt)) : null;

      if (nextStatus && !isValidSubscriptionStatus(nextStatus)) {
        res.status(400).json({ success: false, error: 'Invalid subscription status' });
        return;
      }

      updateData.subscription = normalizeSubscriptionShape({
        plan: nextPlan || 'free',
        status: nextStatus || (nextPlan === 'free' ? 'free' : 'active'),
        expiresAt:
          nextExpiresAt && !Number.isNaN(nextExpiresAt.getTime()) ? nextExpiresAt : null,
      });
    }

    if (req.params.id === authUser.userId && req.body?.role === 'user') {
      res.status(400).json({ success: false, error: 'You cannot remove your own admin role' });
      return;
    }

    if (req.params.id === authUser.userId && req.body?.status === 'disabled') {
      res.status(400).json({ success: false, error: 'You cannot disable your own account' });
      return;
    }

    const user = await UserModel.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    }).lean();

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const action =
      typeof req.body?.password === 'string'
        ? 'reset_user_password'
        : req.body?.role === 'user' || req.body?.role === 'admin'
          ? 'change_user_role'
          : req.body?.status === 'active' || req.body?.status === 'disabled'
            ? 'change_user_status'
            : typeof req.body?.name === 'string'
              ? 'update_user_name'
              : 'update_user';

    await logAdminAction({
      adminUserId: authUser.userId,
      adminEmail: authUser.email,
      action,
      targetType: 'user',
      targetId: String(user._id),
      targetLabel: user.email || user.username || String(user._id),
      detail: {
        email: user.email || '',
        username: user.username || '',
        name: user.name,
        role: user.role,
        status: user.status,
        subscription: user.subscription || null,
      },
    });

    res.json({
      success: true,
      user: serializeUser(user),
    });
  })
);

router.post(
  '/:id/devices/:deviceId/revoke',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const user = await UserModel.findById(req.params.id);

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const device = Array.isArray(user.devices)
      ? user.devices.find((item: any) => String(item.deviceId) === String(req.params.deviceId))
      : null;

    if (!device) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    device.revokedAt = new Date();
    device.sessionToken = '';
    await user.save();

    await logAdminAction({
      adminUserId: authUser.userId,
      adminEmail: authUser.email,
      action: 'revoke_user_device',
      targetType: 'user',
      targetId: String(user._id),
      targetLabel: user.email || user.username || String(user._id),
      detail: {
        deviceId: device.deviceId,
        deviceName: device.deviceName || '',
      },
    });

    res.json({
      success: true,
      user: serializeUser(user),
    });
  })
);

router.delete(
  '/:id/devices/:deviceId',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const user = await UserModel.findById(req.params.id);

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const nextDevices = Array.isArray(user.devices)
      ? user.devices.filter((item: any) => String(item.deviceId) !== String(req.params.deviceId))
      : [];

    if (nextDevices.length === user.devices.length) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    user.devices = nextDevices as any;
    await user.save();

    await logAdminAction({
      adminUserId: authUser.userId,
      adminEmail: authUser.email,
      action: 'delete_user_device',
      targetType: 'user',
      targetId: String(user._id),
      targetLabel: user.email || user.username || String(user._id),
      detail: {
        deviceId: String(req.params.deviceId),
      },
    });

    res.json({
      success: true,
      user: serializeUser(user),
    });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const isPermanent = String(req.query.permanent || '') === 'true';

    if (req.params.id === authUser.userId) {
      res.status(400).json({ success: false, error: 'You cannot delete your own account' });
      return;
    }

    if (isPermanent) {
      const user = await UserModel.findByIdAndDelete(req.params.id).lean();

      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      await logAdminAction({
        adminUserId: authUser.userId,
        adminEmail: authUser.email,
        action: 'delete_user',
        targetType: 'user',
        targetId: String(user._id),
        targetLabel: user.email || user.username || String(user._id),
      });

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
      return;
    }

    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      { status: 'disabled' },
      { new: true }
    ).lean();

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    await logAdminAction({
      adminUserId: authUser.userId,
      adminEmail: authUser.email,
      action: 'disable_user',
      targetType: 'user',
      targetId: String(user._id),
      targetLabel: user.email || user.username || String(user._id),
    });

    res.json({
      success: true,
      message: 'User disabled successfully',
      user: serializeUser(user),
    });
  })
);

export default router;
