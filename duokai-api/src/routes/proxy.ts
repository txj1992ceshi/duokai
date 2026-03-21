import { Router } from 'express';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import { connectMongo } from '../lib/mongodb.js';
import { asyncHandler } from '../lib/http.js';
import { getRuntimeApiKey, getRuntimeUrl } from '../lib/runtime.js';
import type {
  HostEnvironment,
  HostNetworkMode,
  ProxyEntryTransport,
  ProxyProtocol,
  ProxyVerificationRecord,
} from '../lib/proxyTypes.js';
import { requireUser } from '../middlewares/auth.js';
import { ProfileModel } from '../models/Profile.js';

type ProxyCheckPayload = {
  proxy?: string;
  proxyType?: ProxyProtocol;
  proxyHost?: string;
  proxyPort?: string | number;
  proxyUsername?: string;
  proxyPassword?: string;
  expectedIp?: string;
  expectedCountry?: string;
  expectedRegion?: string;
};

type ProxyLocationResponse = {
  query?: string;
  ip?: string;
  country?: string;
  country_name?: string;
  regionName?: string;
  region?: string;
  city?: string;
  isp?: string;
  org?: string;
  connection?: {
    isp?: string;
    org?: string;
  };
};

type ControlCheckResult = ProxyVerificationRecord & {
  layer: 'control';
};

const router = Router();

function detectHostEnvironment(): HostEnvironment {
  switch (os.platform()) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      return 'unknown';
  }
}

function inferNetworkMode(hostEnvironment: HostEnvironment): HostNetworkMode {
  return hostEnvironment === 'windows' ? 'unknown' : 'system_proxy_only';
}

function toEntryTransport(proxyType: ProxyProtocol): ProxyEntryTransport {
  if (proxyType === 'https') return 'https-entry';
  if (proxyType === 'socks5') return 'socks5-entry';
  if (proxyType === 'direct') return 'direct';
  return 'http-entry';
}

function normalizeProxy(raw: string) {
  const proxy = raw.trim();

  try {
    const url = new URL(proxy);
    if (url.protocol && url.hostname && url.port) return proxy;
  } catch {}

  let match = proxy.match(/^(https?|socks5):\/\/([^:]+):(\d+):([^:]+):(.+)$/i);
  if (match) {
    const [, protocol, host, port, user, pass] = match;
    return `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }

  match = proxy.match(/^([^:]+):(\d+):([^:]+):(.+)$/);
  if (match) {
    const [, host, port, user, pass] = match;
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }

  match = proxy.match(/^([^:]+):([^@]+)@([^:]+):(\d+)$/);
  if (match) {
    const [, user, pass, host, port] = match;
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }

  return proxy;
}

function buildProxyFromPayload(payload: ProxyCheckPayload) {
  const type = payload.proxyType;
  const host = String(payload.proxyHost || '').trim();
  const port = String(payload.proxyPort || '').trim();
  const username = String(payload.proxyUsername || '').trim();
  const password = String(payload.proxyPassword || '').trim();

  if (type && type !== 'direct' && host && port) {
    const auth = username || password
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
      : '';
    return `${type}://${auth}${host}:${port}`;
  }

  return normalizeProxy(payload.proxy || '');
}

function parseProxyUrl(proxy: string) {
  const url = new URL(proxy);
  return {
    protocol: (url.protocol.replace(':', '') || 'http') as ProxyProtocol,
    host: url.hostname,
    port: Number(url.port),
    username: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
  };
}

function formatProxyError(error: unknown) {
  const message = error instanceof Error ? error.message : '未知错误';
  if (/407|proxy authentication required|authentication/i.test(message)) {
    return { status: 'auth_failed' as const, error: '代理认证失败' };
  }
  if (/timed out|timeout/i.test(message)) {
    return { status: 'timeout' as const, error: '代理连接超时' };
  }
  if (/empty reply|socket hang up|failed to fetch/i.test(message)) {
    return { status: 'no_response' as const, error: '代理服务器已连接，但没有返回有效响应' };
  }
  return { status: 'unknown' as const, error: `代理连接失败: ${message}` };
}

function buildSuccess(json: ProxyLocationResponse, duration: number, proxyType: ProxyProtocol): ControlCheckResult {
  const hostEnvironment = detectHostEnvironment();
  return {
    layer: 'control',
    status: 'reachable',
    proxyType,
    candidateTransport: toEntryTransport(proxyType),
    effectiveProxyTransport: toEntryTransport(proxyType),
    hostEnvironment,
    networkMode: inferNetworkMode(hostEnvironment),
    ip: json.query || json.ip,
    country: json.country || json.country_name,
    region: json.regionName || json.region,
    city: json.city,
    isp: json.isp || json.org || json.connection?.isp || json.connection?.org,
    latencyMs: duration,
    gatewayReachable: true,
    checkedAt: new Date().toISOString(),
  };
}

function buildFailure(
  status: ControlCheckResult['status'],
  error: string,
  duration: number,
  extra: Partial<ControlCheckResult> = {}
): ControlCheckResult {
  const hostEnvironment = detectHostEnvironment();
  return {
    layer: 'control',
    status,
    proxyType: extra.proxyType,
    candidateTransport: extra.candidateTransport || toEntryTransport(extra.proxyType || 'http'),
    effectiveProxyTransport: extra.effectiveProxyTransport,
    hostEnvironment: extra.hostEnvironment || hostEnvironment,
    networkMode: extra.networkMode || inferNetworkMode(hostEnvironment),
    error,
    errorType: status,
    latencyMs: duration,
    gatewayReachable: status !== 'timeout',
    checkedAt: new Date().toISOString(),
    ...extra,
  };
}

function checkViaHttpsProxy(proxy: string, proxyType: ProxyProtocol) {
  let agent: HttpsProxyAgent<string>;
  try {
    agent = new HttpsProxyAgent(proxy);
  } catch {
    return Promise.resolve(buildFailure('unknown', '代理格式错误', 0, { gatewayReachable: false, proxyType }));
  }

  return new Promise<ControlCheckResult>((resolve) => {
    const startTime = Date.now();
    const request = https.get(
      {
        hostname: 'ipwho.is',
        path: '/',
        agent,
        timeout: 10000,
        rejectUnauthorized: false,
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          const duration = Date.now() - startTime;
          if (response.statusCode && response.statusCode >= 400) {
            const status = response.statusCode === 407 ? 'auth_failed' : 'no_response';
            resolve(buildFailure(status, `代理校验失败: HTTP ${response.statusCode}`, duration, { proxyType }));
            return;
          }
          try {
            resolve(buildSuccess(JSON.parse(data), duration, proxyType));
          } catch {
            resolve(buildFailure('no_response', data ? '代理返回了非 JSON 响应' : '代理服务器已连接，但没有返回有效响应', duration, { proxyType }));
          }
        });
      }
    );

    request.on('error', (error) => {
      const formatted = formatProxyError(error);
      resolve(buildFailure(formatted.status, formatted.error, Date.now() - startTime, { proxyType }));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
  });
}

function checkViaHttpProxy(proxy: string, proxyType: ProxyProtocol) {
  if (proxyType === 'https') {
    return checkViaHttpsProxy(proxy, proxyType);
  }

  let proxyInfo;
  try {
    proxyInfo = parseProxyUrl(proxy);
  } catch {
    return Promise.resolve(buildFailure('unknown', '代理格式错误', 0, { gatewayReachable: false }));
  }

  return new Promise<ControlCheckResult>((resolve) => {
    const target = 'http://ip-api.com/json';
    const startTime = Date.now();
    const headers: Record<string, string> = {
      Host: 'ip-api.com',
      'User-Agent': 'duokai-proxy-check/1.0',
      Accept: 'application/json',
      'Proxy-Connection': 'Keep-Alive',
    };

    if (proxyInfo.username || proxyInfo.password) {
      headers['Proxy-Authorization'] =
        `Basic ${Buffer.from(`${proxyInfo.username}:${proxyInfo.password}`).toString('base64')}`;
    }

    const request = http.request(
      {
        host: proxyInfo.host,
        port: proxyInfo.port,
        method: 'GET',
        path: target,
        headers,
        timeout: 10000,
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          const duration = Date.now() - startTime;
          if (response.statusCode && response.statusCode >= 400) {
            const status = response.statusCode === 407 ? 'auth_failed' : 'no_response';
            resolve(buildFailure(status, `代理校验失败: HTTP ${response.statusCode}`, duration, { proxyType }));
            return;
          }
          try {
            resolve(buildSuccess(JSON.parse(data), duration, proxyType));
          } catch {
            resolve(buildFailure('no_response', data ? '代理返回了非 JSON 响应' : '代理服务器已连接，但没有返回有效响应', duration, { proxyType }));
          }
        });
      }
    );

    request.on('error', (error) => {
      const formatted = formatProxyError(error);
      resolve(buildFailure(formatted.status, formatted.error, Date.now() - startTime, { proxyType }));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.end();
  });
}

function checkViaSocksProxy(proxy: string, proxyType: ProxyProtocol) {
  let agent: SocksProxyAgent;
  try {
    agent = new SocksProxyAgent(proxy);
  } catch {
    return Promise.resolve(buildFailure('unknown', '代理格式错误', 0, { gatewayReachable: false, proxyType }));
  }

  return new Promise<ControlCheckResult>((resolve) => {
    const startTime = Date.now();
    const request = https.get(
      {
        hostname: 'api.ipify.org',
        path: '/?format=json',
        agent,
        timeout: 10000,
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          const duration = Date.now() - startTime;
          if (response.statusCode && response.statusCode >= 400) {
            const status = response.statusCode === 407 ? 'auth_failed' : 'no_response';
            resolve(buildFailure(status, `代理校验失败: HTTP ${response.statusCode}`, duration, { proxyType }));
            return;
          }
          try {
            resolve(buildSuccess(JSON.parse(data), duration, proxyType));
          } catch {
            resolve(buildFailure('no_response', '解析返回数据失败', duration, { proxyType }));
          }
        });
      }
    );

    request.on('error', (error) => {
      const formatted = formatProxyError(error);
      resolve(buildFailure(formatted.status, formatted.error, Date.now() - startTime, { proxyType }));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
  });
}

router.post(
  '/check',
  asyncHandler(async (req, res) => {
    const payload = (req.body || {}) as ProxyCheckPayload;
    const proxy = buildProxyFromPayload(payload);

    if (!proxy) {
      res.json(buildFailure('unknown', '请输入代理地址', 0, { gatewayReachable: false }));
      return;
    }

    const proxyInfo = parseProxyUrl(proxy);
    const result =
      proxyInfo.protocol === 'socks5'
        ? await checkViaSocksProxy(proxy, proxyInfo.protocol)
        : await checkViaHttpProxy(proxy, proxyInfo.protocol);
    res.json(result);
  })
);

router.post(
  '/browser-check',
  requireUser,
  asyncHandler(async (req, res) => {
    await connectMongo();
    const authUser = req.authUser!;
    const body = (req.body || {}) as Record<string, unknown>;
    const profileId = String(body.profileId || '');
    const payload: Record<string, unknown> = { ...body };

    if (profileId) {
      const profile = await ProfileModel.findOne({
        _id: profileId,
        userId: authUser.userId,
      }).lean();

      if (!profile) {
        res.status(404).json({ success: false, error: 'Profile not found' });
        return;
      }

      payload.proxyType = payload.proxyType || profile.proxyType || 'direct';
      payload.proxyHost = payload.proxyHost || profile.proxyHost || '';
      payload.proxyPort = payload.proxyPort || profile.proxyPort || '';
      payload.proxyUsername = payload.proxyUsername || profile.proxyUsername || '';
      payload.proxyPassword = payload.proxyPassword || profile.proxyPassword || '';
      payload.expectedIp = payload.expectedIp || profile.expectedProxyIp || '';
      payload.expectedCountry = payload.expectedCountry || profile.expectedProxyCountry || '';
      payload.expectedRegion = payload.expectedRegion || profile.expectedProxyRegion || '';
      payload.proxy = payload.proxy || profile.proxy || '';
    }

    const runtimeResponse = await fetch(`${getRuntimeUrl()}/proxy/test-browser`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-runtime-key': getRuntimeApiKey(),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });

    let json: unknown = {};
    try {
      json = await runtimeResponse.json();
    } catch {}

    res.status(runtimeResponse.status).json(json);
  })
);

export default router;
