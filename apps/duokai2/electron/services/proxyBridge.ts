import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import type { Duplex } from 'node:stream'
import type { EgressPathType, ProxyRecord } from '../../src/shared/types'
import type { EgressPathCandidate, ParentProxyConfig } from './egressPaths'

type PlaywrightProxyConfig = {
  server: string
  username?: string
  password?: string
}

type UpstreamProxyTarget = {
  type: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
}

type BridgeEntry = {
  key: string
  server: http.Server
  port: number
  upstream: UpstreamProxyTarget
  egressPathType: EgressPathType
}

type TargetRequestInfo = {
  protocol: 'http:' | 'https:'
  host: string
  hostHeader: string
  port: number
  path: string
}

const bridgeCache = new Map<string, Promise<BridgeEntry>>()

function buildBridgeKey(proxy: ProxyRecord, egressPath?: EgressPathCandidate): string {
  return `${proxy.type}://${proxy.host}:${proxy.port}|${proxy.username || ''}|${proxy.password || ''}|${egressPath?.type || 'direct'}|${egressPath?.parentProxy?.rawUrl || ''}`
}

function toUpstreamProxyTarget(proxy: ProxyRecord): UpstreamProxyTarget {
  return {
    type: proxy.type,
    host: proxy.host,
    port: Number(proxy.port),
    username: proxy.username || undefined,
    password: proxy.password || undefined,
  }
}

function parentProxyToUpstreamTarget(parentProxy: ParentProxyConfig): UpstreamProxyTarget {
  return {
    type: parentProxy.protocol,
    host: parentProxy.host,
    port: parentProxy.port,
    username: parentProxy.username,
    password: parentProxy.password,
  }
}

async function connectTcp(host: string, port: number): Promise<net.Socket> {
  return await new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    const onError = (error: Error) => {
      socket.removeListener('connect', onConnect)
      reject(error)
    }
    const onConnect = () => {
      socket.removeListener('error', onError)
      resolve(socket)
    }
    socket.once('connect', onConnect)
    socket.once('error', onError)
  })
}

async function readUntilHeaderEnd(socket: net.Socket | tls.TLSSocket): Promise<Buffer> {
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
      reject(new Error('Socket ended before response header completed'))
    }

    const onData = (chunk: Buffer) => {
      chunks.push(chunk)
      total += chunk.length
      const merged = Buffer.concat(chunks, total)
      const index = merged.indexOf('\r\n\r\n')
      if (index === -1) {
        return
      }
      cleanup()
      resolve(merged)
    }

    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('end', onEnd)
  })
}

function parseHttpStatusCode(buffer: Buffer): number {
  const firstLine = buffer.toString('utf8').split('\r\n')[0] || ''
  return Number(firstLine.split(/\s+/)[1] || 0)
}

function buildBasicAuthHeader(username?: string, password?: string): string | null {
  if (!username) {
    return null
  }
  const raw = `${username}:${password || ''}`
  return `Basic ${Buffer.from(raw).toString('base64')}`
}

async function connectViaHttpFamilyProxy(
  upstream: UpstreamProxyTarget,
  targetHost: string,
  targetPort: number,
  socketFactory: (host: string, port: number) => Promise<net.Socket | tls.TLSSocket> = connectTcp,
): Promise<net.Socket | tls.TLSSocket> {
  const tcp = await socketFactory(upstream.host, upstream.port)
  const socket =
    upstream.type === 'https'
      ? await wrapTlsTunnel(tcp, upstream.host)
      : tcp
  const auth = buildBasicAuthHeader(upstream.username, upstream.password)
  const request =
    `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
    `Host: ${targetHost}:${targetPort}\r\n` +
    `${auth ? `Proxy-Authorization: ${auth}\r\n` : ''}` +
    'Proxy-Connection: Keep-Alive\r\n\r\n'

  socket.write(request)
  const responseHead = await readUntilHeaderEnd(socket)
  const statusCode = parseHttpStatusCode(responseHead)
  if (statusCode !== 200) {
    socket.destroy()
    throw new Error(
      `HTTP/HTTPS upstream proxy CONNECT failed with status ${statusCode || 'unknown'}`,
    )
  }

  const index = responseHead.indexOf('\r\n\r\n')
  const rest = index >= 0 ? responseHead.subarray(index + 4) : Buffer.alloc(0)
  if (rest.length > 0) {
    socket.unshift(rest)
  }
  return socket
}

function encodeSocks5Address(host: string): Buffer {
  if (net.isIPv4(host)) {
    return Buffer.concat([
      Buffer.from([0x01]),
      Buffer.from(host.split('.').map((part) => Number(part))),
    ])
  }

  const hostBuffer = Buffer.from(host, 'utf8')
  if (hostBuffer.length > 255) {
    throw new Error('SOCKS5 host is too long')
  }
  return Buffer.concat([Buffer.from([0x03, hostBuffer.length]), hostBuffer])
}

async function readExact(socket: net.Socket, size: number): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    let total = 0
    const chunks: Buffer[] = []

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
      reject(new Error('Socket ended before enough bytes were received'))
    }

    const onData = (chunk: Buffer) => {
      chunks.push(chunk)
      total += chunk.length
      const merged = Buffer.concat(chunks, total)
      if (merged.length < size) {
        return
      }

      cleanup()
      const head = merged.subarray(0, size)
      const rest = merged.subarray(size)
      if (rest.length > 0) {
        socket.unshift(rest)
      }
      resolve(head)
    }

    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('end', onEnd)
  })
}

function describeSocks5ReplyCode(code: number): string {
  const descriptions: Record<number, string> = {
    0x01: 'general SOCKS server failure',
    0x02: 'connection not allowed by ruleset',
    0x03: 'network unreachable',
    0x04: 'host unreachable',
    0x05: 'connection refused',
    0x06: 'TTL expired',
    0x07: 'command not supported',
    0x08: 'address type not supported',
  }
  return descriptions[code] || 'unknown error'
}

async function performSocks5Handshake(
  socket: net.Socket,
  upstream: UpstreamProxyTarget,
): Promise<void> {
  const supportsAuth = Boolean(upstream.username)
  const methods = supportsAuth ? [0x00, 0x02] : [0x00]
  socket.write(Buffer.from([0x05, methods.length, ...methods]))

  const methodReply = await readExact(socket, 2)
  if (methodReply[0] !== 0x05) {
    throw new Error('SOCKS5 handshake failed: invalid version in method reply')
  }
  if (methodReply[1] === 0xff) {
    throw new Error('SOCKS5 handshake failed: upstream proxy rejected all auth methods')
  }

  if (methodReply[1] === 0x02) {
    const username = Buffer.from(upstream.username || '', 'utf8')
    const password = Buffer.from(upstream.password || '', 'utf8')
    if (username.length > 255 || password.length > 255) {
      throw new Error('SOCKS5 authentication failed: username or password too long')
    }

    socket.write(
      Buffer.concat([
        Buffer.from([0x01, username.length]),
        username,
        Buffer.from([password.length]),
        password,
      ]),
    )

    const authReply = await readExact(socket, 2)
    if (authReply[0] !== 0x01) {
      throw new Error('SOCKS5 authentication failed: invalid auth reply version')
    }
    if (authReply[1] !== 0x00) {
      throw new Error('SOCKS5 authentication failed: username/password rejected')
    }
    return
  }

  if (methodReply[1] !== 0x00) {
    throw new Error(
      `SOCKS5 handshake failed: unsupported auth method selected ${methodReply[1]}`,
    )
  }
}

async function connectViaSocks5Proxy(
  upstream: UpstreamProxyTarget,
  targetHost: string,
  targetPort: number,
  socketFactory: (host: string, port: number) => Promise<net.Socket> = connectTcp,
): Promise<net.Socket> {
  const socket = await socketFactory(upstream.host, upstream.port)
  await performSocks5Handshake(socket, upstream)

  const address = encodeSocks5Address(targetHost)
  const port = Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff])
  const request = Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), address, port])
  socket.write(request)

  const head = await readExact(socket, 4)
  if (head[0] !== 0x05) {
    socket.destroy()
    throw new Error('SOCKS5 CONNECT failed: invalid version in connect reply')
  }
  if (head[1] !== 0x00) {
    socket.destroy()
    throw new Error(
      `SOCKS5 CONNECT failed with reply code ${head[1]} (${describeSocks5ReplyCode(head[1])})`,
    )
  }

  const atyp = head[3]
  if (atyp === 0x01) {
    await readExact(socket, 4 + 2)
  } else if (atyp === 0x03) {
    const length = await readExact(socket, 1)
    await readExact(socket, length[0] + 2)
  } else if (atyp === 0x04) {
    await readExact(socket, 16 + 2)
  } else {
    socket.destroy()
    throw new Error(`SOCKS5 CONNECT failed: unknown address type ${atyp}`)
  }

  return socket
}

async function openUpstreamTunnel(
  upstream: UpstreamProxyTarget,
  targetHost: string,
  targetPort: number,
  socketFactory?: (host: string, port: number) => Promise<net.Socket | tls.TLSSocket>,
): Promise<net.Socket | tls.TLSSocket> {
  if (upstream.type === 'socks5') {
    const connectSocket =
      socketFactory as ((host: string, port: number) => Promise<net.Socket>) | undefined
    return await connectViaSocks5Proxy(
      upstream,
      targetHost,
      targetPort,
      connectSocket,
    )
  }
  return await connectViaHttpFamilyProxy(upstream, targetHost, targetPort, socketFactory)
}

async function connectTcpViaEgress(
  host: string,
  port: number,
  egressPath?: EgressPathCandidate,
): Promise<net.Socket | tls.TLSSocket> {
  if (!egressPath || egressPath.type === 'direct' || !egressPath.parentProxy) {
    return await connectTcp(host, port)
  }
  const parentProxy = parentProxyToUpstreamTarget(egressPath.parentProxy)
  return await openUpstreamTunnel(parentProxy, host, port)
}

function parseTargetRequestInfo(rawUrl: string, hostHeader?: string): TargetRequestInfo {
  const normalizedUrl =
    /^[a-z]+:\/\//i.test(rawUrl)
      ? rawUrl
      : `http://${hostHeader || '127.0.0.1'}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`
  const parsed = new URL(normalizedUrl)
  const protocol = parsed.protocol === 'https:' ? 'https:' : 'http:'
  const port = Number(parsed.port || (protocol === 'https:' ? 443 : 80))

  return {
    protocol,
    host: parsed.hostname,
    hostHeader: parsed.host,
    port,
    path: `${parsed.pathname || '/'}${parsed.search || ''}`,
  }
}

function pipeBidirectional(left: Duplex, right: Duplex): void {
  left.pipe(right)
  right.pipe(left)
}

function wrapTlsTunnel(
  socket: net.Socket | tls.TLSSocket,
  host: string,
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({
      socket,
      servername: host,
    })
    const onError = (error: Error) => {
      secure.removeListener('secureConnect', onSecureConnect)
      reject(error)
    }
    const onSecureConnect = () => {
      secure.removeListener('error', onError)
      resolve(secure)
    }
    secure.once('secureConnect', onSecureConnect)
    secure.once('error', onError)
  })
}

async function handleConnectRequest(
  clientSocket: Duplex,
  head: Buffer,
  requestUrl: string,
  upstream: UpstreamProxyTarget,
  egressPath?: EgressPathCandidate,
): Promise<void> {
  let upstreamSocket: net.Socket | tls.TLSSocket | null = null
  try {
    const separatorIndex = requestUrl.lastIndexOf(':')
    const targetHost = separatorIndex === -1 ? '' : requestUrl.slice(0, separatorIndex)
    const targetPort = Number(separatorIndex === -1 ? '' : requestUrl.slice(separatorIndex + 1))
    if (!targetHost || !Number.isFinite(targetPort) || targetPort <= 0) {
      clientSocket.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n')
      return
    }

    upstreamSocket = await openUpstreamTunnel(
      upstream,
      targetHost,
      targetPort,
      (host, port) => connectTcpViaEgress(host, port, egressPath),
    )
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head.length > 0) {
      upstreamSocket.write(head)
    }
    pipeBidirectional(clientSocket, upstreamSocket)
  } catch {
    upstreamSocket?.destroy()
    clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n')
  }
}

async function handleHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  upstream: UpstreamProxyTarget,
  egressPath?: EgressPathCandidate,
): Promise<void> {
  let upstreamSocket: net.Socket | tls.TLSSocket | null = null
  let proxyRequest: http.ClientRequest | null = null

  try {
    const target = parseTargetRequestInfo(req.url || '/', req.headers.host)
    upstreamSocket = await openUpstreamTunnel(
      upstream,
      target.host,
      target.port,
      (host, port) => connectTcpViaEgress(host, port, egressPath),
    )
    const transport = target.protocol === 'https:' ? https : http
    const connection =
      target.protocol === 'https:'
        ? await wrapTlsTunnel(upstreamSocket, target.host)
        : upstreamSocket

    const headers: http.OutgoingHttpHeaders = { ...req.headers }
    delete headers['proxy-connection']
    delete headers['proxy-authorization']
    headers.host = target.hostHeader

    proxyRequest = transport.request({
      host: target.host,
      port: target.port,
      method: req.method || 'GET',
      path: target.path,
      headers,
      agent: false,
      createConnection: () => connection,
    })

    proxyRequest.once('response', (proxyResponse) => {
      res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers)
      proxyResponse.pipe(res)
    })

    proxyRequest.once('error', () => {
      if (!res.headersSent) {
        res.writeHead(502).end()
      } else {
        res.end()
      }
    })

    req.pipe(proxyRequest)
  } catch {
    proxyRequest?.destroy()
    upstreamSocket?.destroy()
    if (!res.headersSent) {
      res.writeHead(502).end()
    } else {
      res.end()
    }
  }
}

async function createBridge(
  proxy: ProxyRecord,
  egressPath?: EgressPathCandidate,
): Promise<BridgeEntry> {
  const upstream = toUpstreamProxyTarget(proxy)
  const server = http.createServer((req, res) => {
    void handleHttpRequest(req, res, upstream, egressPath)
  })

  server.on('connect', (req, clientSocket, head) => {
    void handleConnectRequest(clientSocket, head, req.url || '', upstream, egressPath)
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(0, '127.0.0.1')
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to determine local proxy bridge port')
  }

  return {
    key: buildBridgeKey(proxy, egressPath),
    server,
    port: address.port,
    upstream,
    egressPathType: egressPath?.type || 'direct',
  }
}

export async function resolveLaunchProxy(
  proxy: ProxyRecord | null,
  options: { egressPath?: EgressPathCandidate } = {},
): Promise<{
  config: PlaywrightProxyConfig | null
  bridgeActive: boolean
  detail: string
  egressPathType: EgressPathType
}> {
  if (!proxy) {
    return {
      config: null,
      bridgeActive: false,
      detail: '',
      egressPathType: options.egressPath?.type || 'direct',
    }
  }

  const key = buildBridgeKey(proxy, options.egressPath)
  if (!bridgeCache.has(key)) {
    bridgeCache.set(
      key,
      createBridge(proxy, options.egressPath).catch((error) => {
        bridgeCache.delete(key)
        throw error
      }),
    )
  }

  const bridge = await bridgeCache.get(key)!
  return {
    config: {
      server: `http://127.0.0.1:${bridge.port}`,
    },
    bridgeActive: true,
    detail:
      `via local proxy bridge http://127.0.0.1:${bridge.port} -> ${proxy.type}://${proxy.host}:${proxy.port}` +
      (options.egressPath?.parentProxy
        ? ` via ${options.egressPath.type} parent proxy ${options.egressPath.parentProxy.protocol}://${options.egressPath.parentProxy.host}:${options.egressPath.parentProxy.port}`
        : ''),
    egressPathType: bridge.egressPathType,
  }
}
