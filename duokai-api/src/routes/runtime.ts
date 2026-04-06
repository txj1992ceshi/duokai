import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { getForwardAuthHeaders, getRuntimeApiKey, getRuntimeUrl } from '../lib/runtime.js';
import { resolveStorageStateJson } from '../lib/storageArtifacts.js';
import { requireUser } from '../middlewares/auth.js';
import { ProfileModel } from '../models/Profile.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';

const router = Router();

router.use(requireUser);

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const baseUrl = getRuntimeUrl();
    const profiles = await ProfileModel.find({
      userId: authUser.userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    try {
      const health = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });

      if (!health.ok) {
        res.json({ online: false, sessions: [] });
        return;
      }

      try {
        const runtimeRes = await fetch(`${baseUrl}/session/list`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });

        if (!runtimeRes.ok) {
          res.json({ online: true, sessions: [], degraded: true });
          return;
        }

        const sessions = (await runtimeRes.json()) as Array<{
          profileId: string;
          [key: string]: unknown;
        }>;

        const enriched = sessions.map((session) => {
          const profile = profiles.find((item) => String(item._id) === session.profileId);
          return {
            ...session,
            profileName: profile?.name || session.profileId,
          };
        });

        res.json({ online: true, sessions: enriched });
      } catch {
        res.json({ online: true, sessions: [], degraded: true });
      }
    } catch {
      res.json({ online: false, sessions: [] });
    }
  })
);

router.post(
  '/:action',
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const action = String(req.params.action || '');
    const payload = (req.body || {}) as Record<string, unknown>;

    const endpointMap: Record<string, string> = {
      start: '/session/start',
      stop: '/session/stop',
      action: '/session/action',
    };
    const endpoint = endpointMap[action];

    if (!endpoint) {
      res.status(400).json({ error: `Unknown action: ${action}` });
      return;
    }

    let ownedProfile: { _id: unknown; name?: string } | null = null;

    if (action === 'start') {
      const profileId = String(
        payload.profileId || (payload.profile as Record<string, unknown> | undefined)?.id || ''
      );

      if (!profileId) {
        res.status(400).json({ success: false, error: 'profileId is required' });
        return;
      }

      ownedProfile = await ProfileModel.findOne({
        _id: profileId,
        userId: authUser.userId,
      }).lean();
    } else {
      const sessionId = String(payload.sessionId || '');
      if (!sessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      ownedProfile = await ProfileModel.findOne({
        userId: authUser.userId,
        runtimeSessionId: sessionId,
      }).lean();
    }

    if (!ownedProfile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    if (action === 'start') {
      payload.profileId = String(ownedProfile._id);
      payload.profile = {
        ...(payload.profile as Record<string, unknown> | undefined),
        id: String(ownedProfile._id),
      };

      const syncedStorageState = await ProfileStorageStateModel.findOne({
        userId: authUser.userId,
        profileId: ownedProfile._id,
      }).lean();

      payload.storageState = await resolveStorageStateJson({
        inlineStateJson: syncedStorageState?.inlineStateJson,
        stateJson: syncedStorageState?.stateJson,
        fileRef: syncedStorageState?.fileRef || '',
      });
      payload.storageStateMetadata = syncedStorageState
        ? {
            version: syncedStorageState.version || 0,
            stateHash: syncedStorageState.stateHash || '',
            fileRef: syncedStorageState.fileRef || '',
            checksum: syncedStorageState.checksum || '',
            size: syncedStorageState.size || 0,
            contentType: syncedStorageState.contentType || 'application/json',
          }
        : null;
    }

    const runtimeResponse = await fetch(`${getRuntimeUrl()}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-runtime-key': getRuntimeApiKey(),
        ...getForwardAuthHeaders(req),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(action === 'start' ? 60000 : 10000),
    });

    let json: unknown = {};
    try {
      json = await runtimeResponse.json();
    } catch {}

    res.status(runtimeResponse.status).json(json);
  })
);

router.post(
  '/launch',
  asyncHandler(async (req, res) => {
    res.status(410).json({
      success: false,
      error: 'Direct server-side launch is deprecated. Use control plane task dispatch to a local desktop runtime.',
      deprecated: true,
    });
  })
);

export default router;
