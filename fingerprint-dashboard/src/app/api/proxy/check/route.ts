import { NextResponse } from 'next/server';
import { SocksProxyAgent } from 'socks-proxy-agent';
import http from 'http';
import https from 'https';

type ProxyCheckPayload = {
  proxy?: string;
};

type ProxyLocationResponse = {
  query?: string;
  ip?: string;
  country?: string;
  regionName?: string;
  region?: string;
  city?: string;
  isp?: string;
  org?: string;
};

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

export async function POST(req: Request) {
  try {
    const { proxy: rawProxy } = (await req.json()) as ProxyCheckPayload;
    const proxy = normalizeProxy(rawProxy);

    if (!proxy) {
      return NextResponse.json({ error: '请输入代理地址' }, { status: 400 });
    }

    console.log('[proxy-check] normalizedProxy =', proxy);
    console.log('[proxy-check] proxyType =', proxy.startsWith('socks') ? 'socks' : 'http');

    return proxy.startsWith('socks')
      ? checkViaSocksProxy(proxy)
      : checkViaHttpProxy(proxy);
  } catch (error: unknown) {
    console.error('Proxy check error:', error);
    const message = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ error: '系统错误: ' + message }, { status: 500 });
  }
}

function parseProxyUrl(proxy: string) {
  const url = new URL(proxy);
  return {
    protocol: url.protocol.replace(':', ''),
    host: url.hostname,
    port: Number(url.port),
    username: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
  };
}

function formatProxyError(err: unknown) {
  const msg = err instanceof Error ? err.message : '未知错误';
  if (/empty reply|socket hang up/i.test(msg)) {
    return '代理服务器已连接，但没有返回有效响应';
  }
  if (/timed out|timeout/i.test(msg)) {
    return '代理连接超时';
  }
  return '代理连接失败: ' + msg;
}

function buildSuccess(json: ProxyLocationResponse, duration: number) {
  return NextResponse.json({
    success: true,
    ip: json.query || json.ip,
    country: json.country,
    region: json.regionName || json.region,
    city: json.city,
    isp: json.isp || json.org,
    delay: duration,
  });
}

function checkViaHttpProxy(proxy: string) {
  let proxyInfo;
  try {
    proxyInfo = parseProxyUrl(proxy);
  } catch {
    return Promise.resolve(NextResponse.json({ error: '代理格式错误' }, { status: 400 }));
  }

  return new Promise<Response>((resolve) => {
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
        'Basic ' + Buffer.from(`${proxyInfo.username}:${proxyInfo.password}`).toString('base64');
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
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            resolve(
              NextResponse.json(
                { error: `代理校验失败: HTTP ${res.statusCode}` },
                { status: 500 }
              )
            );
            return;
          }
          try {
            const json = JSON.parse(data);
            resolve(buildSuccess(json, Date.now() - startTime));
          } catch {
            resolve(
              NextResponse.json(
                { error: data ? '代理返回了非 JSON 响应' : '代理服务器已连接，但没有返回有效响应' },
                { status: 500 }
              )
            );
          }
        });
      }
    );

    request.on('error', (err: unknown) => {
      resolve(NextResponse.json({ error: formatProxyError(err) }, { status: 500 }));
    });

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });

    request.end();
  });
}

function checkViaSocksProxy(proxy: string) {
  let agent;
  try {
    agent = new SocksProxyAgent(proxy);
  } catch {
    return Promise.resolve(NextResponse.json({ error: '代理格式错误' }, { status: 400 }));
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
          if (res.statusCode && res.statusCode >= 400) {
            resolve(
              NextResponse.json(
                { error: `代理校验失败: HTTP ${res.statusCode}` },
                { status: 500 }
              )
            );
            return;
          }
          try {
            const json = JSON.parse(data);
            resolve(buildSuccess(json, Date.now() - startTime));
          } catch {
            resolve(NextResponse.json({ error: '解析返回数据失败' }, { status: 500 }));
          }
        });
      }
    );

    request.on('error', (err: unknown) => {
      resolve(NextResponse.json({ error: formatProxyError(err) }, { status: 500 }));
    });

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
  });
}
