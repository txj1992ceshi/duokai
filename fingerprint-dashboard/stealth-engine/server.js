/**
 * server.js  —  Stealth Engine Runtime HTTP Server
 * 
 * 监听 localhost:3001，为 Next.js 管理端提供真正的浏览器启动/停止/控制能力。
 * 
 * API：
 *   POST /session/start   { profile, proxy?, headless? }  → { sessionId }
 *   POST /session/stop    { sessionId }                    → { ok, storedState }
 *   POST /session/action  { sessionId, action }            → { result }
 *   GET  /session/list                                     → [ session... ]
 *   GET  /health                                           → { ok, sessions }
 * 
 * 启动方式：
 *   node stealth-engine/server.js
 *   RUNTIME_PORT=3001 node stealth-engine/server.js
 */

'use strict';

const http = require('http');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const crypto = require('crypto');

const { chromium }           = require('playwright');
const { buildInjectionScript } = require('./fingerprint-injector');
const { generateFingerprint }  = require('./profiles');
const { humanClick, humanType, humanScroll, randomDelay } = require('./humanize');

const PORT         = parseInt(process.env.RUNTIME_PORT || '3001', 10);
const BASE_DIR     = path.join(os.homedir(), '.antigravity-browser');
const PROFILES_DIR = path.join(BASE_DIR, 'profiles');
const DB_PATH      = path.join(BASE_DIR, 'db.json');

// ─────────────────────────────────────────────────────────────────────────────
// In-memory session store: sessionId → SessionEntry
// ─────────────────────────────────────────────────────────────────────────────
/** @type {Map<string, { context: import('playwright').BrowserContext, page: import('playwright').Page, profileId: string, startedAt: number, currentUrl: string }>} */
const sessions = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return { profiles: [], groups: [], behaviors: [], settings: {} };
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function parseProxy(proxyString) {
  if (!proxyString) return null;
  try {
    const url = new URL(proxyString);
    return {
      server:   `${url.protocol}//${url.hostname}:${url.port}`,
      username: decodeURIComponent(url.username) || undefined,
      password: decodeURIComponent(url.password) || undefined,
    };
  } catch {
    // Try plain host:port
    const parts = proxyString.replace(/^https?:\/\//, '').split(':');
    if (parts.length >= 2) {
      return { server: `http://${parts[0]}:${parts[1]}` };
    }
    return null;
  }
}

function getStateFile(profileId) {
  return path.join(PROFILES_DIR, profileId, 'state.json');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(json);
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /session/start
 * Body: { profile, proxy?, headless? }
 */
async function handleStart(body) {
  const { profile: profileData, proxy: proxyOverride, headless = false } = body;

  if (!profileData?.id) throw new Error('profile.id is required');

  const profileId = profileData.id;

  // Determine seed (numeric) for fingerprint generation
  const seedStr = profileData.seed || profileId;
  // Convert string seed to number using simple hash
  let seedNum = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seedNum = (seedNum * 31 + seedStr.charCodeAt(i)) >>> 0;
  }

  const isMobile  = !!profileData.isMobile;
  const fingerprint = generateFingerprint(seedNum, isMobile);

  // Allow explicit user agent override
  if (profileData.ua) fingerprint.userAgent = profileData.ua;

  // User data dir — each profile gets its own isolated folder
  const userDataDir = path.join(PROFILES_DIR, profileId);
  fs.mkdirSync(userDataDir, { recursive: true });

  // Parse proxy
  const proxyStr = proxyOverride?.server
    ? proxyOverride                              // Already parsed object from frontend
    : parseProxy(profileData.proxy);

  // Build Playwright context options
  /** @type {import('playwright').BrowserContextOptions} */
  const ctxOptions = {
    headless,
    userAgent: fingerprint.userAgent,
    viewport: {
      width:  fingerprint.screenWidth,
      height: fingerprint.screenHeight,
    },
    locale:     fingerprint.languages[0],
    timezoneId: fingerprint.timezone,
    isMobile,
    hasTouch:   isMobile,
    permissions: [],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      `--window-size=${fingerprint.screenWidth},${fingerprint.screenHeight}`,
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };

  if (proxyStr) {
    ctxOptions.proxy = proxyStr;
  }

  // Restore storageState from previous session if available
  const stateFile = getStateFile(profileId);
  if (fs.existsSync(stateFile)) {
    try {
      ctxOptions.storageState = stateFile;
      console.log(`[Runtime] Restoring storageState for profile ${profileId}`);
    } catch {}
  }

  // Launch persistent context (cookies/localStorage survive between sessions)
  const context = await chromium.launchPersistentContext(userDataDir, ctxOptions);

  // Inject stealth fingerprint script into ALL pages before they load
  const stealthScript = buildInjectionScript(fingerprint);
  await context.addInitScript(stealthScript);

  // Open initial page
  const page = await context.newPage();
  await page.goto('about:blank');

  // Generate session ID
  const sessionId = crypto.randomUUID();

  // Track page URL as user navigates
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      const entry = sessions.get(sessionId);
      if (entry) entry.currentUrl = frame.url();
    }
  });

  // Handle context close (e.g. user closes browser window)
  context.on('close', async () => {
    if (sessions.has(sessionId)) {
      console.log(`[Runtime] Context closed externally for session ${sessionId}`);
      sessions.delete(sessionId);
      // Update db — clear runtimeSessionId
      await clearDbSession(profileId, sessionId);
    }
  });

  sessions.set(sessionId, {
    context,
    page,
    profileId,
    startedAt: Date.now(),
    currentUrl: 'about:blank',
    fingerprint: { ...fingerprint, userAgent: fingerprint.userAgent.slice(0, 80) },
  });

  // Persist sessionId back to db
  const db = readDb();
  const p  = db.profiles.find(x => x.id === profileId);
  if (p) {
    p.runtimeSessionId = sessionId;
    p.status = 'Running';
    writeDb(db);
  }

  console.log(`[Runtime] ✅ Session started: ${sessionId} (profile: ${profileData.name || profileId})`);
  if (proxyStr) console.log(`[Runtime]    Proxy: ${proxyStr.server}`);

  return { sessionId };
}

/**
 * POST /session/stop
 * Body: { sessionId }
 */
async function handleStop(body) {
  const { sessionId } = body;
  const entry = sessions.get(sessionId);
  if (!entry) throw new Error(`Session not found: ${sessionId}`);

  // Save storageState before closing
  let storedState = false;
  try {
    const stateFile = getStateFile(entry.profileId);
    const state = await entry.context.storageState();
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
    storedState = true;
    console.log(`[Runtime] 💾 storageState saved for profile ${entry.profileId}`);
  } catch (e) {
    console.warn(`[Runtime] ⚠️  Could not save storageState: ${e.message}`);
  }

  await entry.context.close().catch(() => {});
  sessions.delete(sessionId);

  await clearDbSession(entry.profileId, sessionId);

  console.log(`[Runtime] 🛑 Session stopped: ${sessionId}`);
  return { ok: true, storedState };
}

async function clearDbSession(profileId, sessionId) {
  try {
    const db = readDb();
    const p  = db.profiles.find(x => x.id === profileId);
    if (p && p.runtimeSessionId === sessionId) {
      p.runtimeSessionId = '';
      p.status = 'Ready';
      writeDb(db);
    }
  } catch {}
}

/**
 * POST /session/action
 * Body: { sessionId, action: { type, payload } }
 * 
 * Supported action types:
 *   goto      { url }
 *   click     { selector } | { x, y }
 *   type      { selector, text }
 *   scroll    { deltaY }
 *   eval      { script }
 *   screenshot {}
 */
async function handleAction(body) {
  const { sessionId, action } = body;
  if (!sessionId || !action?.type) throw new Error('sessionId and action.type are required');

  const entry = sessions.get(sessionId);
  if (!entry) throw new Error(`Session not found: ${sessionId}`);

  const { page } = entry;

  switch (action.type) {
    case 'goto': {
      const url = action.url || action.payload?.url;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return { ok: true, url: page.url() };
    }
    case 'click': {
      if (action.selector) {
        await page.waitForSelector(action.selector, { timeout: 10000 });
        const el = await page.$(action.selector);
        const box = await el?.boundingBox();
        if (box) {
          await humanClick(page, box.x + box.width / 2, box.y + box.height / 2);
        }
      } else if (action.x != null && action.y != null) {
        await humanClick(page, action.x, action.y);
      }
      return { ok: true };
    }
    case 'type': {
      if (action.selector) {
        await page.click(action.selector);
      }
      await randomDelay(200, 500);
      await humanType(page, action.text || '');
      return { ok: true };
    }
    case 'scroll': {
      await humanScroll(page, action.deltaY || 300);
      return { ok: true };
    }
    case 'eval': {
      const result = await page.evaluate(action.script);
      return { ok: true, result };
    }
    case 'screenshot': {
      const buf = await page.screenshot({ type: 'png' });
      return { ok: true, image: buf.toString('base64'), mimeType: 'image/png' };
    }
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

/**
 * GET /session/list
 */
function handleList() {
  const list = [];
  for (const [sessionId, entry] of sessions) {
    list.push({
      sessionId,
      profileId:  entry.profileId,
      startedAt:  entry.startedAt,
      currentUrl: entry.currentUrl,
      uptime:     Math.round((Date.now() - entry.startedAt) / 1000),
    });
  }
  return list;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Server
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-runtime-key',
    });
    return res.end();
  }

  const url = req.url?.split('?')[0] || '/';

  try {
    // ── GET routes ──────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (url === '/health') {
        return send(res, 200, { ok: true, sessions: sessions.size, pid: process.pid });
      }
      if (url === '/session/list') {
        return send(res, 200, handleList());
      }
      return send(res, 404, { error: 'Not found' });
    }

    // ── POST routes ─────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = await readBody(req);

      if (url === '/session/start') {
        const result = await handleStart(body);
        return send(res, 200, result);
      }
      if (url === '/session/stop') {
        const result = await handleStop(body);
        return send(res, 200, result);
      }
      if (url === '/session/action') {
        const result = await handleAction(body);
        return send(res, 200, result);
      }
      return send(res, 404, { error: 'Not found' });
    }

    send(res, 405, { error: 'Method not allowed' });

  } catch (err) {
    console.error('[Runtime Error]', err.message);
    send(res, 500, { error: err.message || 'Internal server error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   Stealth Engine Runtime Server  v2.0        ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`✅ Listening on http://127.0.0.1:${PORT}`);
  console.log(`📁 Data directory: ${BASE_DIR}`);
  console.log('─'.repeat(48));
  console.log('Endpoints:');
  console.log('  POST /session/start   — Launch a profile browser');
  console.log('  POST /session/stop    — Stop & persist session');
  console.log('  POST /session/action  — Execute page action');
  console.log('  GET  /session/list    — List active sessions');
  console.log('  GET  /health          — Health check\n');
});

// Graceful shutdown: save all storageStates on SIGINT/SIGTERM
async function gracefulShutdown(signal) {
  console.log(`\n[Runtime] Received ${signal}, saving all sessions...`);
  const promises = [];
  for (const [sessionId, entry] of sessions) {
    promises.push(
      (async () => {
        try {
          const stateFile = getStateFile(entry.profileId);
          const state = await entry.context.storageState();
          fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
          await entry.context.close().catch(() => {});
          console.log(`[Runtime] 💾 Saved session ${sessionId}`);
        } catch (e) {
          console.warn(`[Runtime] ⚠️  ${sessionId}: ${e.message}`);
        }
      })()
    );
  }
  await Promise.allSettled(promises);
  server.close(() => process.exit(0));
}

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
