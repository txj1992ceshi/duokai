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

  // Forward to runtime server's /session/list
  try {
    const r = await fetch(`${runtimeUrl.replace(/\/$/, '')}/session/list`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });

    if (!r.ok) {
      return NextResponse.json({ online: false, sessions: [] });
    }

    const sessions: any[] = await r.json();

    // Enrich with profile name from local DB
    const enriched = sessions.map(s => {
      const profile = db.profiles.find((p: any) => p.id === s.profileId);
      return { ...s, profileName: profile?.name || s.profileId };
    });

    return NextResponse.json({ online: true, sessions: enriched });
  } catch {
    // Runtime server not reachable
    return NextResponse.json({ online: false, sessions: [] });
  }
}
