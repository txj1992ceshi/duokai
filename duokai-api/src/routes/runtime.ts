import { Router } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { getForwardAuthHeaders, getRuntimeApiKey, getRuntimeUrl } from '../lib/runtime.js';
import { resolveStorageStateJson } from '../lib/storageArtifacts.js';
import {
  classifyRuntimeProxyFailure,
  classifyStorageArtifactFailure,
  parseRuntimeResponsePayload,
} from '../lib/runtimeProxy.js';
import { resolveRuntimeProfileForUser } from '../lib/runtimeProfiles.js';
import { requireUser } from '../middlewares/auth.js';
import { ProfileModel } from '../models/Profile.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';

const router = Router();

router.use(requireUser);

function logRuntimeRouteEvent(level: 'warn' | 'error', event: string, payload: Record<string, unknown>) {
  const logger = level === 'error' ? console.error : console.warn;
  logger(`[runtime-route] ${event}`, payload);
}

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

    let resolvedProfile:
      | {
          profile: Record<string, unknown>;
          profileId: string;
          source: 'mongo' | 'config';
        }
      | null = null;
    let runtimeSessionId = '';

    if (action === 'start') {
      const profileId = String(
        payload.profileId || (payload.profile as Record<string, unknown> | undefined)?.id || ''
      );

      if (!profileId) {
        res.status(400).json({ success: false, error: 'profileId is required' });
        return;
      }

      resolvedProfile = await resolveRuntimeProfileForUser(authUser.userId, profileId);
    } else {
      runtimeSessionId = String(payload.sessionId || '');
      if (!runtimeSessionId) {
        res.status(400).json({ success: false, error: 'sessionId is required' });
        return;
      }

      const ownedProfile = await ProfileModel.findOne({
        userId: authUser.userId,
        runtimeSessionId,
      }).lean();
      resolvedProfile = ownedProfile
        ? {
            profile: ownedProfile as Record<string, unknown>,
            profileId: String(ownedProfile._id),
            source: 'mongo' as const,
          }
        : null;
    }

    if (!resolvedProfile) {
      res.status(404).json({ success: false, error: 'Profile not found' });
      return;
    }

    if (action === 'start') {
      payload.profileId = resolvedProfile.profileId;
      payload.profile = {
        ...(payload.profile as Record<string, unknown> | undefined),
        id: resolvedProfile.profileId,
      };

      const syncedStorageState = await ProfileStorageStateModel.findOne({
        userId: authUser.userId,
        profileId: resolvedProfile.profileId,
      }).lean();

      if (syncedStorageState) {
        try {
          payload.storageState = await resolveStorageStateJson({
            inlineStateJson: syncedStorageState.inlineStateJson,
            stateJson: syncedStorageState.stateJson,
            fileRef: syncedStorageState.fileRef || '',
          });
          if (
            payload.storageState === null &&
            (syncedStorageState.inlineStateJson !== null ||
              syncedStorageState.stateJson !== null ||
              String(syncedStorageState.fileRef || '').trim())
          ) {
            res.status(424).json({
              success: false,
              code: 'STORAGE_STATE_ARTIFACT_INVALID',
              error: 'Synced storage-state artifact is invalid',
            });
            return;
          }
        } catch (error) {
          const classification = classifyStorageArtifactFailure(error);
          logRuntimeRouteEvent('warn', 'storage_state_resolve_failed', {
            action,
            requestedProfileId: String(
              payload.profileId || (payload.profile as Record<string, unknown> | undefined)?.id || ''
            ),
            resolvedProfileId: resolvedProfile.profileId,
            profileSource: resolvedProfile.source,
            sessionId: runtimeSessionId,
            runtimeUrl: getRuntimeUrl(),
            storageStateFileRef: syncedStorageState.fileRef || '',
            code: classification.code,
            error: error instanceof Error ? error.message : String(error),
          });
          res.status(classification.status).json({
            success: false,
            code: classification.code,
            error: classification.error,
          });
          return;
        }
      } else {
        payload.storageState = null;
      }
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

    try {
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

      const responsePayload = await parseRuntimeResponsePayload(runtimeResponse);
      if (!runtimeResponse.ok) {
        logRuntimeRouteEvent('warn', 'runtime_proxy_non_ok', {
          action,
          resolvedProfileId: resolvedProfile.profileId,
          profileSource: resolvedProfile.source,
          sessionId: runtimeSessionId,
          runtimeUrl: `${getRuntimeUrl()}${endpoint}`,
          runtimeStatus: runtimeResponse.status,
        });
      }
      res.status(runtimeResponse.status).json(responsePayload);
    } catch (error) {
      const classification = classifyRuntimeProxyFailure(error);
      logRuntimeRouteEvent('error', 'runtime_proxy_failed', {
        action,
        resolvedProfileId: resolvedProfile.profileId,
        profileSource: resolvedProfile.source,
        sessionId: runtimeSessionId,
        runtimeUrl: `${getRuntimeUrl()}${endpoint}`,
        code: classification.code,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(classification.status).json({
        success: false,
        code: classification.code,
        error: classification.error,
      });
    }
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
