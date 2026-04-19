import { NextResponse } from 'next/server'
import { initialProxies } from '@/lib/mock-data'

export function GET() {
  return NextResponse.json({
    items: initialProxies,
  })
}
