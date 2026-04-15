'use strict';

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');

const bridgeCache = new Map();

function buildBridgeKey(proxy) {
  return [
    String(proxy?.proxyType || ''),
    String(proxy?.server || ''),
    String(proxy?.username || ''),
    String(proxy?.password || ''),
  ].join('|');
}

function parseUpstreamProxy(proxy) {
  if (!proxy?.server) return null;
  const parsed = new URL(proxy.server);
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : parsed.protocol === 'socks5:' ? 1080 : 80));
  if (!parsed.hostname || !Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid upstream proxy server: ${proxy.server}`);
  }
  return {
    type: String(proxy.proxyType || parsed.protocol.replace(':', '') || 'http').toLowerCase(),
    host: parsed.hostname,
    port,
    username: proxy.username || undefined,
    password: proxy.password || undefined,
  };
}

function connectTcp(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const onError = (error) => {
      socket.removeListener('connect', onConnect);
      reject(error);
    };
    const onConnect = () => {
      socket.removeListener('error', onError);
      resolve(socket);
    };
    socket.once('connect', onConnect);
    socket.once('error', onError);
  });
}

function readUntilHeaderEnd(socket) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('end', onEnd);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onEnd = () => {
      cleanup();
      reject(new Error('Socket ended before response header completed'));
    };

    const onData = (chunk) => {
      chunks.push(chunk);
      total += chunk.length;
      const merged = Buffer.concat(chunks, total);
      const index = merged.indexOf('\r\n\r\n');
      if (index === -1) return;
      cleanup();
      resolve(merged);
    };

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('end', onEnd);
  });
}

function parseHttpStatusCode(buffer) {
  const firstLine = buffer.toString('utf8').split('\r\n')[0] || '';
  return Number(firstLine.split(/\s+/)[1] || 0);
}

function buildBasicAuthHeader(username, password) {
  if (!username) return null;
  const raw = `${username}:${password || ''}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

async function openHttpProxySocket(upstream) {
  const tcp = await connectTcp(upstream.host, upstream.port);
  if (upstream.type !== 'https') {
    return tcp;
  }
  return await new Promise((resolve, reject) => {
    const secure = tls.connect({
      socket: tcp,
      servername: upstream.host,
    });
    const onError = (error) => {
      secure.removeListener('secureConnect', onSecureConnect);
      reject(error);
    };
    const onSecureConnect = () => {
      secure.removeListener('error', onError);
      resolve(secure);
    };
    secure.once('secureConnect', onSecureConnect);
    secure.once('error', onError);
  });
}

async function connectViaHttpFamilyProxy(upstream, targetHost, targetPort) {
  const socket = await openHttpProxySocket(upstream);
  const auth = buildBasicAuthHeader(upstream.username, upstream.password);
  const request =
    `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
    `Host: ${targetHost}:${targetPort}\r\n` +
    `${auth ? `Proxy-Authorization: ${auth}\r\n` : ''}` +
    'Proxy-Connection: Keep-Alive\r\n\r\n';

  socket.write(request);
  const responseHead = await readUntilHeaderEnd(socket);
  const statusCode = parseHttpStatusCode(responseHead);
  if (statusCode !== 200) {
    socket.destroy();
    throw new Error(`HTTP/HTTPS upstream proxy CONNECT failed with status ${statusCode || 'unknown'}`);
  }

  const index = responseHead.indexOf('\r\n\r\n');
  const rest = index >= 0 ? responseHead.subarray(index + 4) : Buffer.alloc(0);
  if (rest.length > 0) {
    socket.unshift(rest);
  }
  return socket;
}

function encodeSocks5Address(host) {
  if (net.isIPv4(host)) {
    return Buffer.concat([
      Buffer.from([0x01]),
      Buffer.from(host.split('.').map((part) => Number(part))),
    ]);
  }
  const hostBuffer = Buffer.from(host, 'utf8');
  if (hostBuffer.length > 255) {
    throw new Error('SOCKS5 host is too long');
  }
  return Buffer.concat([Buffer.from([0x03, hostBuffer.length]), hostBuffer]);
}

function readExact(socket, size) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    const cleanup = () => {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('end', onEnd);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onEnd = () => {
      cleanup();
      reject(new Error('Socket ended before enough bytes were received'));
    };

    const onData = (chunk) => {
      chunks.push(chunk);
      total += chunk.length;
      const merged = Buffer.concat(chunks, total);
      if (merged.length < size) return;

      cleanup();
      const head = merged.subarray(0, size);
      const rest = merged.subarray(size);
      if (rest.length > 0) {
        socket.unshift(rest);
      }
      resolve(head);
    };

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('end', onEnd);
  });
}

function describeSocks5ReplyCode(code) {
  const descriptions = {
    0x01: 'general SOCKS server failure',
    0x02: 'connection not allowed by ruleset',
    0x03: 'network unreachable',
    0x04: 'host unreachable',
    0x05: 'connection refused',
    0x06: 'TTL expired',
    0x07: 'command not supported',
    0x08: 'address type not supported',
  };
  return descriptions[code] || 'unknown error';
}

async function performSocks5Handshake(socket, upstream) {
  const supportsAuth = Boolean(upstream.username);
  const methods = supportsAuth ? [0x00, 0x02] : [0x00];
  socket.write(Buffer.from([0x05, methods.length, ...methods]));

  const methodReply = await readExact(socket, 2);
  if (methodReply[0] !== 0x05) {
    throw new Error('SOCKS5 handshake failed: invalid version in method reply');
  }
  if (methodReply[1] === 0xff) {
    throw new Error('SOCKS5 handshake failed: upstream proxy rejected all auth methods');
  }

  if (methodReply[1] === 0x02) {
    const username = Buffer.from(upstream.username || '', 'utf8');
    const password = Buffer.from(upstream.password || '', 'utf8');
    if (username.length > 255 || password.length > 255) {
      throw new Error('SOCKS5 authentication failed: username or password too long');
    }

    socket.write(
      Buffer.concat([
        Buffer.from([0x01, username.length]),
        username,
        Buffer.from([password.length]),
        password,
      ]),
    );

    const authReply = await readExact(socket, 2);
    if (authReply[0] !== 0x01) {
      throw new Error('SOCKS5 authentication failed: invalid auth reply version');
    }
    if (authReply[1] !== 0x00) {
      throw new Error('SOCKS5 authentication failed: username/password rejected');
    }
    return;
  }

  if (methodReply[1] !== 0x00) {
    throw new Error(`SOCKS5 handshake failed: unsupported auth method selected ${methodReply[1]}`);
  }
}

async function connectViaSocks5Proxy(upstream, targetHost, targetPort) {
  const socket = await connectTcp(upstream.host, upstream.port);
  await performSocks5Handshake(socket, upstream);

  const address = encodeSocks5Address(targetHost);
  const port = Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff]);
  const request = Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), address, port]);
  socket.write(request);

  const head = await readExact(socket, 4);
  if (head[0] !== 0x05) {
    socket.destroy();
    throw new Error('SOCKS5 CONNECT failed: invalid version in connect reply');
  }
  if (head[1] !== 0x00) {
    socket.destroy();
    throw new Error(`SOCKS5 CONNECT failed with reply code ${head[1]} (${describeSocks5ReplyCode(head[1])})`);
  }

  const atyp = head[3];
  if (atyp === 0x01) {
    await readExact(socket, 4 + 2);
  } else if (atyp === 0x03) {
    const length = await readExact(socket, 1);
    await readExact(socket, length[0] + 2);
  } else if (atyp === 0x04) {
    await readExact(socket, 16 + 2);
  } else {
    socket.destroy();
    throw new Error(`SOCKS5 CONNECT failed: unknown address type ${atyp}`);
  }

  return socket;
}

async function openUpstreamTunnel(upstream, targetHost, targetPort) {
  if (upstream.type === 'socks5') {
    return await connectViaSocks5Proxy(upstream, targetHost, targetPort);
  }
  return await connectViaHttpFamilyProxy(upstream, targetHost, targetPort);
}

function parseTargetRequestInfo(rawUrl, hostHeader) {
  const normalizedUrl =
    /^[a-z]+:\/\//i.test(rawUrl)
      ? rawUrl
      : `http://${hostHeader || '127.0.0.1'}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;
  const parsed = new URL(normalizedUrl);
  const protocol = parsed.protocol === 'https:' ? 'https:' : 'http:';
  const port = Number(parsed.port || (protocol === 'https:' ? 443 : 80));

  return {
    protocol,
    host: parsed.hostname,
    hostHeader: parsed.host,
    port,
    path: `${parsed.pathname || '/'}${parsed.search || ''}`,
  };
}

function pipeBidirectional(left, right) {
  left.pipe(right);
  right.pipe(left);
}

function wrapTlsTunnel(socket, host) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({
      socket,
      servername: host,
    });
    const onError = (error) => {
      secure.removeListener('secureConnect', onSecureConnect);
      reject(error);
    };
    const onSecureConnect = () => {
      secure.removeListener('error', onError);
      resolve(secure);
    };
    secure.once('secureConnect', onSecureConnect);
    secure.once('error', onError);
  });
}

async function handleConnectRequest(clientSocket, head, requestUrl, upstream) {
  let upstreamSocket = null;
  try {
    const separatorIndex = requestUrl.lastIndexOf(':');
    const targetHost = separatorIndex === -1 ? '' : requestUrl.slice(0, separatorIndex);
    const targetPort = Number(separatorIndex === -1 ? '' : requestUrl.slice(separatorIndex + 1));
    if (!targetHost || !Number.isFinite(targetPort) || targetPort <= 0) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
      return;
    }

    upstreamSocket = await openUpstreamTunnel(upstream, targetHost, targetPort);
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length > 0) {
      upstreamSocket.write(head);
    }
    pipeBidirectional(clientSocket, upstreamSocket);
  } catch (error) {
    upstreamSocket?.destroy();
    clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
  }
}

async function handleHttpRequest(req, res, upstream) {
  let upstreamSocket = null;
  let proxyRequest = null;

  try {
    const target = parseTargetRequestInfo(req.url || '/', req.headers.host);
    upstreamSocket = await openUpstreamTunnel(upstream, target.host, target.port);
    const transport = target.protocol === 'https:' ? https : http;
    const connection =
      target.protocol === 'https:'
        ? await wrapTlsTunnel(upstreamSocket, target.host)
        : upstreamSocket;

    const headers = { ...req.headers };
    delete headers['proxy-connection'];
    delete headers['proxy-authorization'];
    headers.host = target.hostHeader;

    proxyRequest = transport.request({
      host: target.host,
      port: target.port,
      method: req.method || 'GET',
      path: target.path,
      headers,
      agent: false,
      createConnection: () => connection,
    });

    proxyRequest.once('response', (proxyResponse) => {
      res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(res);
    });

    proxyRequest.once('error', () => {
      if (!res.headersSent) {
        res.writeHead(502).end();
      } else {
        res.end();
      }
    });

    req.pipe(proxyRequest);
  } catch (error) {
    proxyRequest?.destroy();
    upstreamSocket?.destroy();
    if (!res.headersSent) {
      res.writeHead(502).end();
    } else {
      res.end();
    }
  }
}

async function createBridge(proxy) {
  const upstream = parseUpstreamProxy(proxy);
  if (!upstream) {
    throw new Error('Cannot create runtime proxy bridge without upstream proxy');
  }

  const server = http.createServer((req, res) => {
    void handleHttpRequest(req, res, upstream);
  });

  server.on('connect', (req, clientSocket, head) => {
    void handleConnectRequest(clientSocket, head, req.url || '', upstream);
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to determine runtime proxy bridge port');
  }

  return {
    key: buildBridgeKey(proxy),
    server,
    port: address.port,
    upstream,
  };
}

async function resolveRuntimeLaunchProxy(proxy) {
  if (!proxy?.server) {
    return {
      browserProxy: undefined,
      bridgeActive: false,
      detail: 'direct',
    };
  }

  const key = buildBridgeKey(proxy);
  if (!bridgeCache.has(key)) {
    bridgeCache.set(
      key,
      createBridge(proxy).catch((error) => {
        bridgeCache.delete(key);
        throw error;
      }),
    );
  }

  const bridge = await bridgeCache.get(key);
  return {
    browserProxy: {
      server: `http://127.0.0.1:${bridge.port}`,
    },
    bridgeActive: true,
    detail: `via local runtime proxy bridge http://127.0.0.1:${bridge.port} -> ${bridge.upstream.type}://${bridge.upstream.host}:${bridge.upstream.port}`,
  };
}

function describeResolvedRuntimeProxy(proxy, resolved) {
  if (!proxy?.server) {
    return 'proxyType=direct; upstream=direct; bridgeActive=false; detail=direct';
  }
  return `proxyType=${proxy.proxyType}; upstream=${proxy.server}; bridgeActive=${resolved.bridgeActive}; detail=${resolved.detail}`;
}

async function closeAllRuntimeProxyBridges() {
  const entries = await Promise.allSettled([...bridgeCache.values()]);
  bridgeCache.clear();
  await Promise.all(
    entries
      .filter((entry) => entry.status === 'fulfilled')
      .map((entry) => {
        const bridge = entry.value;
        return new Promise((resolve) => {
          bridge.server.close(() => resolve());
        });
      }),
  );
}

module.exports = {
  resolveRuntimeLaunchProxy,
  describeResolvedRuntimeProxy,
  closeAllRuntimeProxyBridges,
};
