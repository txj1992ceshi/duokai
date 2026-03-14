import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export async function POST(req: Request) {
  try {
    const { profileId } = await req.json();

    if (!profileId) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    // Determine path to stealth-engine
    // Since we are running Next.js from the `fingerprint-dashboard` root, 
    // we use process.cwd() to locate the sibling folder where we placed the engine.
    const engineLocation = path.join(process.cwd(), 'stealth-engine');
    const launchScript = path.join(engineLocation, 'launch.js');

    console.log(`[API] Spawning browser for profile: ${profileId}`);

    // Spawn the Node process detached from Next.js server so it doesn't block
    const child = spawn('node', [launchScript, '--profileId', profileId], {
      cwd: engineLocation,
      detached: true,
      stdio: 'ignore'
    });

    child.unref();

    return NextResponse.json({ success: true, message: `Profile ${profileId} launched successfully` });

  } catch (error: any) {
    console.error('[API Error]', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
