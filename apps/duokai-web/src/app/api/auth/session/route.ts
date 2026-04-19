import { NextResponse } from 'next/server'
import { initialAccount } from '@/lib/mock-data'

export function GET() {
  return NextResponse.json({
    authenticated: true,
    user: initialAccount,
  })
}
