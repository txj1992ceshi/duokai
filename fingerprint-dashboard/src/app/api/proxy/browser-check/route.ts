import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireUser } from '@/lib/requireUser';
import { ProfileModel } from '@/models/Profile';
import { SettingModel } from '@/models/Setting';
import type { ProxyProtocol, ProxyVerificationRecord } from '@/lib/proxyTypes';

export const runtime = 'nodejs';

function normalizeProxyProtocol(value: unknown): ProxyProtocol | undefined {
  return value === 'direct' || value === 'http' || value === 'https' || value === 'socks5'
    ? value
    : undefined;
}

function resolveRuntimeUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value || value === 'http://127.0.0.1:3001') {
    return 'http://127.0.0.1:3101';
  }
  return value;
}

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    const authUser = requireUser(req);
    await connectMongo();
    const settingsDoc = await SettingModel.findOne({ userId: authUser.userId }).lean();
    const runtimeUrl = resolveRuntimeUrl(
      process.env.RUNTIME_URL ||
      String((settingsDoc as Record<string, unknown> | null)?.runtimeUrl || '')
    );
    const apiKey =
      process.env.RUNTIME_API_KEY ||
      String((settingsDoc as Record<string, unknown> | null)?.runtimeApiKey || '') ||
      '';

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const profileId = String(body.profileId || '');

    payload = { ...body };
    if (profileId) {
      const profile = await ProfileModel.findOne({
        _id: profileId,
        userId: authUser.userId,
      }).lean();

      if (!profile) {
        return NextResponse.json(
          { success: false, error: 'Profile not found' },
          { status: 404 }
        );
      }

      payload.proxyType = payload.proxyType || profile.proxyType || 'direct';
      payload.proxyHost = payload.proxyHost || profile.proxyHost || '';
      payload.proxyPort = payload.proxyPort || profile.proxyPort || '';
      payload.proxyUsername = payload.proxyUsername || profile.proxyUsername || '';
      payload.proxyPassword = payload.proxyPassword || profile.proxyPassword || '';
      payload.expectedIp = payload.expectedIp || profile.expectedProxyIp || '';
      payload.expectedCountry = payload.expectedCountry || profile.expectedProxyCountry || '';
      payload.expectedRegion = payload.expectedRegion || profile.expectedProxyRegion || '';
      payload.proxy = payload.proxy || profile.proxy || '';
    }

    const r = await fetch(`${runtimeUrl.replace(/\/$/, '')}/proxy/test-browser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-runtime-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });

    let json: unknown = {};
    try {
      json = await r.json();
    } catch {}

    return NextResponse.json(json, { status: r.status });
  } catch (err: unknown) {
    const authMessage = err instanceof Error ? err.message : '';
    if (authMessage === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : '无法连接到 Runtime Server';
    const proxyType = normalizeProxyProtocol(payload?.proxyType);
    const result: ProxyVerificationRecord = {
      layer: 'environment',
      status: 'unknown',
      proxyType,
      error: message,
      errorType: 'unknown',
      expectedIp: payload?.expectedIp,
      expectedCountry: payload?.expectedCountry,
      expectedRegion: payload?.expectedRegion,
      checkedAt: new Date().toISOString(),
    };
    return NextResponse.json(result, { status: 503 });
  }
}
