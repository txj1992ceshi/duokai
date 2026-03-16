import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: Request, { params }: { params: { action: string } }) {
  const action = params.action; // start | stop | action
  
  // Read runtime config from settings DB (prioritize Env, fallback to settings)
  const db = getDb();
  let runtimeUrl = process.env.RUNTIME_URL || db.settings.runtimeUrl;
  let apiKey = process.env.RUNTIME_API_KEY || db.settings.runtimeApiKey || '';

  if (!runtimeUrl) return NextResponse.json({ error: 'RUNTIME_URL 未配置' }, { status: 500 });
  
  const payload = await req.json().catch(() => ({}));
  let target = runtimeUrl.replace(/\/$/, '') + '/session/';
  if (action === 'start') target += 'start';
  else if (action === 'stop') target += 'stop';
  else target += 'action';

  try {
    const r = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-runtime-key': apiKey,
      },
      body: JSON.stringify(payload),
    });
    
    let json = {};
    try {
      json = await r.json();
    } catch {
      // In case the response is not valid JSON
    }
    
    return NextResponse.json(json, { status: r.status });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'runtime 通信失败' }, { status: 500 });
  }
}
