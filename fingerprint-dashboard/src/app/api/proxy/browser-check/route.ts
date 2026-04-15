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

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    const authUser = requireUser(req);
    await connectMongo();
    const settingsDoc = await SettingModel.findOne({ userId: authUser.userId }).lean();
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
    return NextResponse.json({
      success: true,
      executionTarget: 'local-runtime',
      runtimeApiKey: apiKey,
      preparedPayload: payload,
    });
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
      expectedIp: normalizeOptionalString(payload?.expectedIp),
      expectedCountry: normalizeOptionalString(payload?.expectedCountry),
      expectedRegion: normalizeOptionalString(payload?.expectedRegion),
      checkedAt: new Date().toISOString(),
      detail: '云端仅负责准备代理测试参数，真实浏览器测试必须由本地 runtime 执行。',
    };
    return NextResponse.json(result, { status: 503 });
  }
}
