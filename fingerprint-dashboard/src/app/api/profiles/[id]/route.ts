import { NextResponse } from 'next/server';
import { getDb, saveDb, Profile } from '@/lib/db';

export async function PUT(req: Request) {
  try {
    const id = req.url.split('/').pop();
    const body = await req.json();
    const db = getDb();
    const index = db.profiles.findIndex((p: Profile) => p.id === id);

    if (index === -1) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Merge updates
    db.profiles[index] = { ...db.profiles[index], ...body, id };
    saveDb(db);

    return NextResponse.json(db.profiles[index]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const id = req.url.split('/').pop();
    const db = getDb();
    const index = db.profiles.findIndex((p: Profile) => p.id === id);

    if (index === -1) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    db.profiles.splice(index, 1);
    saveDb(db);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
