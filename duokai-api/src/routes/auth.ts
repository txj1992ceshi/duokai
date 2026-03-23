import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { comparePassword, hashPassword, signToken, verifyToken } from '../lib/auth.js';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { serializeUser } from '../lib/serializers.js';
import { syncUserSubscriptionState } from '../lib/subscription.js';
import { requireUser } from '../middlewares/auth.js';
import { UserModel } from '../models/User.js';

const router = Router();

function normalizePlatform(value: unknown): string {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text.includes('mac')) return 'macOS';
  if (text.includes('win')) return 'Windows';
  if (text.includes('linux')) return 'Linux';
  return String(value || '').trim();
}

function buildDevicePatch(body: any) {
  const device = body?.device;
  const deviceId = String(device?.deviceId || '').trim();
  if (!deviceId) {
    return null;
  }
  const now = new Date();
  return {
    deviceId,
    deviceName: String(device?.deviceName || '').trim(),
    platform: normalizePlatform(device?.platform),
    source: String(device?.source || 'desktop').trim() || 'desktop',
    sessionToken: randomUUID(),
    revokedAt: null,
    lastSeenAt: now,
    lastLoginAt: now,
  };
}

function parseAvatarDataUrl(value: unknown) {
  const input = String(value || '').trim();
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(input);
  if (!match) {
    return null;
  }
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, '');
  const sizeBytes = Buffer.byteLength(base64, 'base64');
  if (sizeBytes <= 0 || sizeBytes > 1024 * 1024 * 2) {
    return null;
  }
  return {
    mimeType,
    sizeBytes,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const email = String(req.body?.email || '').trim().toLowerCase();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();

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
      role: 'user',
      status: 'active',
    });

    const token = signToken({
      userId: user._id.toString(),
      email: user.email || user.username || '',
      role: user.role,
    });

    res.json({
      success: true,
      token,
      user: serializeUser(user),
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const identifier = String(req.body?.identifier || req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      res
        .status(400)
        .json({ success: false, error: '请输入邮箱或账号，以及密码' });
      return;
    }

    const user = await UserModel.findOne(
      identifier.includes('@')
        ? { email: identifier }
        : { $or: [{ username: identifier }, { email: identifier }] }
    );
    if (!user) {
      res.status(401).json({ success: false, error: '账号或密码无效' });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({ success: false, error: 'Account is disabled' });
      return;
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ success: false, error: '账号或密码无效' });
      return;
    }

    await syncUserSubscriptionState(user);

    const devicePatch = buildDevicePatch(req.body);
    if (devicePatch) {
      const nextDevices = Array.isArray(user.devices)
        ? user.devices.filter((item: any) => String(item.deviceId) !== devicePatch.deviceId)
        : [];
      nextDevices.unshift(devicePatch as any);
      user.devices = nextDevices.slice(0, 10) as any;
      await user.save();
    }

    const token = signToken({
      userId: user._id.toString(),
      email: user.email || user.username || '',
      role: user.role,
      deviceId: devicePatch?.deviceId || '',
      sessionToken: devicePatch?.sessionToken || '',
    });

    res.json({
      success: true,
      token,
      user: serializeUser(user),
    });
  })
);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    await connectMongo();

    const authHeader = req.header('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const user = await UserModel.findById(payload.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    await syncUserSubscriptionState(user);

    res.json({
      success: true,
      user: serializeUser(user),
    });
  })
);

router.patch(
  '/me',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();

    const authUser = req.authUser!;
    const body = req.body || {};
    const updateData: Record<string, unknown> = {};

    if (typeof body.name === 'string') {
      updateData.name = body.name.trim();
    }
    if (typeof body.avatarUrl === 'string') {
      updateData.avatarUrl = body.avatarUrl.trim();
    }
    if (typeof body.bio === 'string') {
      updateData.bio = body.bio.trim();
    }

    if (typeof body.email === 'string') {
      const email = body.email.trim().toLowerCase();
      if (email) {
        const exists = await UserModel.findOne({
          email,
          _id: { $ne: authUser.userId },
        }).lean();
        if (exists) {
          res.status(409).json({ success: false, error: 'Email already exists' });
          return;
        }
        updateData.email = email;
      }
    }

    if (typeof body.username === 'string') {
      const username = body.username.trim().toLowerCase();
      if (!username) {
        res.status(400).json({ success: false, error: '账号不能为空' });
        return;
      }
      const exists = await UserModel.findOne({
        username,
        _id: { $ne: authUser.userId },
      }).lean();
      if (exists) {
        res.status(409).json({ success: false, error: '账号已存在' });
        return;
      }
      updateData.username = username;
    }

    const user = await UserModel.findByIdAndUpdate(authUser.userId, updateData, {
      new: true,
      runValidators: true,
    }).lean();

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      user: serializeUser(user),
    });
  })
);

router.post(
  '/avatar',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();

    const authUser = req.authUser!;
    const parsed = parseAvatarDataUrl(req.body?.dataUrl);
    if (!parsed) {
      res.status(400).json({ success: false, error: '头像图片无效或超过 2MB' });
      return;
    }

    const user = await UserModel.findByIdAndUpdate(
      authUser.userId,
      { avatarUrl: parsed.dataUrl },
      { new: true, runValidators: true },
    ).lean();

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      user: serializeUser(user),
    });
  }),
);

router.post(
  '/devices/:deviceId/revoke',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();

    const authUser = req.authUser!;
    const deviceId = String(req.params.deviceId || '').trim();
    if (!deviceId) {
      res.status(400).json({ success: false, error: 'Missing deviceId' });
      return;
    }

    const user = await UserModel.findById(authUser.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const device = Array.isArray(user.devices)
      ? user.devices.find((item: any) => String(item.deviceId) === deviceId)
      : null;
    if (!device) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    device.revokedAt = new Date();
    device.sessionToken = '';
    await user.save();

    res.json({
      success: true,
      user: serializeUser(user),
    });
  }),
);

router.delete(
  '/devices/:deviceId',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();

    const authUser = req.authUser!;
    const deviceId = String(req.params.deviceId || '').trim();
    if (!deviceId) {
      res.status(400).json({ success: false, error: 'Missing deviceId' });
      return;
    }

    const user = await UserModel.findById(authUser.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const nextDevices = Array.isArray(user.devices)
      ? user.devices.filter((item: any) => String(item.deviceId) !== deviceId)
      : [];

    if (nextDevices.length === user.devices.length) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    user.devices = nextDevices as any;
    await user.save();

    res.json({
      success: true,
      user: serializeUser(user),
    });
  }),
);

router.post(
  '/change-password',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();

    const authUser = req.authUser!;
    const currentPassword = String(req.body?.currentPassword || '');
    const nextPassword = String(req.body?.nextPassword || '');

    if (!currentPassword || !nextPassword) {
      res.status(400).json({ success: false, error: '请输入当前密码和新密码' });
      return;
    }

    if (nextPassword.length < 6) {
      res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      return;
    }

    const user = await UserModel.findById(authUser.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const ok = await comparePassword(currentPassword, user.passwordHash);
    if (!ok) {
      res.status(401).json({ success: false, error: '当前密码不正确' });
      return;
    }

    user.passwordHash = await hashPassword(nextPassword);
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  })
);

export default router;
