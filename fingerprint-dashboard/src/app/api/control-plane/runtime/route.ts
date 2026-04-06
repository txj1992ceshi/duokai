import { NextRequest, NextResponse } from 'next/server';
import { getApiBase } from '@/lib/api-client';
import { getTokenFromRequest } from '@/lib/requireUser';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const bodyText = await req.text();
    const response = await fetch(`${getApiBase()}/api/control-plane/runtime`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: bodyText || '{}',
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => ({
      success: false,
      error: 'Failed to reach control plane runtime route',
    }));

    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    if (message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, code: 'CONTROL_PLANE_RUNTIME_ERROR', error: message }, { status: 500 });
  }
}
