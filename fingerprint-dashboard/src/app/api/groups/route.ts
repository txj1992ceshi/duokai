import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  return NextResponse.json(db.groups);
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();
    db.groups = body;
    saveDb(db);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
