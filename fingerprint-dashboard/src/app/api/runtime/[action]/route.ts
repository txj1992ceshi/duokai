import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

export const runtime = 'nodejs';

const RETIRED_CODE = 'LEGACY_DIRECT_RUNTIME_RETIRED';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  try {
    requireUser(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json(
      { success: false, error: message === 'Unauthorized' ? 'Unauthorized' : 'Request failed' },
      { status: message === 'Unauthorized' ? 401 : 500 },
    );
  }

  const { action } = await params;
  return NextResponse.json(
    {
      success: false,
      code: RETIRED_CODE,
      action,
      error: '旧直连 Runtime 入口已退役。',
      detail: '浏览器环境只能通过 /api/control-plane/runtime 创建 start/stop 任务，并由桌面代理使用 CloakBrowser 执行。',
    },
    { status: 410 },
  );
}
