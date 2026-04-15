import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { resolveStorageStateJson } from '@/lib/storageArtifacts';
import { ProfileModel } from '@/models/Profile';
import { SettingModel } from '@/models/Setting';
import { ProfileStorageStateModel } from '@/models/ProfileStorageState';

export const runtime = 'nodejs';

/**
 * POST /api/runtime/[action]
 * 
 * Prepares authorized runtime payloads for a local runtime client.
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
    const apiKey =
      process.env.RUNTIME_API_KEY ||
      String((settingsDoc as Record<string, unknown> | null)?.runtimeApiKey || '') ||
      '';

    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!['start', 'stop', 'action'].includes(action)) {
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
      payload.storageState = await resolveStorageStateJson({
        inlineStateJson: syncedStorageState?.inlineStateJson,
        stateJson: syncedStorageState?.stateJson,
        fileRef: syncedStorageState?.fileRef || '',
      });
    }
    return NextResponse.json({
      success: true,
      action,
      executionTarget: 'local-runtime',
      runtimeApiKey: apiKey,
      profileId: String(ownedProfile._id),
      preparedPayload: payload,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Request failed';
    if (message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    console.error(`[API /runtime/${action}]`, message);
    return NextResponse.json(
      {
        success: false,
        stage: 'cloud_prepare',
        error: error instanceof Error ? error.message : 'Failed to prepare runtime payload',
      },
      { status: 503 },
    );
  }
}
