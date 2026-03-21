import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';

const router = Router();

router.post('/', (req, res) => {
  const profileId = String(req.body?.profileId || '');
  if (!profileId) {
    res.status(400).json({ error: 'Profile ID is required' });
    return;
  }

  const cwd = process.cwd();
  const engineLocation = path.resolve(cwd, '..', 'fingerprint-dashboard', 'stealth-engine');
  const launchScript = path.resolve(engineLocation, 'launch.js');

  if (!fs.existsSync(launchScript)) {
    res.status(500).json({
      error: `launch.js not found. Looking at: ${launchScript}`,
    });
    return;
  }

  const child = spawn(process.execPath, [launchScript, '--profileId', profileId], {
    cwd: engineLocation,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();

  res.json({
    success: true,
    message: `Profile ${profileId} launched`,
  });
});

export default router;
