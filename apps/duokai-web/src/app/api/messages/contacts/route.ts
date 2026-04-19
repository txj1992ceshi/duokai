import { NextResponse } from 'next/server'
import { initialMessageContacts } from '@/lib/mock-data'

export function GET() {
  return NextResponse.json({
    items: initialMessageContacts,
  })
}
