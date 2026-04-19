import { NextResponse } from 'next/server'
import { initialLogs } from '@/lib/mock-data'

export function GET() {
  return NextResponse.json({
    items: initialLogs,
  })
}
