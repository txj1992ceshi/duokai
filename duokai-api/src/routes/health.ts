import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { connectMongo } from '../lib/mongodb.js';
import { AgentModel } from '../models/Agent.js';

const router = Router();
const AGENT_ACTIVE_WINDOW_MS = 2 * 60 * 1000;

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    let mongo = 'ok';
    let onlineAgents = 0;
    try {
      await connectMongo();
      onlineAgents = await AgentModel.countDocuments({
        status: { $ne: 'DISABLED' },
        lastSeenAt: { $gte: new Date(Date.now() - AGENT_ACTIVE_WINDOW_MS) },
      });
    } catch {
      mongo = 'error';
    }
    res.json({ success: true, api: 'ok', mongo, runtime: 'agent-managed', onlineAgents });
  }),
);

export default router;
