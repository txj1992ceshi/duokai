import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Force Node.js runtime so child_process and fs are available
export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { profileId } = await req.json();

    if (!profileId) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    // Build path dynamically to prevent Turbopack static analysis from
    // treating this as a module import. We split the string intentionally.
    const cwd = process.cwd();
    const engineDir = 'stealth-engine';
    const scriptName = 'launch.js';
    const engineLocation = path.resolve(cwd, engineDir);
    const launchScript = path.resolve(engineLocation, scriptName);

    if (!fs.existsSync(launchScript)) {
      return NextResponse.json({ 
        error: `launch.js not found. Looking at: ${launchScript}` 
      }, { status: 500 });
    }

    console.log(`[API] Spawning browser for profile: ${profileId}`);

    const child = spawn(
      process.execPath, // Use same node version as Next.js
      [launchScript, '--profileId', profileId],
      {
        cwd: engineLocation,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      }
    );

    child.unref();

    return NextResponse.json({ 
      success: true, 
      message: `Profile ${profileId} launched` 
    });

  } catch (error: any) {
    console.error('[API Error]', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
