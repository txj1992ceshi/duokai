import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { requireUser } from '../middlewares/auth.js';

const router = Router();
router.use(requireUser);

router.post(
  '/',
  asyncHandler(async (_req, res) => {
    res.status(410).json({
      success: false,
      code: 'LEGACY_DIRECT_LAUNCH_RETIRED',
      error: '服务器端直接启动浏览器入口已退役。',
      detail: '使用 /api/control-plane/runtime 向已注册的 Duokai Desktop Agent 下发 start 任务。',
    });
  }),
);

export default router;
