import { NextResponse } from 'next/server'
import { initialEnvironments } from '@/lib/mock-data'

export function GET() {
  return NextResponse.json({
    items: initialEnvironments,
  })
}
