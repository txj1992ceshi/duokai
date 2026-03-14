import { NextResponse } from 'next/server';
import { getDb, saveDb, Profile } from '@/lib/db';
import crypto from 'crypto';

export async function GET() {
  const db = getDb();
  return NextResponse.json(db.profiles);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const db = getDb();
    
    // Create new profile with deterministic seed if not provided
    const newProfile: Profile = {
      id: crypto.randomUUID(),
      name: body.name || `Profile ${db.profiles.length + 1}`,
      status: 'Ready',
      lastActive: 'Never',
      tags: body.tags || [],
      proxy: body.proxy || '',
      ua: body.ua || '',
      seed: body.seed || crypto.randomUUID().substring(0, 8),
      isMobile: body.isMobile || false,
    };

    db.profiles.push(newProfile);
    saveDb(db);

    return NextResponse.json(newProfile, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
