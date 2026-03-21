import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { ProfileModel } from '@/models/Profile';
import { SettingModel } from '@/models/Setting';

export const runtime = 'nodejs';

/**
 * GET /api/runtime/status
 * Returns the list of active sessions from the runtime server,
 * merged with profile names from MongoDB.
 */
export async function GET(req: NextRequest) {
  const authUser = requireUser(req);
  await connectMongo();

  const settingsDoc = await SettingModel.findOne({ userId: authUser.userId }).lean();
  const runtimeUrl =
    process.env.RUNTIME_URL ||
    String((settingsDoc as Record<string, unknown> | null)?.runtimeUrl || '') ||
    'http://127.0.0.1:3001';
  const baseUrl = runtimeUrl.replace(/\/$/, '');
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
      return NextResponse.json({ online: false, sessions: [] });
    }

    try {
      const r = await fetch(`${baseUrl}/session/list`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });

      if (!r.ok) {
        return NextResponse.json({ online: true, sessions: [], degraded: true });
      }

      const sessions = (await r.json()) as Array<{ profileId: string } & Record<string, unknown>>;

      const enriched = sessions.map(s => {
        const profile = profiles.find((p) => String(p._id) === s.profileId);
        return { ...s, profileName: profile?.name || s.profileId };
      });

      return NextResponse.json({ online: true, sessions: enriched });
    } catch {
      return NextResponse.json({ online: true, sessions: [], degraded: true });
    }
  } catch {
    return NextResponse.json({ online: false, sessions: [] });
  }
}
