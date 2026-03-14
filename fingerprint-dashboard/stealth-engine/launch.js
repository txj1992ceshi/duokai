/**
 * launch.js
 * 
 * Profile launcher — the main entry point for the stealth engine.
 * 
 * Usage:
 *   node launch.js               — launch a random demo profile
 *   node launch.js --scan        — launch and navigate to BrowserScan for verification
 *   node launch.js --headless    — run headlessly (no visible window)
 * 
 * In Phase 3 this will be called by the Tauri backend via IPC.
 */

const { chromium } = require('playwright');
const { buildInjectionScript } = require('./fingerprint-injector');
const { createProfile } = require('./profiles');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// Parse CLI args
// ─────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const SCAN_MODE = args.includes('--scan');
const HEADLESS  = args.includes('--headless');

// Extract profileId
let targetProfileId = null;
const profileArgIndex = args.findIndex(a => a === '--profileId');
if (profileArgIndex !== -1 && args[profileArgIndex + 1]) {
  targetProfileId = args[profileArgIndex + 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Load profile from JSON database
// ─────────────────────────────────────────────────────────────────────────────
let dbData = { profiles: [] };
try {
  const dbPath = path.join(os.homedir(), '.antigravity-browser', 'db.json');
  dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
} catch (e) {
  console.warn('⚠️ Could not read db.json, falling back to random profile.');
}

const savedProfile = dbData.profiles.find(p => p.id === targetProfileId);
if (targetProfileId && !savedProfile) {
  console.error(`❌ Profile ID ${targetProfileId} not found in database!`);
  process.exit(1);
}

const profileName = savedProfile?.name || 'Demo-Profile-01';
const proxyString = savedProfile?.proxy; 
let parsedProxy;
if (proxyString) {
  // Simple parse for http://user:pass@host:port or http://host:port
  try {
    const url = new URL(proxyString);
    parsedProxy = {
      server: `${url.protocol}//${url.hostname}:${url.port}`,
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password)
    };
  } catch (e) {
    console.error('Invalid proxy format, skipping proxy. Example: http://user:pass@127.0.0.1:8080');
  }
}

const profile = createProfile({
  name: profileName,
  seed: savedProfile?.seed || profileName, // Deterministic seed
  userAgent: savedProfile?.ua || undefined,
});

if (parsedProxy) {
  profile.proxy = parsedProxy;
}

console.log('\n╔════════════════════════════════════════╗');
console.log('║   Stealth Fingerprint Browser Engine   ║');
console.log('╚════════════════════════════════════════╝\n');
console.log(`📋 Profile:    ${profile.name} (${profile.id})`);
console.log(`🖥️  Platform:   ${profile.fingerprint.platform}`);
console.log(`🌐 UserAgent:  ${profile.fingerprint.userAgent.slice(0, 60)}...`);
console.log(`🎮 GPU:        ${profile.fingerprint.webglRenderer}`);
console.log(`⏰  Timezone:   ${profile.fingerprint.timezone}`);
console.log(`💻 Screen:     ${profile.fingerprint.screenWidth}x${profile.fingerprint.screenHeight}`);
console.log(`🧵 CPU Cores:  ${profile.fingerprint.hardwareConcurrency}`);
console.log(`📦 RAM:        ${profile.fingerprint.deviceMemory}GB`);
if (profile.proxy) {
  console.log(`🔌 Proxy:      ${profile.proxy.server}`);
}
console.log('\n🚀 Launching browser...\n');

// ─────────────────────────────────────────────────────────────────────────────
// Determine user data directory (each profile gets its own isolated folder)
// ─────────────────────────────────────────────────────────────────────────────
const userDataDir = path.join(os.homedir(), '.antigravity-browser', 'profiles', profile.id);
fs.mkdirSync(userDataDir, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// Build the stealth injection script
// ─────────────────────────────────────────────────────────────────────────────
const stealthScript = buildInjectionScript(profile.fingerprint);

// ─────────────────────────────────────────────────────────────────────────────
// Launch the persistent browser context (enables cookie/storage persistence)
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const contextOptions = {
    headless: HEADLESS,
    userAgent: profile.fingerprint.userAgent,
    viewport: {
      width:  profile.fingerprint.screenWidth,
      height: profile.fingerprint.screenHeight,
    },
    locale: profile.fingerprint.languages[0],
    timezoneId: profile.fingerprint.timezone,
    permissions: [],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      `--window-size=${profile.fingerprint.screenWidth},${profile.fingerprint.screenHeight}`,
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };

  // Attach proxy if configured
  if (profile.proxy) {
    contextOptions.proxy = {
      server:   profile.proxy.server,
      username: profile.proxy.username,
      password: profile.proxy.password,
    };
  }

  // Use persistent context so cookies survive between sessions
  const context = await chromium.launchPersistentContext(userDataDir, contextOptions);

  // Inject stealth script into ALL pages before they load
  await context.addInitScript(stealthScript);

  const page = await context.newPage();

  // Navigate to BrowserScan in scan mode, otherwise open new tab
  if (SCAN_MODE) {
    console.log('🔍 Navigating to BrowserScan.net for fingerprint verification...\n');
    await page.goto('https://www.browserscan.net/', { waitUntil: 'domcontentloaded' });
    console.log('✅ Opened BrowserScan. Check the browser window for your trust score!');
    console.log('   (Keep the browser open, press Ctrl+C to exit)\n');
  } else {
    await page.goto('about:newtab');
    console.log('✅ Browser launched successfully!');
    console.log('   Profile data stored at:', userDataDir);
    console.log('   (Keep the browser open, press Ctrl+C to exit)\n');
  }

  // Keep the process alive
  await new Promise(() => {});
})().catch(err => {
  console.error('❌ Launch failed:', err.message);
  process.exit(1);
});
