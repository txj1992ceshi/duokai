import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/runtime/status
 * Returns the list of active sessions from the runtime server,
 * merged with profile names from the local DB.
 */
export async function GET() {
  const db = getDb();
  const runtimeUrl =
    process.env.RUNTIME_URL || db.settings?.runtimeUrl || 'http://127.0.0.1:3001';
  const baseUrl = runtimeUrl.replace(/\/$/, '');

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
        const profile = db.profiles.find((p) => p.id === s.profileId);
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
