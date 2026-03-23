import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { ProfileModel } from '@/models/Profile';
import { SettingModel } from '@/models/Setting';

export const runtime = 'nodejs';

function resolveRuntimeUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value || value === 'http://127.0.0.1:3001') {
    return 'http://127.0.0.1:3101';
  }
  return value;
}

/**
 * GET /api/runtime/status
 * Returns the list of active sessions from the runtime server,
 * merged with profile names from MongoDB.
 */
export async function GET(req: NextRequest) {
  let authUser: { userId: string };
  try {
    authUser = requireUser(req) as { userId: string };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json(
      { online: false, sessions: [], error: message === 'Unauthorized' ? 'Unauthorized' : 'Request failed' },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
  let settingsDoc: Record<string, unknown> | null = null;
  let profiles: Array<Record<string, unknown>> = [];
  let dbDegraded = false;

  try {
    await connectMongo();
    settingsDoc = (await SettingModel.findOne({ userId: authUser.userId }).lean()) as Record<string, unknown> | null;
    profiles = (await ProfileModel.find({
      userId: authUser.userId,
    })
      .sort({ createdAt: -1 })
      .lean()) as Array<Record<string, unknown>>;
  } catch {
    dbDegraded = true;
  }

  const runtimeUrl = resolveRuntimeUrl(
    process.env.RUNTIME_URL ||
      String((settingsDoc as Record<string, unknown> | null)?.runtimeUrl || '')
  );
  const apiKey =
    process.env.RUNTIME_API_KEY ||
    String((settingsDoc as Record<string, unknown> | null)?.runtimeApiKey || '') ||
    '';
  const baseUrl = runtimeUrl.replace(/\/$/, '');

  try {
    const health = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        'x-runtime-key': apiKey,
      },
      signal: AbortSignal.timeout(2000),
    });

    if (!health.ok) {
      return NextResponse.json({ online: false, sessions: [] });
    }

    try {
      const r = await fetch(`${baseUrl}/session/list`, {
        method: 'GET',
        headers: {
          'x-runtime-key': apiKey,
        },
        signal: AbortSignal.timeout(3000),
      });

      if (!r.ok) {
        return NextResponse.json({ online: true, sessions: [], degraded: true });
      }

      const sessions = (await r.json()) as Array<{ profileId: string } & Record<string, unknown>>;

      const enriched = sessions.map(s => {
        const profile = profiles.find((p) => String(p._id) === s.profileId) as { name?: string } | undefined;
        return { ...s, profileName: profile?.name || s.profileId };
      });

      return NextResponse.json({ online: true, sessions: enriched, degraded: dbDegraded });
    } catch {
      return NextResponse.json({ online: true, sessions: [], degraded: true });
    }
  } catch {
    return NextResponse.json({ online: false, sessions: [] });
  }
}
