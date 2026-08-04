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
      code: 'LEGACY_DIRECT_LAUNCH_RETIRED',
      error: '旧浏览器直启入口已退役。',
      detail: '使用 /api/control-plane/runtime 创建 start 任务，由 Duokai Desktop Agent 使用 CloakBrowser 执行。',
    },
    { status: 410 },
  );
}
