'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function getRuntimeManifestPath() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'duokai', 'runtime-manifest.json');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'duokai', 'runtime-manifest.json');
  }
  return path.join(os.homedir(), '.config', 'duokai', 'runtime-manifest.json');
}

function writeRuntimeManifest(payload) {
  const manifestPath = getRuntimeManifestPath();
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2), 'utf8');
}

function clearRuntimeManifest(expectedPid) {
  const manifestPath = getRuntimeManifestPath();
  if (!fs.existsSync(manifestPath)) {
    return;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (expectedPid && raw && typeof raw.pid === 'number' && raw.pid !== expectedPid) {
      return;
    }
  } catch {
    // If manifest is unreadable, treat it as stale and remove it.
  }

  try {
    fs.rmSync(manifestPath, { force: true });
  } catch {
    // Best-effort cleanup only.
  }
}

module.exports = {
  getRuntimeManifestPath,
  writeRuntimeManifest,
  clearRuntimeManifest,
};
