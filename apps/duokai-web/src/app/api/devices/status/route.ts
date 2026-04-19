import { NextResponse } from 'next/server'
import { initialDeviceStatus } from '@/lib/mock-data'

export function GET() {
  return NextResponse.json({
    device: initialDeviceStatus,
  })
}
