import http from 'node:http'
import net from 'node:net'
import type { Duplex } from 'node:stream'
import tls from 'node:tls'
import { spawnSync } from 'node:child_process'
import type { ProxyRecord } from '../../src/shared/types'
import { buildProxyServer } from './runtime'

type PlaywrightProxyConfig = {
  server: string
  username?: string
  password?: string
}

type UpstreamProxy = {
  host: string
  port: number
}

type BridgeEntry = {
  key: string
  server: http.Server
  port: number
  upstream: UpstreamProxy
}

const bridgeCache = new Map<string, Promise<BridgeEntry>>()

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1'
}

function parseProxyHostPort(value: string): UpstreamProxy | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const raw =
    trimmed.includes('=') ?
      (trimmed
        .split(';')
        .map((part) => part.trim())
        .find((part) => /^https?=/i.test(part)) || trimmed.split(';')[0] || '')
        .split('=')
        .slice(1)
        .join('=')
        .trim()
    : trimmed

  const withoutScheme = raw.replace(/^[a-z]+:\/\//i, '')
  const [host, portText] = withoutScheme.split(':')
  const port = Number(portText)
  if (!host || !Number.isFinite(port) || port <= 0) {
    return null
  }
  return { host, port }
}

function readWindowsSystemProxy(): UpstreamProxy | null {
  if (process.platform !== 'win32') {
    return null
  }

  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
  const enabled = spawnSync('reg.exe', ['query', key, '/v', 'ProxyEnable'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (enabled.status !== 0 || !/\b0x1\b/.test(enabled.stdout)) {
    return null
  }

  const server = spawnSync('reg.exe', ['query', key, '/v', 'ProxyServer'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (server.status !== 0) {
    return null
  }

  const match = server.stdout.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i)
  return match ? parseProxyHostPort(match[1]) : null
}

async function connectSocket(host: string, port: number): Promise<net.Socket> {
  return await new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    const onError = (error: Error) => {
      socket.destroy()
      reject(error)
    }
    socket.once('connect', () => {
      socket.removeListener('error', onError)
      resolve(socket)
    })
    socket.once('error', onError)
  })
}

async function readResponseHead(socket: net.Socket | tls.TLSSocket): Promise<{ statusCode: number; rest: Buffer }> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0

    const cleanup = () => {
      socket.removeListener('data', onData)
      socket.removeListener('error', onError)
      socket.removeListener('end', onEnd)
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onEnd = () => {
      cleanup()
      reject(new Error('Socket ended before proxy response was complete'))
    }

    const onData = (chunk: Buffer) => {
      chunks.push(chunk)
      total += chunk.length
      const buffer = Buffer.concat(chunks, total)
      const index = buffer.indexOf('\r\n\r\n')
      if (index === -1) {
        return
      }
      cleanup()
      const headText = buffer.subarray(0, index).toString('utf8')
      const statusCode = Number(headText.split(/\s+/)[1] || 0)
      resolve({
        statusCode,
        rest: buffer.subarray(index + 4),
      })
    }

    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('end', onEnd)
  })
}

async function connectViaUpstreamProxy(upstream: UpstreamProxy, targetHost: string, targetPort: number): Promise<net.Socket> {
  const socket = await connectSocket(upstream.host, upstream.port)
  socket.write(
    `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nProxy-Connection: Keep-Alive\r\n\r\n`,
  )
  const response = await readResponseHead(socket)
  if (response.statusCode !== 200) {
    socket.destroy()
    throw new Error(`Upstream proxy CONNECT failed with status ${response.statusCode || 'unknown'}`)
  }
  if (response.rest.length > 0) {
    socket.unshift(response.rest)
  }
  return socket
}

async function openOuterProxySocket(proxy: ProxyRecord, upstream: UpstreamProxy): Promise<net.Socket | tls.TLSSocket> {
  const baseSocket = await connectViaUpstreamProxy(upstream, proxy.host, Number(proxy.port))
  if (proxy.type !== 'https') {
    return baseSocket
  }
  return await new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect({
      socket: baseSocket,
      servername: proxy.host,
    })
    secureSocket.once('secureConnect', () => resolve(secureSocket))
    secureSocket.once('error', reject)
  })
}

function buildProxyAuthorization(proxy: ProxyRecord): string | null {
  if (!proxy.username) {
    return null
  }
  const raw = `${proxy.username}:${proxy.password || ''}`
  return `Basic ${Buffer.from(raw).toString('base64')}`
}

async function handleConnectTunnel(
  clientSocket: Duplex,
  head: Buffer,
  requestUrl: string,
  proxy: ProxyRecord,
  upstream: UpstreamProxy,
) {
  let upstreamSocket: net.Socket | tls.TLSSocket | null = null
  try {
    upstreamSocket = await openOuterProxySocket(proxy, upstream)
    const auth = buildProxyAuthorization(proxy)
    upstreamSocket.write(
      `CONNECT ${requestUrl} HTTP/1.1\r\nHost: ${requestUrl}\r\n${auth ? `Proxy-Authorization: ${auth}\r\n` : ''}Proxy-Connection: Keep-Alive\r\n\r\n`,
    )
    const response = await readResponseHead(upstreamSocket)
    if (response.statusCode !== 200) {
      clientSocket.end(`HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n`)
      upstreamSocket.destroy()
      return
    }
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (response.rest.length > 0) {
      clientSocket.write(response.rest)
    }
    if (head.length > 0) {
      upstreamSocket.write(head)
    }
    upstreamSocket.pipe(clientSocket)
    clientSocket.pipe(upstreamSocket)
  } catch {
    upstreamSocket?.destroy()
    clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n')
  }
}

async function handleHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  proxy: ProxyRecord,
  upstream: UpstreamProxy,
) {
  let upstreamSocket: net.Socket | tls.TLSSocket | null = null
  try {
    upstreamSocket = await openOuterProxySocket(proxy, upstream)
    const auth = buildProxyAuthorization(proxy)
    const headers = { ...req.headers }
    delete headers['proxy-connection']
    delete headers['proxy-authorization']
    headers.connection = headers.connection || 'close'
    if (auth) {
      headers['proxy-authorization'] = auth
    }
    const headerLines = Object.entries(headers)
      .flatMap(([key, value]) => {
        if (value === undefined) {
          return []
        }
        if (Array.isArray(value)) {
          return value.map((item) => `${key}: ${item}`)
        }
        return [`${key}: ${value}`]
      })
      .join('\r\n')
    upstreamSocket.write(`${req.method || 'GET'} ${req.url || '/'} HTTP/1.1\r\n${headerLines}\r\n\r\n`)
    req.pipe(upstreamSocket)
    upstreamSocket.pipe(res)
    upstreamSocket.once('end', () => res.end())
    upstreamSocket.once('error', () => {
      if (!res.headersSent) {
        res.writeHead(502).end()
      } else {
        res.end()
      }
    })
  } catch {
    upstreamSocket?.destroy()
    if (!res.headersSent) {
      res.writeHead(502).end()
    } else {
      res.end()
    }
  }
}

async function createBridge(proxy: ProxyRecord, upstream: UpstreamProxy): Promise<BridgeEntry> {
  const server = http.createServer((req, res) => {
    void handleHttpRequest(req, res, proxy, upstream)
  })
  server.on('connect', (req, clientSocket, head) => {
    void handleConnectTunnel(clientSocket, head, req.url || '', proxy, upstream)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to determine local proxy bridge port')
  }
  return {
    key: '',
    server,
    port: address.port,
    upstream,
  }
}

export async function resolveLaunchProxy(
  proxy: ProxyRecord | null,
): Promise<{ config: PlaywrightProxyConfig | null; bridgeActive: boolean; detail: string }> {
  if (!proxy) {
    return { config: null, bridgeActive: false, detail: '' }
  }

  const upstream = readWindowsSystemProxy()
  if (
    process.platform !== 'win32' ||
    !upstream ||
    !isLoopbackHost(upstream.host) ||
    isLoopbackHost(proxy.host) ||
    (proxy.host === upstream.host && Number(proxy.port) === upstream.port)
  ) {
    return {
      config: {
        server: buildProxyServer(proxy),
        username: proxy.username || undefined,
        password: proxy.password || undefined,
      },
      bridgeActive: false,
      detail: '',
    }
  }

  const key = `${buildProxyServer(proxy)}|${proxy.username || ''}|${proxy.password || ''}|${upstream.host}:${upstream.port}`
  if (!bridgeCache.has(key)) {
    bridgeCache.set(
      key,
      createBridge(proxy, upstream).then((entry) => ({
        ...entry,
        key,
      })),
    )
  }
  const bridge = await bridgeCache.get(key)!
  return {
    config: {
      server: `http://127.0.0.1:${bridge.port}`,
    },
    bridgeActive: true,
    detail: `via local bridge http://127.0.0.1:${bridge.port} through system proxy ${upstream.host}:${upstream.port}`,
  }
}
