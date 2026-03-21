import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { getRuntimeUrl } from '../lib/runtime.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    let mongo = 'ok';
    let runtime = 'offline';

    try {
      await connectMongo();
    } catch {
      mongo = 'error';
    }

    try {
      const response = await fetch(`${getRuntimeUrl()}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      runtime = response.ok ? 'ok' : 'error';
    } catch {
      runtime = 'offline';
    }

    res.json({
      success: true,
      api: 'ok',
      mongo,
      runtime,
    });
  })
);

export default router;
