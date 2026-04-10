import { Router } from 'express';
import { asyncHandler } from '../lib/http.js';
import { connectMongo } from '../lib/mongodb.js';
import { requireUser } from '../middlewares/auth.js';
import { AgentConfigStateModel } from '../models/AgentConfigState.js';

const router = Router();

function resolveUserConfigStateId(userId: string) {
  return `user:${userId}`;
}

function buildEmptySnapshot() {
  return {
    syncVersion: 0,
    profiles: [],
    proxies: [],
    templates: [],
    cloudPhones: [],
    settings: {},
  };
}

router.get(
  '/snapshot',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();
    const stateId = resolveUserConfigStateId(req.authUser!.userId);
    const state = await AgentConfigStateModel.findOne({ agentId: stateId }).lean();

    if (!state) {
      res.json({ success: true, snapshot: buildEmptySnapshot() });
      return;
    }

    res.json({
      success: true,
      snapshot: {
        syncVersion: Number(state.syncVersion || 0),
        profiles: Array.isArray(state.profiles) ? state.profiles : [],
        proxies: Array.isArray(state.proxies) ? state.proxies : [],
        templates: Array.isArray(state.templates) ? state.templates : [],
        cloudPhones: Array.isArray(state.cloudPhones) ? state.cloudPhones : [],
        settings: state.settings && typeof state.settings === 'object' ? state.settings : {},
      },
    });
  })
);

router.post(
  '/push',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();

    const stateId = resolveUserConfigStateId(req.authUser!.userId);
    const clientSyncVersion = Number(req.body?.syncVersion || 0);
    const profiles = Array.isArray(req.body?.profiles) ? req.body.profiles : [];
    const proxies = Array.isArray(req.body?.proxies) ? req.body.proxies : [];
    const templates = Array.isArray(req.body?.templates) ? req.body.templates : [];
    const cloudPhones = Array.isArray(req.body?.cloudPhones) ? req.body.cloudPhones : [];
    const settings =
      req.body?.settings && typeof req.body.settings === 'object'
        ? (req.body.settings as Record<string, unknown>)
        : {};

    const current = await AgentConfigStateModel.findOne({ agentId: stateId });
    const currentVersion = Number(current?.syncVersion || 0);

    if (current && clientSyncVersion !== currentVersion) {
      res.status(409).json({
        success: false,
        error: 'sync version mismatch',
        snapshot: {
          syncVersion: currentVersion,
          profiles: Array.isArray(current.profiles) ? current.profiles : [],
          proxies: Array.isArray(current.proxies) ? current.proxies : [],
          templates: Array.isArray(current.templates) ? current.templates : [],
          cloudPhones: Array.isArray(current.cloudPhones) ? current.cloudPhones : [],
          settings: current.settings && typeof current.settings === 'object' ? current.settings : {},
        },
      });
      return;
    }

    const nextVersion = currentVersion + 1;
    const saved = await AgentConfigStateModel.findOneAndUpdate(
      { agentId: stateId },
      {
        $set: {
          syncVersion: nextVersion,
          profiles,
          proxies,
          templates,
          cloudPhones,
          settings,
        },
      },
      { upsert: true, new: true }
    ).lean();

    res.json({
      success: true,
      syncVersion: Number(saved?.syncVersion || nextVersion),
      updatedAt: saved?.updatedAt || new Date(),
    });
  })
);

export default router;
