import { NextResponse } from 'next/server';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import http from 'http';
import https from 'https';
import os from 'os';
import type { HostEnvironment, HostNetworkMode, ProxyEntryTransport, ProxyProtocol, ProxyVerificationRecord } from '@/lib/proxyTypes';

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

  // 已经是标准 URL：scheme://user:pass@host:port 或 scheme://host:port
  try {
    const u = new URL(proxy);
    if (u.protocol && u.hostname && u.port) return proxy;
  } catch {}

  // 兼容：scheme://host:port:user:pass
  let m = proxy.match(/^(https?|socks5):\/\/([^:]+):(\d+):([^:]+):(.+)$/i);
  if (m) {
    const [, protocol, host, port, user, pass] = m;
    return `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }

  // 兼容：host:port:user:pass
  m = proxy.match(/^([^:]+):(\d+):([^:]+):(.+)$/);
  if (m) {
    const [, host, port, user, pass] = m;
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }

  // 兼容：user:pass@host:port
  m = proxy.match(/^([^:]+):([^@]+)@([^:]+):(\d+)$/);
  if (m) {
    const [, user, pass, host, port] = m;
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

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as ProxyCheckPayload;
    const proxy = buildProxyFromPayload(payload);

    if (!proxy) {
      return buildControlResult(buildFailure('unknown', '请输入代理地址', 0, { gatewayReachable: false }));
    }

    const proxyInfo = parseProxyUrl(proxy);
    return proxyInfo.protocol === 'socks5'
      ? checkViaSocksProxy(proxy, proxyInfo.protocol)
      : checkViaHttpProxy(proxy, proxyInfo.protocol);
  } catch (error: unknown) {
    console.error('Proxy check error:', error);
    const message = error instanceof Error ? error.message : '未知错误';
    return buildControlResult(buildFailure('unknown', '系统错误: ' + message, 0, { gatewayReachable: false }));
  }
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

function formatProxyError(err: unknown) {
  const msg = err instanceof Error ? err.message : '未知错误';
  if (/407|proxy authentication required|authentication/i.test(msg)) {
    return { status: 'auth_failed' as const, error: '代理认证失败' };
  }
  if (/timed out|timeout/i.test(msg)) {
    return { status: 'timeout' as const, error: '代理连接超时' };
  }
  if (/empty reply|socket hang up|failed to fetch/i.test(msg)) {
    return { status: 'no_response' as const, error: '代理服务器已连接，但没有返回有效响应' };
  }
  return { status: 'unknown' as const, error: '代理连接失败: ' + msg };
}

function buildControlResult(result: ControlCheckResult) {
  return NextResponse.json(result);
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

function checkViaHttpProxy(proxy: string, proxyType: ProxyProtocol) {
  if (proxyType === 'https') {
    return checkViaHttpsProxy(proxy, proxyType);
  }
  let proxyInfo;
  try {
    proxyInfo = parseProxyUrl(proxy);
  } catch {
    return Promise.resolve(buildControlResult(buildFailure('unknown', '代理格式错误', 0, { gatewayReachable: false })));
  }

  return new Promise<Response>((resolve) => {
    const target = 'http://ip-api.com/json';
    const startTime = Date.now();
    const transport = http;
    const headers: Record<string, string> = {
      Host: 'ip-api.com',
      'User-Agent': 'duokai-proxy-check/1.0',
      Accept: 'application/json',
      'Proxy-Connection': 'Keep-Alive',
    };

    if (proxyInfo.username || proxyInfo.password) {
      headers['Proxy-Authorization'] =
        'Basic ' + Buffer.from(`${proxyInfo.username}:${proxyInfo.password}`).toString('base64');
    }

    const request = transport.request(
      {
        host: proxyInfo.host,
        port: proxyInfo.port,
        method: 'GET',
        path: target,
        headers,
        timeout: 10000,
        rejectUnauthorized: false,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const duration = Date.now() - startTime;
          if (res.statusCode && res.statusCode >= 400) {
            const status = res.statusCode === 407 ? 'auth_failed' : 'no_response';
            resolve(buildControlResult(buildFailure(status, `代理校验失败: HTTP ${res.statusCode}`, duration, { proxyType })));
            return;
          }
          try {
            const json = JSON.parse(data);
            resolve(buildControlResult(buildSuccess(json, duration, proxyType)));
          } catch {
            resolve(buildControlResult(buildFailure('no_response', data ? '代理返回了非 JSON 响应' : '代理服务器已连接，但没有返回有效响应', duration, { proxyType })));
          }
        });
      }
    );

    request.on('error', (err: unknown) => {
      const formatted = formatProxyError(err);
      resolve(buildControlResult(buildFailure(formatted.status, formatted.error, Date.now() - startTime, { proxyType })));
    });

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });

    request.end();
  });
}

function checkViaHttpsProxy(proxy: string, proxyType: ProxyProtocol) {
  let agent;
  try {
    agent = new HttpsProxyAgent(proxy);
  } catch {
    return Promise.resolve(buildControlResult(buildFailure('unknown', '代理格式错误', 0, { gatewayReachable: false, proxyType })));
  }

  return new Promise<Response>((resolve) => {
    const startTime = Date.now();
    const request = https.get(
      {
        hostname: 'ipwho.is',
        path: '/',
        agent,
        timeout: 10000,
        rejectUnauthorized: false,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const duration = Date.now() - startTime;
          if (res.statusCode && res.statusCode >= 400) {
            const status = res.statusCode === 407 ? 'auth_failed' : 'no_response';
            resolve(buildControlResult(buildFailure(status, `代理校验失败: HTTP ${res.statusCode}`, duration, { proxyType })));
            return;
          }
          try {
            const json = JSON.parse(data);
            resolve(buildControlResult(buildSuccess(json, duration, proxyType)));
          } catch {
            resolve(buildControlResult(buildFailure('no_response', data ? '代理返回了非 JSON 响应' : '代理服务器已连接，但没有返回有效响应', duration, { proxyType })));
          }
        });
      }
    );

    request.on('error', (err: unknown) => {
      const formatted = formatProxyError(err);
      resolve(buildControlResult(buildFailure(formatted.status, formatted.error, Date.now() - startTime, { proxyType })));
    });

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
  });
}

function checkViaSocksProxy(proxy: string, proxyType: ProxyProtocol) {
  let agent;
  try {
    agent = new SocksProxyAgent(proxy);
  } catch {
    return Promise.resolve(buildControlResult(buildFailure('unknown', '代理格式错误', 0, { gatewayReachable: false })));
  }

  return new Promise<Response>((resolve) => {
    const startTime = Date.now();
    const request = https.get(
      {
        hostname: 'api.ipify.org',
        path: '/?format=json',
        agent,
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const duration = Date.now() - startTime;
          if (res.statusCode && res.statusCode >= 400) {
            const status = res.statusCode === 407 ? 'auth_failed' : 'no_response';
            resolve(buildControlResult(buildFailure(status, `代理校验失败: HTTP ${res.statusCode}`, duration, { proxyType })));
            return;
          }
          try {
            const json = JSON.parse(data);
            resolve(buildControlResult(buildSuccess(json, duration, proxyType)));
          } catch {
            resolve(buildControlResult(buildFailure('no_response', '解析返回数据失败', duration, { proxyType })));
          }
        });
      }
    );

    request.on('error', (err: unknown) => {
      const formatted = formatProxyError(err);
      resolve(buildControlResult(buildFailure(formatted.status, formatted.error, Date.now() - startTime, { proxyType })));
    });

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
  });
}
