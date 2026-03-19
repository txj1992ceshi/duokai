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
      proxyType: body.proxyType || 'direct',
      proxyHost: body.proxyHost || undefined,
      proxyPort: body.proxyPort || undefined,
      proxyUsername: body.proxyUsername || undefined,
      proxyPassword: body.proxyPassword || undefined,
      expectedProxyIp: body.expectedProxyIp || undefined,
      preferredProxyTransport: body.preferredProxyTransport || undefined,
      lastResolvedProxyTransport: body.lastResolvedProxyTransport || undefined,
      lastHostEnvironment: body.lastHostEnvironment || undefined,
      ua: body.ua || '',
      seed: body.seed || crypto.randomUUID().substring(0, 8),
      isMobile: body.isMobile || false,
      groupId: body.groupId || undefined,
      expectedProxyCountry: body.expectedProxyCountry || undefined,
      expectedProxyRegion: body.expectedProxyRegion || undefined,
      proxyVerification: body.proxyVerification || undefined,
      startupPlatform: body.startupPlatform || undefined,
      startupUrl: body.startupUrl || undefined,
      startupNavigation: body.startupNavigation || undefined,
    };

    db.profiles.push(newProfile);
    saveDb(db);

    return NextResponse.json(newProfile, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
