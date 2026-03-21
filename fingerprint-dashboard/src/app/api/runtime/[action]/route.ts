import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { ProfileModel } from '@/models/Profile';
import { SettingModel } from '@/models/Setting';
import { ProfileStorageStateModel } from '@/models/ProfileStorageState';

export const runtime = 'nodejs';

/**
 * POST /api/runtime/[action]
 * 
 * Proxies requests to the local Stealth Engine Runtime Server.
 * The runtime server runs at http://127.0.0.1:3001 (or RUNTIME_URL env).
 * 
 * Supported actions: start | stop | action
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params; // start | stop | action

  try {
    const authUser = requireUser(req);
    await connectMongo();
    const settingsDoc = await SettingModel.findOne({ userId: authUser.userId }).lean();
    const runtimeUrl =
      process.env.RUNTIME_URL ||
      String((settingsDoc as Record<string, unknown> | null)?.runtimeUrl || '') ||
      'http://127.0.0.1:3001';
    const apiKey =
      process.env.RUNTIME_API_KEY ||
      String((settingsDoc as Record<string, unknown> | null)?.runtimeApiKey || '') ||
      '';

    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Map action → runtime server endpoint path
    const endpointMap: Record<string, string> = {
      start:  '/session/start',
      stop:   '/session/stop',
      action: '/session/action',
    };
    const endpoint = endpointMap[action];
    if (!endpoint) {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Ownership check before dispatching runtime actions.
    // - start: validate profileId ownership
    // - stop/action: validate sessionId belongs to one of current user's profiles
    let ownedProfile: { _id: unknown; name?: string } | null = null;
    if (action === 'start') {
      const profileId = String(payload.profileId || (payload.profile as Record<string, unknown> | undefined)?.id || '');
      if (!profileId) {
        return NextResponse.json(
          { success: false, error: 'profileId is required' },
          { status: 400 }
        );
      }
      ownedProfile = await ProfileModel.findOne({
        _id: profileId,
        userId: authUser.userId,
      }).lean();
    } else {
      const sessionId = String(payload.sessionId || '');
      if (!sessionId) {
        return NextResponse.json(
          { success: false, error: 'sessionId is required' },
          { status: 400 }
        );
      }
      ownedProfile = await ProfileModel.findOne({
        userId: authUser.userId,
        runtimeSessionId: sessionId,
      }).lean();
    }

    if (!ownedProfile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    if (action === 'start') {
      payload.profileId = String(ownedProfile._id);
      payload.profile = { ...(payload.profile as Record<string, unknown> | undefined), id: String(ownedProfile._id) };
      const syncedStorageState = await ProfileStorageStateModel.findOne({
        userId: authUser.userId,
        profileId: ownedProfile._id,
      }).lean();
      payload.storageState = syncedStorageState?.stateJson || null;
    }

    const target = runtimeUrl.replace(/\/$/, '') + endpoint;

    const r = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-runtime-key': apiKey,
        ...(req.headers.get('authorization')
          ? { authorization: req.headers.get('authorization') as string }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(action === 'start' ? 60000 : 10000),
    });

    let json: unknown = {};
    try { json = await r.json(); } catch { /* non-JSON response */ }

    // On successful start/stop, always return the runtime's response directly
    // so the frontend can pick up sessionId
    return NextResponse.json(json, { status: r.status });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Request failed';
    if (message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    const runtimeMessage = isTimeout
      ? 'Runtime server 响应超时 — 请确认 stealth-engine/server.js 已启动'
      : (error instanceof Error ? error.message : '无法连接到 Runtime Server');

    console.error(`[API /runtime/${action}]`, runtimeMessage);
    return NextResponse.json({ error: runtimeMessage }, { status: 503 });
  }
}
