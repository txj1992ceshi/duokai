import http from 'node:http'
import { lookup } from 'node:dns/promises'
import net from 'node:net'
import tls from 'node:tls'
import type {
  EgressPathType,
  ProfileRecord,
  ProxyRecord,
  SettingsPayload,
} from '../../src/shared/types'
import {
  listEgressPathCandidates,
  type EgressPathCandidate,
} from './egressPaths'
import { acquireLaunchProxy, type LaunchProxyLease } from './proxyBridge'
import {
  classifyProxyFailure,
  createProxyConnectHttpError,
  ProxyConnectError,
} from './proxyFailureClassification'

const LOOKUP_URL = 'https://ipwho.is/?output=json'

export type NetworkProbeStage =
  | 'dns_resolve'
  | 'tcp_connect'
  | 'proxy_bridge'
  | 'proxy_tunnel'
  | 'target_probe'

export interface ProxyCheckDiagnostic {
  pathType: EgressPathType
  stage: NetworkProbeStage
  success: boolean
  host: string
  port: number
  resolvedIps: string[]
  latencyMs: number
  errorCode: string
  errorMessage: string
  httpStatus: number | null
  retryable: boolean
}

export interface ProxyCheckResult {
  ok: boolean
  ip: string
  country: string
  region: string
  city: string
  timezone: string
  languageHint: string
  geolocation: string
  message: string
  source: 'proxy' | 'local'
  egressPathType: EgressPathType
  diagnostics: ProxyCheckDiagnostic[]
  failureCode?: string
  failureStage?: NetworkProbeStage
  failureHttpStatus?: number | null
  failureRetryable?: boolean
}

interface LookupPayload {
  ip: string
  country: string
  region: string
  city: string
  timezone: string
  countryCode: string
  latitude: number | null
  longitude: number | null
}

function languageFromCountry(countryCode: string): string {
  const mapping: Record<string, string> = {
    US: 'en-US',
    GB: 'en-GB',
    AU: 'en-AU',
    CA: 'en-CA',
    JP: 'ja-JP',
    KR: 'ko-KR',
    CN: 'zh-CN',
    TW: 'zh-TW',
    HK: 'zh-TW',
    SG: 'en-SG',
    DE: 'de-DE',
    FR: 'fr-FR',
    ES: 'es-ES',
    IT: 'it-IT',
    BR: 'pt-BR',
    MX: 'es-MX',
  }
  return mapping[countryCode.toUpperCase()] ?? 'en-US'
}

function buildGeolocationValue(latitude: number | null, longitude: number | null): string {
  if (latitude === null || longitude === null) {
    return ''
  }
  return `${latitude}, ${longitude}`
}

function parseLookupPayload(input: unknown): LookupPayload | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const data = input as Record<string, unknown>
  const timezone =
    typeof data.timezone === 'string'
      ? data.timezone
      : typeof data.timezone === 'object' &&
          data.timezone &&
          typeof (data.timezone as Record<string, unknown>).id === 'string'
        ? ((data.timezone as Record<string, unknown>).id as string)
        : null
  if (typeof timezone !== 'string' || timezone.trim().length === 0) {
    return null
  }
  return {
    ip: typeof data.ip === 'string' ? data.ip : '',
    timezone: timezone.trim(),
    countryCode: typeof data.country_code === 'string' ? data.country_code : '',
    country: typeof data.country === 'string' ? data.country : '',
    region: typeof data.region === 'string' ? data.region : '',
    city: typeof data.city === 'string' ? data.city : '',
    latitude: typeof data.latitude === 'number' ? data.latitude : null,
    longitude: typeof data.longitude === 'number' ? data.longitude : null,
  }
}

function createDiagnostic(
  pathType: EgressPathType,
  stage: NetworkProbeStage,
  success: boolean,
  host: string,
  port: number,
  options: {
    resolvedIps?: string[]
    latencyMs?: number
    errorCode?: string
    errorMessage?: string
    httpStatus?: number | null
    retryable?: boolean
  } = {},
): ProxyCheckDiagnostic {
  return {
    pathType,
    stage,
    success,
    host,
    port,
    resolvedIps: options.resolvedIps ?? [],
    latencyMs: options.latencyMs ?? 0,
    errorCode: options.errorCode ?? '',
    errorMessage: options.errorMessage ?? '',
    httpStatus: options.httpStatus ?? null,
    retryable: options.retryable ?? false,
  }
}

function classifyErrorDiagnostic(error: unknown): {
  errorCode: string
  httpStatus: number | null
  retryable: boolean
} {
  const classification = classifyProxyFailure(error)
  return {
    errorCode: classification.code,
    httpStatus: classification.httpStatus,
    retryable: classification.retryable,
  }
}

async function lookupWithoutProxy(): Promise<ProxyCheckResult> {
  const response = await fetch(LOOKUP_URL)
  if (!response.ok) {
    throw new Error(`Lookup failed with status ${response.status}`)
  }
  const payload = parseLookupPayload(await response.json())
  if (!payload) {
    throw new Error('Lookup payload missing timezone data')
  }
  return {
    ok: true,
    ip: payload.ip,
    country: payload.country,
    region: payload.region,
    city: payload.city,
    timezone: payload.timezone,
    languageHint: languageFromCountry(payload.countryCode),
    geolocation: buildGeolocationValue(payload.latitude, payload.longitude),
    message: 'Local egress resolved successfully',
    source: 'local',
    egressPathType: 'direct',
    diagnostics: [],
  }
}

async function connectTcp(host: string, port: number, timeoutMs = 5_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    const cleanup = () => {
      socket.removeAllListeners()
      socket.destroy()
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      cleanup()
      resolve()
    })
    socket.once('timeout', () => {
      cleanup()
      reject(new Error('timeout'))
    })
    socket.once('error', (error) => {
      cleanup()
      reject(error)
    })
  })
}


function decodeChunkedBody(body: Buffer): Buffer {
  const chunks: Buffer[] = []
  let cursor = 0
  while (cursor < body.length) {
    const lineEnd = body.indexOf('\r\n', cursor)
    if (lineEnd < 0) {
      throw new Error('Invalid chunked proxy response')
    }
    const sizeText = body.subarray(cursor, lineEnd).toString('ascii').split(';', 1)[0].trim()
    const size = Number.parseInt(sizeText, 16)
    if (!Number.isFinite(size)) {
      throw new Error('Invalid chunk size in proxy response')
    }
    cursor = lineEnd + 2
    if (size === 0) {
      return Buffer.concat(chunks)
    }
    const chunkEnd = cursor + size
    if (chunkEnd + 2 > body.length) {
      throw new Error('Truncated chunked proxy response')
    }
    chunks.push(body.subarray(cursor, chunkEnd))
    cursor = chunkEnd + 2
  }
  throw new Error('Chunked proxy response did not terminate')
}

function parseRawHttpResponse(raw: Buffer): string {
  const separator = raw.indexOf('\r\n\r\n')
  if (separator < 0) {
    throw new Error('Proxy target response headers were incomplete')
  }
  const headerText = raw.subarray(0, separator).toString('latin1')
  const headerLines = headerText.split('\r\n')
  const statusMatch = headerLines[0]?.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/i)
  const statusCode = statusMatch ? Number(statusMatch[1]) : 0
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Proxy target probe failed with status ${statusCode || 'unknown'}`)
  }
  const headers = new Map<string, string>()
  for (const line of headerLines.slice(1)) {
    const colon = line.indexOf(':')
    if (colon > 0) {
      headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim())
    }
  }
  let body = raw.subarray(separator + 4)
  if (/chunked/i.test(headers.get('transfer-encoding') || '')) {
    body = decodeChunkedBody(body)
  } else {
    const contentLength = Number(headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength >= 0) {
      body = body.subarray(0, contentLength)
    }
  }
  return body.toString('utf8')
}

async function openHttpProxyTunnel(
  proxyServer: URL,
  target: URL,
  timeoutMs: number,
): Promise<net.Socket> {
  const targetPort = Number(target.port || 443)
  const targetAuthority = `${target.hostname}:${targetPort}`
  return await new Promise<net.Socket>((resolve, reject) => {
    const request = http.request({
      hostname: proxyServer.hostname,
      port: Number(proxyServer.port || 80),
      method: 'CONNECT',
      path: targetAuthority,
      headers: {
        Host: targetAuthority,
        'Proxy-Connection': 'keep-alive',
      },
    })
    request.setTimeout(timeoutMs, () => {
      request.destroy(
        new ProxyConnectError('Proxy CONNECT timed out', {
          code: 'proxy_connect_timeout',
          httpStatus: null,
          retryable: true,
        }),
      )
    })
    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy()
        reject(createProxyConnectHttpError(response.statusCode || 0))
        return
      }
      const tunnel = socket as net.Socket
      if (head.length > 0) {
        tunnel.unshift(head)
      }
      resolve(tunnel)
    })
    request.once('response', (response) => {
      response.resume()
      reject(createProxyConnectHttpError(response.statusCode || 0, 'Proxy CONNECT returned HTTP'))
    })
    request.once('error', reject)
    request.end()
  })
}

export async function fetchJsonThroughHttpProxy(
  proxyServerValue: string,
  targetUrlValue = LOOKUP_URL,
  options: { timeoutMs?: number; onTunnelReady?: () => void } = {},
): Promise<unknown> {
  const proxyServer = new URL(proxyServerValue)
  const target = new URL(targetUrlValue)
  if (proxyServer.protocol !== 'http:') {
    throw new Error(`Unsupported local proxy bridge protocol: ${proxyServer.protocol}`)
  }
  if (target.protocol !== 'https:') {
    throw new Error(`Unsupported proxy target protocol: ${target.protocol}`)
  }
  const timeoutMs = options.timeoutMs ?? 20_000
  const tunnel = await openHttpProxyTunnel(proxyServer, target, timeoutMs)
  let secureSocket: tls.TLSSocket | null = null
  try {
    secureSocket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const socket = tls.connect({
        socket: tunnel,
        servername: target.hostname,
      })
      socket.setTimeout(timeoutMs, () => socket.destroy(new Error('Proxy TLS handshake timed out')))
      socket.once('secureConnect', () => resolve(socket))
      socket.once('error', reject)
    })
    options.onTunnelReady?.()
    const hostHeader = target.port ? `${target.hostname}:${target.port}` : target.hostname
    const requestPath = `${target.pathname}${target.search}` || '/'
    const requestText =
      `GET ${requestPath} HTTP/1.1\r\n` +
      `Host: ${hostHeader}\r\n` +
      'Accept: application/json\r\n' +
      'User-Agent: Duokai-CloakBrowser-Proxy-Preflight/1.0\r\n' +
      'Connection: close\r\n\r\n'
    const raw = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      secureSocket?.setTimeout(timeoutMs, () =>
        secureSocket?.destroy(new Error('Proxy target probe timed out')),
      )
      secureSocket?.on('data', (chunk: Buffer) => chunks.push(chunk))
      secureSocket?.once('end', () => resolve(Buffer.concat(chunks)))
      secureSocket?.once('error', reject)
      secureSocket?.write(requestText)
    })
    return JSON.parse(parseRawHttpResponse(raw))
  } finally {
    secureSocket?.destroy()
    tunnel.destroy()
  }
}

async function runDirectTcpDiagnostic(
  proxy: ProxyRecord,
  pathType: EgressPathType,
): Promise<ProxyCheckDiagnostic[]> {
  const startedAt = Date.now()
  let resolvedIps: string[] = []
  try {
    const entries = await lookup(proxy.host, { all: true, verbatim: false })
    resolvedIps = Array.from(new Set(entries.map((entry) => entry.address).filter(Boolean)))
    return [
      createDiagnostic(pathType, 'dns_resolve', true, proxy.host, Number(proxy.port), {
        resolvedIps,
        latencyMs: Date.now() - startedAt,
      }),
    ]
  } catch (error) {
    return [
      createDiagnostic(pathType, 'dns_resolve', false, proxy.host, Number(proxy.port), {
        latencyMs: Date.now() - startedAt,
        ...classifyErrorDiagnostic(error),
        errorMessage: error instanceof Error ? error.message : 'DNS lookup failed',
      }),
    ]
  }
}

async function runProxyLookupAttempt(
  proxy: ProxyRecord,
  egressPath: EgressPathCandidate,
): Promise<ProxyCheckResult> {
  const diagnostics: ProxyCheckDiagnostic[] = []
  const tcpDiagnostics =
    egressPath.type === 'direct'
      ? await runDirectTcpDiagnostic(proxy, egressPath.type)
      : []
  diagnostics.push(...tcpDiagnostics)

  if (egressPath.type === 'direct') {
    const resolved = tcpDiagnostics.find((item) => item.stage === 'dns_resolve' && item.success)
    if (resolved?.resolvedIps.length) {
      const tcpStartedAt = Date.now()
      let connected = false
      for (const ip of resolved.resolvedIps.slice(0, 3)) {
        try {
          await connectTcp(ip, Number(proxy.port))
          connected = true
          diagnostics.push(
            createDiagnostic(egressPath.type, 'tcp_connect', true, proxy.host, Number(proxy.port), {
              resolvedIps: [ip],
              latencyMs: Date.now() - tcpStartedAt,
            }),
          )
          break
        } catch (error) {
          diagnostics.push(
            createDiagnostic(egressPath.type, 'tcp_connect', false, proxy.host, Number(proxy.port), {
              resolvedIps: [ip],
              latencyMs: Date.now() - tcpStartedAt,
              ...classifyErrorDiagnostic(error),
              errorMessage: error instanceof Error ? error.message : 'TCP connect failed',
            }),
          )
        }
      }
      if (!connected) {
        throw Object.assign(
          new Error(`Direct TCP connect failed for ${proxy.host}:${proxy.port} across resolved IPs`),
          {
            diagnostics,
            egressPathType: egressPath.type,
          },
        )
      }
    }
  }

  const bridgeStartedAt = Date.now()
  let launchProxy: LaunchProxyLease | null = null
  try {
    launchProxy = await acquireLaunchProxy(proxy, { egressPath })
    diagnostics.push(
      createDiagnostic(egressPath.type, 'proxy_bridge', true, proxy.host, Number(proxy.port), {
        latencyMs: Date.now() - bridgeStartedAt,
      }),
    )
  } catch (error) {
    diagnostics.push(
      createDiagnostic(egressPath.type, 'proxy_bridge', false, proxy.host, Number(proxy.port), {
        latencyMs: Date.now() - bridgeStartedAt,
        ...classifyErrorDiagnostic(error),
        errorMessage: error instanceof Error ? error.message : 'Failed to create local proxy bridge',
      }),
    )
    throw error
  }

  let tunnelReadyAt = 0
  const probeStartedAt = Date.now()
  try {
    const proxyServer = launchProxy.config?.server
    if (!proxyServer) {
      throw new Error('Local proxy bridge did not provide an HTTP endpoint')
    }
    const payload = parseLookupPayload(
      await fetchJsonThroughHttpProxy(proxyServer, LOOKUP_URL, {
        timeoutMs: 20_000,
        onTunnelReady: () => {
          tunnelReadyAt = Date.now()
          diagnostics.push(
            createDiagnostic(egressPath.type, 'proxy_tunnel', true, proxy.host, Number(proxy.port), {
              latencyMs: tunnelReadyAt - probeStartedAt,
            }),
          )
        },
      }),
    )
    if (!payload) {
      throw new Error('Lookup payload missing timezone data')
    }
    diagnostics.push(
      createDiagnostic(egressPath.type, 'target_probe', true, proxy.host, Number(proxy.port), {
        latencyMs: Date.now() - (tunnelReadyAt || probeStartedAt),
      }),
    )

    return {
      ok: true,
      ip: payload.ip,
      country: payload.country,
      region: payload.region,
      city: payload.city,
      timezone: payload.timezone,
      languageHint: languageFromCountry(payload.countryCode),
      geolocation: buildGeolocationValue(payload.latitude, payload.longitude),
      message: `Proxy egress resolved successfully via ${egressPath.type}`,
      source: 'proxy',
      egressPathType: egressPath.type,
      diagnostics,
    }
  } catch (error) {
    const stage: NetworkProbeStage = tunnelReadyAt ? 'target_probe' : 'proxy_tunnel'
    diagnostics.push(
      createDiagnostic(egressPath.type, stage, false, proxy.host, Number(proxy.port), {
        latencyMs: Date.now() - (tunnelReadyAt || probeStartedAt),
        ...classifyErrorDiagnostic(error),
        errorMessage: error instanceof Error ? error.message : 'Proxy probe failed',
      }),
    )
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      diagnostics,
      egressPathType: egressPath.type,
      bridgeDetail: launchProxy.detail || '',
    })
  } finally {
    await launchProxy.release().catch(() => undefined)
  }
}

function buildAggregatedFailureMessage(
  proxy: ProxyRecord,
  failures: Array<{
    path: EgressPathCandidate
    error: unknown
    diagnostics: ProxyCheckDiagnostic[]
  }>,
): string {
  const failureSummary = failures
    .map(({ path, error, diagnostics }) => {
      const lastDiagnostic = [...diagnostics].reverse().find((entry) => !entry.success)
      const message = error instanceof Error ? error.message : 'Unknown proxy check error'
      if (!lastDiagnostic) {
        return `${path.type}: ${message}`
      }
      return `${path.type}(${lastDiagnostic.stage}/${lastDiagnostic.errorCode || 'error'}): ${lastDiagnostic.errorMessage || message}`
    })
    .join('; ')

  return `All egress paths failed for ${proxy.type}://${proxy.host}:${proxy.port}. ${failureSummary}`
}

async function checkProxyAcrossEgressPaths(
  proxy: ProxyRecord,
  settings: SettingsPayload = {},
): Promise<ProxyCheckResult> {
  const candidates = listEgressPathCandidates(settings)
  const failures: Array<{
    path: EgressPathCandidate
    error: unknown
    diagnostics: ProxyCheckDiagnostic[]
  }> = []

  for (const candidate of candidates) {
    try {
      return await runProxyLookupAttempt(proxy, candidate)
    } catch (error) {
      failures.push({
        path: candidate,
        error,
        diagnostics:
          error && typeof error === 'object' && Array.isArray((error as { diagnostics?: unknown }).diagnostics)
            ? ((error as { diagnostics: ProxyCheckDiagnostic[] }).diagnostics)
            : [],
      })
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      ip: '',
      country: '',
      region: '',
      city: '',
      timezone: '',
      languageHint: '',
      geolocation: '',
      message: 'No eligible egress path candidates are configured for proxy preflight.',
      source: 'proxy',
      egressPathType: 'direct',
      diagnostics: [],
    }
  }

  const diagnostics = failures.flatMap((failure) => failure.diagnostics)
  const terminalFailure = [...diagnostics].reverse().find((entry) => !entry.success)
  return {
    ok: false,
    ip: '',
    country: '',
    region: '',
    city: '',
    timezone: '',
    languageHint: '',
    geolocation: '',
    message: buildAggregatedFailureMessage(proxy, failures),
    source: 'proxy',
    egressPathType: failures[0]?.path.type || 'direct',
    diagnostics,
    failureCode: terminalFailure?.errorCode || 'proxy_unknown',
    failureStage: terminalFailure?.stage,
    failureHttpStatus: terminalFailure?.httpStatus ?? null,
    failureRetryable: terminalFailure?.retryable ?? false,
  }
}

export async function checkProfileEgress(
  profile: ProfileRecord,
  proxy: ProxyRecord | null,
  settings: SettingsPayload = {},
): Promise<ProxyCheckResult> {
  if (!proxy) {
    return await lookupWithoutProxy()
  }
  const result = await checkProxyAcrossEgressPaths(proxy, settings)
  if (result.languageHint) {
    return result
  }
  return {
    ...result,
    languageHint: profile.fingerprintConfig.language,
  }
}

export async function checkStandaloneProxyEgress(
  proxy: ProxyRecord,
  settings: SettingsPayload = {},
): Promise<ProxyCheckResult> {
  return await checkProxyAcrossEgressPaths(proxy, settings)
}
