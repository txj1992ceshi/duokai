import { NextResponse } from 'next/server';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

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
    const { proxy: rawProxy } = await req.json();
    const proxy = normalizeProxy(rawProxy);

    if (!proxy) {
      return NextResponse.json({ error: '请输入代理地址' }, { status: 400 });
    }

    let agent;
    try {
      if (proxy.startsWith('socks')) {
        agent = new SocksProxyAgent(proxy);
      } else {
        agent = new HttpsProxyAgent(proxy);
      }
    } catch (e) {
      return NextResponse.json({ error: '代理格式错误' }, { status: 400 });
    }


    // Attempt to fetch IP info through the proxy
    // Using ip-api.com (HTTP) because it's simpler for testing connectivity
    // or ipapi.co (HTTPS)
    return new Promise<Response>((resolve) => {
      const http = require('http');
      const options = {
        hostname: 'ip-api.com',
        path: '/json',
        agent: agent,
        timeout: 10000
      };

      const startTime = Date.now();
      const request = http.get(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const duration = Date.now() - startTime;
            resolve(NextResponse.json({
              success: true,
              ip: json.query,
              country: json.country,
              region: json.regionName,
              city: json.city,
              isp: json.isp,
              delay: duration
            }));
          } catch (e) {
            resolve(NextResponse.json({ error: '解析返回数据失败' }, { status: 500 }));
          }
        });
      });

      request.on('error', (err: any) => {
        resolve(NextResponse.json({ error: '代理连接失败: ' + err.message }, { status: 500 }));
      });

      request.on('timeout', () => {
        request.destroy();
        resolve(NextResponse.json({ error: '代理连接超时' }, { status: 500 }));
      });
    });
  } catch (error: any) {
    console.error('Proxy check error:', error);
    return NextResponse.json({ error: '系统错误: ' + error.message }, { status: 500 });
  }
}
