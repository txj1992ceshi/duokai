import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const db = getDb();
  const runtimeUrl =
    process.env.RUNTIME_URL || db.settings?.runtimeUrl || 'http://127.0.0.1:3001';
  const apiKey =
    process.env.RUNTIME_API_KEY || db.settings?.runtimeApiKey || '';

  const payload = await req.json().catch(() => ({}));

  try {
    const r = await fetch(`${runtimeUrl.replace(/\/$/, '')}/proxy/test-browser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-runtime-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    let json: unknown = {};
    try {
      json = await r.json();
    } catch {}

    return NextResponse.json(json, { status: r.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '无法连接到 Runtime Server';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
