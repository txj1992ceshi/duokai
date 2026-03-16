import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  return NextResponse.json(db.settings);
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();
    db.settings = { ...db.settings, ...body };
    saveDb(db);
    return NextResponse.json(db.settings);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
