import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Force Node.js runtime: needed for fs/path operations in db.ts
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
  req: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params; // start | stop | action

  const db = getDb();
  const runtimeUrl =
    process.env.RUNTIME_URL || db.settings?.runtimeUrl || 'http://127.0.0.1:3001';
  const apiKey =
    process.env.RUNTIME_API_KEY || db.settings?.runtimeApiKey || '';

  const payload = await req.json().catch(() => ({}));

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

  const target = runtimeUrl.replace(/\/$/, '') + endpoint;

  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-runtime-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(action === 'start' ? 60000 : 10000),
    });

    let json: unknown = {};
    try { json = await r.json(); } catch { /* non-JSON response */ }

    // On successful start/stop, always return the runtime's response directly
    // so the frontend can pick up sessionId
    return NextResponse.json(json, { status: r.status });

  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    const message   = isTimeout
      ? 'Runtime server 响应超时 — 请确认 stealth-engine/server.js 已启动'
      : (err instanceof Error ? err.message : '无法连接到 Runtime Server');

    console.error(`[API /runtime/${action}]`, message);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
