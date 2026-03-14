/**
 * profiles.js
 * 
 * Profile definitions and fingerprint configuration generator.
 * In Phase 2 this will be backed by a database; for now it uses
 * in-memory config.
 */

const crypto = require('crypto');

// Common GPU presets that are realistic and common on the web
const GPU_PRESETS = [
  { vendor: 'Intel Inc.',  renderer: 'Intel Iris OpenGL Engine' },
  { vendor: 'Intel Inc.',  renderer: 'Intel(R) UHD Graphics 620' },
  { vendor: 'Apple',       renderer: 'Apple M1' },
  { vendor: 'Apple',       renderer: 'Apple M2' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce GTX 1650 OpenGL Engine' },
  { vendor: 'NVIDIA Corporation', renderer: 'NVIDIA GeForce RTX 3060' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0)' },
];

const UA_PRESETS = [
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', platform: 'Win32', vendor: 'Google Inc.' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', platform: 'Win32', vendor: 'Google Inc.' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', platform: 'MacIntel', vendor: 'Google Inc.' },
  { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15', platform: 'MacIntel', vendor: 'Apple Computer, Inc.' },
  { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0', platform: 'Win32', vendor: '' },
];

const MOBILE_UA_PRESETS = [
  { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1', platform: 'iPhone', vendor: 'Apple Computer, Inc.' },
  { ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l', vendor: 'Google Inc.' },
  { ua: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36', platform: 'Linux aarch64', vendor: 'Google Inc.' }
];

const SCREEN_PRESETS = [
  { width: 1920, height: 1080, colorDepth: 24 },
  { width: 1366, height: 768,  colorDepth: 24 },
  { width: 2560, height: 1440, colorDepth: 24 },
  { width: 1440, height: 900,  colorDepth: 24 },
  { width: 1280, height: 800,  colorDepth: 24 },
];

const MOBILE_SCREEN_PRESETS = [
  { width: 393, height: 852, colorDepth: 32 },  // iPhone 14 Pro
  { width: 430, height: 932, colorDepth: 32 },  // iPhone 14 Pro Max
  { width: 412, height: 915, colorDepth: 24 },  // Pixel 8
];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore',
  'Australia/Sydney',
];

const LANGUAGE_PRESETS = [
  ['en-US', 'en'],
  ['en-GB', 'en'],
  ['zh-CN', 'zh', 'en-US', 'en'],
  ['ja-JP', 'ja', 'en-US', 'en'],
  ['de-DE', 'de', 'en-US', 'en'],
  ['fr-FR', 'fr', 'en-US', 'en'],
];

/**
 * Creates a deterministic profile fingerprint from a seed value.
 * Same seed = same fingerprint every time (required for cookie persistence).
 */
function generateFingerprint(seed, isMobile = false) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const gpu    = pick(GPU_PRESETS);
  const ua     = pick(isMobile ? MOBILE_UA_PRESETS : UA_PRESETS);
  const screen = pick(isMobile ? MOBILE_SCREEN_PRESETS : SCREEN_PRESETS);

  return {
    userAgent:          ua.ua,
    platform:           ua.platform,
    vendor:             ua.vendor,
    hardwareConcurrency: [2, 4, 8, 12, 16][Math.floor(rng() * 5)],
    deviceMemory:       [2, 4, 8, 16][Math.floor(rng() * 4)],
    screenWidth:        screen.width,
    screenHeight:       screen.height,
    colorDepth:         screen.colorDepth,
    timezone:           pick(TIMEZONES),
    webglVendor:        gpu.vendor,
    webglRenderer:      gpu.renderer,
    canvasSeed:         Math.floor(rng() * 0xFFFFFF),
    audioSeed:          Math.floor(rng() * 0xFFFFFF),
    languages:          pick(LANGUAGE_PRESETS),
  };
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function() {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Creates a new Profile object.
 */
function createProfile({ name, proxy = null, seed = null, isMobile = false }) {
  seed = seed ?? Math.floor(Math.random() * 0xFFFFFFFF);
  const fingerprint = generateFingerprint(seed, isMobile);
  return {
    id: crypto.randomUUID(),
    name,
    seed,
    proxy,         // e.g. { server: 'socks5://host:port', username: '', password: '' }
    fingerprint,
    createdAt: new Date().toISOString(),
  };
}

module.exports = { createProfile, generateFingerprint };
