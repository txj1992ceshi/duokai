import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    requireUser(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json(
      { success: false, error: message === 'Unauthorized' ? 'Unauthorized' : 'Request failed' },
      { status: message === 'Unauthorized' ? 401 : 500 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      code: 'LEGACY_BROWSER_PROXY_CHECK_RETIRED',
      error: '旧直连浏览器代理检测已退役。',
      detail: '真实浏览器检测必须由 CloakBrowser 桌面代理通过受支持的控制面任务执行；当前没有对应任务类型，因此本入口保持 fail-closed。',
    },
    { status: 410 },
  );
}
