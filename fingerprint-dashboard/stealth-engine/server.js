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
const { buildFontInjectionScript } = require('./font-injector');
const { buildMediaDevicesScript } = require('./media-devices');
const { setupRequestInterceptor } = require('./request-interceptor');

const { generateFingerprint }  = require('./profiles');
const { humanClick, humanType, humanScroll, randomDelay } = require('./humanize');
const createQueue = require('./session-queue');

const ProxyPoolManager = require('./proxy-pool');
const RedisProxyPool   = require('./redis-proxy-pool');
const RuntimeMonitor   = require('./monitor');
const metrics          = require('./metrics');

const PORT         = parseInt(process.env.RUNTIME_PORT || '3001', 10);
const BASE_DIR     = path.join(os.homedir(), '.antigravity-browser');
const PROFILES_DIR = path.join(BASE_DIR, 'profiles');
const DB_PATH      = path.join(BASE_DIR, 'db.json');

// ─────────────────────────────────────────────────────────────────────────────
// In-memory session store: sessionId → SessionEntry
// ─────────────────────────────────────────────────────────────────────────────
/** @type {Map<string, { context: import('playwright').BrowserContext, page: import('playwright').Page, profileId: string, startedAt: number, currentUrl: string, verification?: any }>} */
const sessions = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Queue initialization for session safety (limit MAX concurrency, auto cleanup)
// ─────────────────────────────────────────────────────────────────────────────
const queue = createQueue({
  doStart: async (payload) => {
    return await handleStart(payload);
  },
  doStop: async (sessionId) => {
    return await handleStop({ sessionId });
  },
  saveStorageState: async (sessionId) => {
    const entry = sessions.get(sessionId);
    if (!entry) return;
    try {
      const stateFile = getStateFile(entry.profileId);
      const state = await entry.context.storageState();
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
      console.log(`[Runtime] 💾 Queue auto-saved storageState for profile ${entry.profileId}`);
    } catch(e) {}
  },
  auditFile: path.join(BASE_DIR, 'runtime-audit.log'),
  maxActiveSessions: Number(process.env.MAX_ACTIVE_SESSIONS || 6),
  sessionTimeoutHours: Number(process.env.SESSION_TIMEOUT_HOURS || 24),
});

// Initialize Managers
let proxyPool;
if (process.env.REDIS_URL) {
  proxyPool = new RedisProxyPool({ redisUrl: process.env.REDIS_URL });
  console.log(`[Runtime] 🚀 Using Redis for Proxy Pool: ${process.env.REDIS_URL}`);
} else {
  proxyPool = new ProxyPoolManager({
    persistencePath: path.join(BASE_DIR, 'proxy-pool.json')
  });
}

const monitor = new RuntimeMonitor(path.join(BASE_DIR, 'runtime-audit.log'));

// Periodic metrics refresh
if (!process.env.REDIS_URL) {
  setInterval(() => metrics.updateProxyMetrics(proxyPool), 15000);
}

// Auth check
function verifyKey(req) {
  const db = readDb();
  const apiKey = process.env.RUNTIME_KEY || db.settings?.runtimeApiKey;
  if (!apiKey) return true; // Loose if not set
  return req.headers['x-runtime-key'] === apiKey;
}

// ─────────────────────────────────────────────────────────────────────────────
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

function normalizeProxyType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'https') return 'https';
  if (normalized === 'socks5') return 'socks5';
  if (normalized === 'direct') return 'direct';
  return 'http';
}

function buildProxyUrlFromFields(source) {
  const proxyType = normalizeProxyType(source?.proxyType);
  const host = String(source?.proxyHost || '').trim();
  const port = String(source?.proxyPort || '').trim();
  const username = String(source?.proxyUsername || '').trim();
  const password = String(source?.proxyPassword || '').trim();

  if (proxyType === 'direct' || !host || !port) {
    return null;
  }

  return {
    proxyType,
    server: `${proxyType}://${host}:${port}`,
    username: username || undefined,
    password: password || undefined,
  };
}

function parseProxyString(proxyString, options = {}) {
  if (!proxyString) return null;

  const raw = String(proxyString).trim();
  const allowImplicitHttp = options.allowImplicitHttp === true;

  // 1) 先尝试直接按标准 URL 解析
  try {
    const url = new URL(raw);
    if (url.protocol && url.hostname && url.port) {
      const proxyType = normalizeProxyType(url.protocol.replace(':', ''));
      return {
        proxyType,
        server: `${proxyType}://${url.hostname}:${url.port}`,
        username: decodeURIComponent(url.username) || undefined,
        password: decodeURIComponent(url.password) || undefined,
      };
    }
  } catch {}

  // 2) 兼容 scheme://host:port:user:pass
  let m = raw.match(/^(https?|socks5):\/\/([^:]+):(\d+):([^:]+):(.+)$/i);
  if (m) {
    const [, protocol, host, port, user, pass] = m;
    const proxyType = normalizeProxyType(protocol);
    return {
      proxyType,
      server: `${proxyType}://${host}:${port}`,
      username: decodeURIComponent(user) || undefined,
      password: decodeURIComponent(pass) || undefined,
    };
  }

  // 3) 兼容 host:port:user:pass，只有明确允许时才默认按 http
  m = raw.match(/^([^:]+):(\d+):([^:]+):(.+)$/);
  if (m) {
    if (!allowImplicitHttp) {
      return { ambiguous: true };
    }
    const [, host, port, user, pass] = m;
    return {
      proxyType: 'http',
      server: `http://${host}:${port}`,
      username: decodeURIComponent(user) || undefined,
      password: decodeURIComponent(pass) || undefined,
    };
  }

  // 4) 兼容 user:pass@host:port，默认按 http
  m = raw.match(/^([^:]+):([^@]+)@([^:]+):(\d+)$/);
  if (m) {
    if (!allowImplicitHttp) {
      return { ambiguous: true };
    }
    const [, user, pass, host, port] = m;
    return {
      proxyType: 'http',
      server: `http://${host}:${port}`,
      username: decodeURIComponent(user) || undefined,
      password: decodeURIComponent(pass) || undefined,
    };
  }

  // 5) 最后兜底 host:port
  const parts = raw.replace(/^https?:\/\//, '').split(':');
  if (parts.length >= 2 && allowImplicitHttp) {
    return { proxyType: 'http', server: `http://${parts[0]}:${parts[1]}` };
  }

  return null;
}

function resolveRuntimeProxy(source, options = {}) {
  const structured = buildProxyUrlFromFields(source);
  if (structured) return structured;

  if (source?.proxyType === 'direct') {
    return null;
  }

  return parseProxyString(source?.proxy, options);
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

function createRuntimeHttpError(status, body) {
  const err = new Error(body?.error || 'Runtime request failed');
  err.httpStatus = status;
  err.body = body;
  return err;
}

function buildEnvironmentVerification({
  status,
  proxyType,
  latencyMs,
  ip,
  country,
  region,
  city,
  isp,
  provider,
  error,
  detail,
  expectedIp,
  expectedCountry,
  expectedRegion,
  httpProbe,
  httpsProbe,
}) {
  return {
    layer: 'environment',
    status,
    proxyType,
    latencyMs,
    ip,
    country,
    region,
    city,
    isp,
    provider,
    error,
    errorType: status === 'verified' ? undefined : status,
    detail,
    expectedIp,
    expectedCountry,
    expectedRegion,
    httpProbe,
    httpsProbe,
    checkedAt: new Date().toISOString(),
  };
}

function normalizeGeoValue(value) {
  return String(value || '').trim().toLowerCase();
}

const COUNTRY_ALIASES = new Map([
  ['canada', ['canada', '加拿大', 'ca']],
  ['china', ['china', '中国', 'cn', 'mainland china', '中国大陆']],
  ['hong kong', ['hong kong', '香港', 'hk']],
  ['united states', ['united states', 'usa', 'us', '美国', '美利坚', '美國']],
  ['united kingdom', ['united kingdom', 'uk', 'britain', 'england', '英国', '英國']],
  ['japan', ['japan', '日本', 'jp']],
  ['singapore', ['singapore', '新加坡', 'sg']],
  ['taiwan', ['taiwan', '台湾', '台灣', 'tw']],
  ['south korea', ['south korea', 'korea', '韩国', '韓國', 'kr']],
  ['australia', ['australia', '澳大利亚', '澳洲', 'au']],
  ['germany', ['germany', '德国', '德國', 'de']],
  ['france', ['france', '法国', '法國', 'fr']],
]);

function expandCountryAliases(value) {
  const normalized = normalizeGeoValue(value);
  if (!normalized) return [];

  for (const aliases of COUNTRY_ALIASES.values()) {
    if (aliases.includes(normalized)) {
      return aliases;
    }
  }

  return [normalized];
}

function countryMatches(expectedCountry, actualCountry) {
  const expectedAliases = expandCountryAliases(expectedCountry);
  const actualAliases = expandCountryAliases(actualCountry);
  if (!expectedAliases.length) return true;
  if (!actualAliases.length) return false;
  return expectedAliases.some((alias) => actualAliases.includes(alias));
}

function isExpectedGeoMismatch(verification, expectedIp, expectedCountry, expectedRegion) {
  const ipExpectation = String(expectedIp || '').trim();
  const countryExpectation = normalizeGeoValue(expectedCountry);
  const regionExpectation = normalizeGeoValue(expectedRegion);
  const actualIp = String(verification.ip || '').trim();
  const actualCountry = normalizeGeoValue(verification.country);
  const actualRegion = normalizeGeoValue(verification.region);
  const actualCity = normalizeGeoValue(verification.city);

  if (ipExpectation && actualIp && actualIp !== ipExpectation) {
    return true;
  }

  if (countryExpectation && !countryMatches(expectedCountry, verification.country)) {
    return true;
  }

  if (regionExpectation && !actualRegion.includes(regionExpectation) && !actualCity.includes(regionExpectation)) {
    return true;
  }

  return false;
}

function classifyBrowserProxyError(err) {
  const message = String(err?.message || err || '');
  const sanitized = message.replace(/\u001b\[[0-9;]*m/g, '');
  const normalized = sanitized.toLowerCase();

  if (
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('aborterror') ||
    normalized.includes('err_timed_out')
  ) {
    return { type: 'timeout', message: '连接超时' };
  }

  if (
    normalized.includes('407') ||
    normalized.includes('proxy authentication required') ||
    normalized.includes('invalid_auth_credentials') ||
    normalized.includes('err_invalid_auth_credentials') ||
    normalized.includes('authentication')
  ) {
    return { type: 'auth_failed', message: '代理认证失败' };
  }

  if (
    normalized.includes('empty reply') ||
    normalized.includes('err_empty_response') ||
    normalized.includes('socket hang up') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('err_tunnel_connection_failed') ||
    normalized.includes('err_proxy_connection_failed') ||
    normalized.includes('err_no_supported_proxies') ||
    normalized.includes('tunnel connection failed') ||
    normalized.includes('proxy tunnel request to proxy server failed') ||
    normalized.includes('target closed') ||
    normalized.includes('无法通过真实浏览器确认公网 ip') ||
    normalized.includes('no successful egress provider')
  ) {
    return { type: 'no_response', message: '目标站点无响应' };
  }

  return { type: 'unknown', message: sanitized || '真实浏览器测试失败' };
}

function parseEgressPayload(provider, payload) {
  if (provider === 'ipapi' || provider === 'ipapi-http') {
    if (!payload?.ip && !payload?.query) return null;
    return {
      ip: payload.ip || payload.query,
      country: payload.country_name || payload.country,
      region: payload.region || payload.region_name,
      city: payload.city,
      isp: payload.org || payload.asn,
    };
  }

  if (provider === 'ipwhois') {
    if (payload?.success === false || !payload?.ip) return null;
    return {
      ip: payload.ip,
      country: payload.country,
      region: payload.region,
      city: payload.city,
      isp: payload.connection?.isp || payload.connection?.org,
    };
  }

  if (provider === 'ipsb') {
    if (!payload?.ip) return null;
    return {
      ip: payload.ip,
      country: payload.country,
      region: payload.region,
      city: payload.city,
      isp: payload.isp || payload.organization,
    };
  }

  return null;
}

async function runBrowserProbe(page, providers, transport) {
  const errors = [];

  for (const provider of providers) {
    try {
      const response = await page.goto(provider.url, {
        waitUntil: 'domcontentloaded',
        timeout: provider.timeoutMs,
      });

      if (!response) {
        errors.push({ provider: provider.name, error: '页面导航没有返回响应对象' });
        continue;
      }

      const status = response.status();
      const text = await response.text();
      if (status < 200 || status >= 300) {
        errors.push({ provider: provider.name, error: `HTTP ${status}` });
        continue;
      }

      let payload;
      try {
        payload = JSON.parse(text);
      } catch (error) {
        errors.push({
          provider: provider.name,
          error: `返回内容不是合法 JSON: ${String(error)}`,
        });
        continue;
      }

      const normalized = parseEgressPayload(provider.name, payload);
      if (normalized) {
        return {
          transport,
          status: 'verified',
          provider: provider.name,
          ...normalized,
        };
      }

      errors.push({
        provider: provider.name,
        error: '响应缺少可识别的出口 IP 字段',
      });
    } catch (error) {
      errors.push({
        provider: provider.name,
        error: String(error),
      });
    }
  }

  return {
    transport,
    status: 'unknown',
    error: 'No successful egress provider',
    errors,
  };
}

async function runBrowserProbeSuite(page) {
  const httpProbe = await runBrowserProbe(page, [
    { name: 'ipapi-http', url: 'http://ip-api.com/json/', timeoutMs: 8000 },
  ], 'http');

  await page.goto('about:blank', { waitUntil: 'load', timeout: 10000 }).catch(() => {});

  const httpsProbe = await runBrowserProbe(page, [
    { name: 'ipapi', url: 'https://ipapi.co/json/', timeoutMs: 8000 },
    { name: 'ipwhois', url: 'https://ipwho.is/', timeoutMs: 8000 },
    { name: 'ipsb', url: 'https://api.ip.sb/geoip', timeoutMs: 8000 },
  ], 'https');

  return { httpProbe, httpsProbe };
}

function probeToRecord(probe) {
  if (!probe) return undefined;
  const combinedError = Array.isArray(probe.errors)
    ? probe.errors.map((entry) => `${entry.provider}: ${entry.error}`).join(' | ')
    : probe.error;
  if (probe.status === 'verified') {
    return {
      transport: probe.transport,
      status: 'verified',
      provider: probe.provider,
      ip: probe.ip,
      country: probe.country,
      region: probe.region,
      city: probe.city,
      isp: probe.isp,
    };
  }
  const classified = classifyBrowserProxyError(combinedError || probe.error || '真实浏览器测试失败');
  return {
    transport: probe.transport,
    status: classified.type,
    provider: probe.provider,
    error: classified.message,
    detail: combinedError || probe.error,
  };
}

async function verifyBrowserProxyEgress(page, expectations = {}, proxyType = 'direct') {
  const startedAt = Date.now();
  await page.goto('about:blank', { waitUntil: 'load', timeout: 10000 });

  let probes;
  try {
    probes = await runBrowserProbeSuite(page);
  } finally {
    await page.goto('about:blank', { waitUntil: 'load', timeout: 10000 }).catch(() => {});
  }

  const httpProbe = probeToRecord(probes?.httpProbe);
  const httpsProbe = probeToRecord(probes?.httpsProbe);
  if (httpsProbe?.status !== 'verified') {
    return buildEnvironmentVerification({
      status: httpsProbe?.status || 'unknown',
      proxyType,
      latencyMs: Date.now() - startedAt,
      error: httpsProbe?.error || '无法通过真实浏览器确认公网 IP',
      detail: httpsProbe?.detail,
      expectedIp: expectations.expectedIp,
      expectedCountry: expectations.expectedCountry,
      expectedRegion: expectations.expectedRegion,
      httpProbe,
      httpsProbe,
    });
  }

  const verification = buildEnvironmentVerification({
    status: 'verified',
    proxyType,
    latencyMs: Date.now() - startedAt,
    ip: httpsProbe.ip,
    country: httpsProbe.country,
    region: httpsProbe.region,
    city: httpsProbe.city,
    isp: httpsProbe.isp,
    provider: httpsProbe.provider,
    expectedIp: expectations.expectedIp,
    expectedCountry: expectations.expectedCountry,
    expectedRegion: expectations.expectedRegion,
    httpProbe,
    httpsProbe,
  });

  if (isExpectedGeoMismatch(verification, expectations.expectedIp, expectations.expectedCountry, expectations.expectedRegion)) {
    return buildEnvironmentVerification({
      ...verification,
      status: 'vpn_leak_suspected',
      error: '真实浏览器出口与配置的代理信息不一致',
      detail: `Observed ${verification.ip || '-'} ${verification.country || '-'} ${verification.region || '-'}, expected ${expectations.expectedIp || '-'} ${expectations.expectedCountry || '-'} ${expectations.expectedRegion || '-'}`,
    });
  }

  return verification;
}

async function handleBrowserProxyTest(body) {
  const proxy = resolveRuntimeProxy(body, { allowImplicitHttp: false });
  if (proxy?.ambiguous) {
    return buildEnvironmentVerification({
      status: 'unknown',
      proxyType: normalizeProxyType(body?.proxyType),
      latencyMs: 0,
      error: '代理协议未明确',
      detail: '旧代理字符串缺少 scheme，请在界面中明确选择 HTTP / HTTPS / SOCKS5',
      expectedIp: body?.expectedIp,
      expectedCountry: body?.expectedCountry,
      expectedRegion: body?.expectedRegion,
    });
  }

  const browserProxy = proxy
    ? { server: proxy.server, username: proxy.username, password: proxy.password }
    : undefined;

  const browser = await chromium.launch({
    headless: true,
    proxy: browserProxy,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-quic',
      '--disable-background-networking',
      '--disable-component-update',
      '--no-pings',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
  });

  try {
    const page = await browser.newPage();
    return await verifyBrowserProxyEgress(page, {
      expectedIp: body?.expectedIp,
      expectedCountry: body?.expectedCountry,
      expectedRegion: body?.expectedRegion,
    }, proxy?.proxyType || normalizeProxyType(body?.proxyType));
  } finally {
    await browser.close().catch(() => {});
  }
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

  // ---------- seed / fingerprint ----------
  const seedStr = profileData.seed || profileId;
  let seedNum = 0;
  for (let i = 0; i < seedStr.length; i++) seedNum = (seedNum * 31 + seedStr.charCodeAt(i)) >>> 0;

  const isMobile  = !!profileData.isMobile;
  const fingerprint = generateFingerprint(seedNum, isMobile);
  if (profileData.ua) fingerprint.userAgent = profileData.ua;

  // ---------- user data dir ----------
  const userDataDir = path.join(PROFILES_DIR, profileId);
  fs.mkdirSync(userDataDir, { recursive: true });

  // ---------- proxy selection: profile override -> proxyPool ----------
  // selectedProxyUrl 保存 “原始代理字符串”，便于向 proxyPool.reportFailure 报告
  let selectedProxyUrl = null;
  const wantsDirect = normalizeProxyType(profileData.proxyType) === 'direct';
  // proxyStr 为 Playwright 所需的 { server, username, password } 或 null
  let proxyStr = proxyOverride?.server
    ? { ...proxyOverride, proxyType: normalizeProxyType(proxyOverride?.proxyType || proxyOverride?.server?.split('://')[0]) }
    : resolveRuntimeProxy(profileData, { allowImplicitHttp: false });

  if (proxyStr?.ambiguous) {
    throw createRuntimeHttpError(400, {
      error: '代理协议未明确，请在环境设置中显式选择 HTTP / HTTPS / SOCKS5',
      layer: 'environment',
      status: 'unknown',
    });
  }

  if (!proxyStr && !wantsDirect) {
    // try get from pool (sticky)
    try {
      const poolUrl = await proxyPool.getProxy(profileId);
      if (poolUrl) {
        selectedProxyUrl = poolUrl;
        proxyStr = parseProxyString(poolUrl, { allowImplicitHttp: false });
        if (proxyStr?.ambiguous) {
          throw new Error('Proxy pool returned a proxy without explicit protocol');
        }
      } else {
        throw new Error('No proxy available from pool and no proxy configured for profile');
      }
    } catch (e) {
      throw new Error('Proxy acquisition failed: ' + e.message);
    }
  } else {
    // profile provided proxy string (keep for logging)
    if (!selectedProxyUrl && profileData.proxy) selectedProxyUrl = profileData.proxy;
  }

  // ---------- build Playwright context options ----------
  /** @type {import('playwright').BrowserContextOptions} */
  const runtimeProxyType = proxyStr?.proxyType || normalizeProxyType(profileData.proxyType);
  const browserProxy = proxyStr
    ? { server: proxyStr.server, username: proxyStr.username, password: proxyStr.password }
    : undefined;
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
      '--disable-quic',
      '--disable-background-networking',
      '--disable-component-update',
      '--no-pings',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };

  if (browserProxy) ctxOptions.proxy = browserProxy;

  // ---------- launch persistent context ----------
  const context = await chromium.launchPersistentContext(userDataDir, ctxOptions);

  // 少量 TLS/UA 一致性检查（只警告，不强制）
  try {
    const browserVersion = String(context.browser()?.version?.() || '');
    const browserMajorMatch = browserVersion.match(/(\d+)\./);
    const browserMajor = browserMajorMatch ? browserMajorMatch[1] : null;
    const uaMajorMatch = (fingerprint.userAgent || '').match(/Chrome\/(\d+)/);
    const uaMajor = uaMajorMatch ? uaMajorMatch[1] : null;
    if (browserMajor && uaMajor && browserMajor !== uaMajor) {
      metrics.onUaMismatch();
      monitor.log('system', profileId, {
        event: 'ua_version_mismatch',
        browserVersion, ua: fingerprint.userAgent
      });
      console.warn(`[Runtime] UA major (${uaMajor}) != Chromium major (${browserMajor}) — TLS/JA3 风险`);
    }
  } catch (e) {
    // 忽略检查错误
  }

  // ---------- inject scripts / interceptor ----------
  const stealthScript = buildInjectionScript(fingerprint);
  const fontScript    = buildFontInjectionScript(seedNum);
  const mediaScript   = buildMediaDevicesScript(seedNum);
  await context.addInitScript(stealthScript);
  await context.addInitScript(fontScript);
  await context.addInitScript(mediaScript);

  await setupRequestInterceptor(context, { ...fingerprint, isMobile });

  // ---------- new page + sessionId ----------
  const page = await context.newPage();
  const sessionId = crypto.randomUUID();
  let verification = null;

  // ---------- verify public IP via browser (ensures proxy actually applied) ----------
  try {
    verification = await verifyBrowserProxyEgress(page, {
      expectedIp: profileData.expectedProxyIp,
      expectedCountry: profileData.expectedProxyCountry,
      expectedRegion: profileData.expectedProxyRegion,
    }, runtimeProxyType);

    if (verification.status !== 'verified') {
      metrics.onProxyVerified(false);
      metrics.onProxyFailure();
      if (selectedProxyUrl) proxyPool.reportFailure(selectedProxyUrl);
      await context.close().catch(() => {});
      throw createRuntimeHttpError(400, {
        error: verification.error || '环境层代理验证未通过',
        layer: verification.layer,
        status: verification.status,
        verification,
      });
    }

    metrics.onProxyVerified(true);

    monitor.log(sessionId, profileId, {
      event: 'proxy_verified',
      ip: verification.ip,
      country: verification.country,
      region: verification.region,
      city: verification.city,
      isp: verification.isp,
      provider: verification.provider || null,
    });

  } catch (err) {
    // 清理并向上抛
    try { await context.close(); } catch (_) {}
    throw err;
  }

  // ---------- 成功后继续：跟原逻辑建立 session 跟踪 ----------
  // Track page navigation
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      const entry = sessions.get(sessionId);
      if (entry) entry.currentUrl = frame.url();
    }
  });

  context.on('close', async () => {
    if (sessions.has(sessionId)) {
      console.log(`[Runtime] Context closed externally for session ${sessionId}`);
      sessions.delete(sessionId);
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
    verification,
  });

  // Persist sessionId back to db (如原逻辑)
  const db = readDb();
  const p  = db.profiles.find(x => x.id === profileId);
  if (p) {
    p.runtimeSessionId = sessionId;
    p.status = 'Running';
    p.proxyVerification = verification;
    writeDb(db);
  }

  metrics.onSessionStart();

  console.log(`[Runtime] ✅ Session started: ${sessionId} (profile: ${profileData.name || profileId})`);
  if (ctxOptions.proxy) console.log(`[Runtime]    Proxy: ${ctxOptions.proxy.server}`);

  monitor.log(sessionId, profileId, {
    event: 'start',
    proxy: ctxOptions.proxy?.server || 'direct',
    ua: fingerprint.userAgent,
  });

  return {
    sessionId,
    verification: sessions.get(sessionId)?.verification,
  };
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
      verification: entry.verification,
    });
  }
  return list;
}

/**
 * isGeoCompatible(fingerprint, ipInfo)
 * fingerprint: { timezone, languages: [...], ... }
 * ipInfo: { country, countryCode, ... }  — 来自 ip-api 的返回
 *
 * 作用：粗略判断代理返回的 IP 国家/地区，是否与 profile 的 timezone/lang 匹配。
 * 如果明显不匹配（例如 timezone=Asia/Shanghai 但 IP 在 US），函数返回 false。
 * 这是为了避免“个人 profile 的时区/语言”与代理地理信息冲突，从而触发风控。
 */
function isGeoCompatible(fingerprint, ipInfo) {
  try {
    if (!fingerprint || !ipInfo) return true;
    const tz = String(fingerprint.timezone || '').trim();
    const langs = Array.isArray(fingerprint.languages) ? fingerprint.languages : (fingerprint.languages ? [fingerprint.languages] : []);
    const country = (ipInfo.country || '').toLowerCase();
    const cc = (ipInfo.countryCode || '').toUpperCase();

    // 简单时区 -> 国家映射（常见）
    const tzToCC = {
      'Asia/Shanghai': 'CN',
      'Asia/Chongqing': 'CN',
      'Asia/Harbin': 'CN',
      'Asia/Seoul': 'KR',
      'Asia/Tokyo': 'JP',
      'Asia/Singapore': 'SG',
      'Asia/Kolkata': 'IN',
      'Europe/London': 'GB',
      'Europe/Paris': 'FR',
      'Europe/Berlin': 'DE',
      'America/New_York': 'US',
      'America/Los_Angeles': 'US',
      'America/Chicago': 'US',
      'Australia/Sydney': 'AU',
      'Asia/Taipei': 'TW',
      'Asia/Hong_Kong': 'HK',
    };

    const countryNames = {
      CN: 'china', US: 'united states', JP: 'japan', SG: 'singapore', KR: 'korea', IN: 'india',
      GB: 'united kingdom', FR: 'france', DE: 'germany', AU: 'australia', TW: 'taiwan', HK: 'hong kong'
    };

    // 1) 如果时区 leadership 明确映射，优先对比 countryCode
    if (tzToCC[tz]) {
      const expected = tzToCC[tz];
      if (cc && cc === expected) return true;
      // country 字符串里包含国家名也可判为匹配
      if (country && country.includes((countryNames[expected] || '').toLowerCase())) return true;
      return false;
    }

    // 2) 若无时区映射，尝试用 languages 做朴素匹配
    if (langs.length) {
      for (const lang of langs) {
        const l = String(lang || '').toLowerCase();
        // zh -> China/Taiwan/HK, en -> US/GB/AU, ja -> JP, ko -> KR, fr -> FR, de -> DE
        if (l.startsWith('zh') && (country.includes('china') || country.includes('taiwan') || country.includes('hong'))) return true;
        if (l.startsWith('ja') && country.includes('japan')) return true;
        if (l.startsWith('ko') && (country.includes('korea') || country.includes('south'))) return true;
        if (l.startsWith('fr') && country.includes('france')) return true;
        if (l.startsWith('de') && country.includes('germany')) return true;
        if (l.startsWith('en') && (country.includes('united') || country.includes('america') || country.includes('australia') || country.includes('britain') || country.includes('uk'))) return true;
      }
    }

    // 3) 宽松策略：如果无法判断或 country 字段为空，则认为兼容（不要误杀）
    if (!country && !cc) return true;

    // 最后一步：若 country 包含常见区域名则接受，否则拒绝
    return !!(country.includes('china') || country.includes('united') || country.includes('japan') || country.includes('singapore') || country.includes('korea') || country.includes('india') || country.includes('france') || country.includes('germany') || country.includes('australia') || country.includes('taiwan') || country.includes('hong kong'));

  } catch (e) {
    return true; // 出错时宽松通过，避免阻塞启动
  }
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
    // ── Authentication ───────────────────────────────────────────────────────
    if (!verifyKey(req)) {
      return send(res, 401, { error: 'Unauthorized: Missing or invalid x-runtime-key' });
    }

    // ── GET routes ──────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (url === '/health') {
        return send(res, 200, { 
          ok: true, 
          sessions: sessions.size, 
          queued: queue.getQueueLen(),
          processing: queue.getActiveCount(),
          pid: process.pid 
        });
      }
      if (url === '/runtime/metrics') {
        return send(res, 200, { active: queue.getActiveCount(), queueLen: queue.getQueueLen(), auditFile: queue.auditFile });
      }
      if (url === '/session/list') {
        return send(res, 200, handleList());
      }
      if (url === '/metrics') {
        return metrics.metricsHandler(req, res, { proxyPool, sessionsMap: sessions });
      }
      if (url === '/proxy/status') {
        try {
          const state = await proxyPool.getState();
          const proxiesList = (state.proxies || []).map(p => ({
            url: p.url,
            gatewayHealth: p.health,
            health: p.health,
            layer: 'control',
            signal: 'gateway',
            lastUsed: p.lastUsed,
            failCount: p.failCount,
            latency: p.latency,
          }));
          const sticky = {};
          for (const [k, v] of (state.sticky || [])) sticky[k] = v;
          const blacklist = {};
          for (const [u, m] of (state.blacklist || [])) blacklist[u] = m;
          
          return send(res, 200, {
            ok: true,
            layer: 'control',
            meaning: 'proxy gateway health only; not browser egress verification',
            proxies: proxiesList,
            stickyMap: sticky,
            blacklist,
          });
        } catch (e) {
          return send(res, 500, { error: String(e) });
        }
      }
      return send(res, 404, { error: 'Not found' });
    }

    // ── POST routes ─────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = await readBody(req);

      if (url === '/session/start') {
        const result = await queue.enqueueStart(body);
        return send(res, 200, result);
      }
      if (url === '/session/stop') {
        if (!body.sessionId) throw new Error('sessionId is required');
        const result = await queue.stopSession(body.sessionId);
        return send(res, 200, result);
      }
      if (url === '/session/action') {
        const result = await handleAction(body);
        return send(res, 200, result);
      }
      if (url === '/proxy/test-browser') {
        const result = await handleBrowserProxyTest(body);
        return send(res, 200, result);
      }
      if (url === '/proxy/add') {
        const { proxies } = body;
        if (!Array.isArray(proxies)) return send(res, 400, { error: 'proxies 必须是数组' });
        try {
          proxyPool.addProxies(proxies);
          // 触发异步健康检查（不阻塞请求）
          proxyPool.checkAll().catch(() => {});
          return send(res, 200, { ok: true, added: proxies.length });
        } catch (e) {
          return send(res, 500, { error: e.message });
        }
      }
      if (url === '/proxy/remove') {
        const { proxies } = body;
        if (!Array.isArray(proxies)) return send(res, 400, { error: 'proxies 必须是数组' });
        try {
          proxyPool.removeProxies(proxies);
          return send(res, 200, { ok: true, removed: proxies.length });
        } catch (e) {
          return send(res, 500, { error: e.message });
        }
      }
      return send(res, 404, { error: 'Not found' });
    }

    send(res, 405, { error: 'Method not allowed' });

  } catch (err) {
    console.error('[Runtime Error]', err.message);
    if (err?.body) {
      return send(res, err.httpStatus || 500, err.body);
    }
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

// Graceful shutdown is now handled automatically by session-queue.js hook.
