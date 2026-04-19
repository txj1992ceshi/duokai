import { NextResponse } from 'next/server'
import { initialMessageThreads } from '@/lib/mock-data'

export function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) => {
    const thread = initialMessageThreads.find((item) => item.threadId === id)
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    }
    return NextResponse.json(thread)
  })
}
