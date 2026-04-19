import { NextResponse } from 'next/server'
import { initialSettings } from '@/lib/mock-data'

export function GET() {
  return NextResponse.json(initialSettings)
}

export async function POST(request: Request) {
  const payload = await request.json()
  return NextResponse.json({
    saved: true,
    ...initialSettings,
    ...payload,
  })
}
