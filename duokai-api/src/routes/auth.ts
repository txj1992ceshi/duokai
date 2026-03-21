import { Router } from 'express';
import { comparePassword, hashPassword, signToken, verifyToken } from '../lib/auth.js';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { serializeUser } from '../lib/serializers.js';
import { UserModel } from '../models/User.js';

const router = Router();

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

    const user = await UserModel.findById(payload.userId).lean();
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

export default router;
