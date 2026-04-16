import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { chromium } from 'playwright'
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
import { resolveLaunchProxy } from './proxyBridge'
import {
  applyProxyCompatibilityArgs,
  buildChromiumLaunchEnv,
  resolveChromiumExecutable,
} from './runtime'

const LOOKUP_URL = 'https://ipwho.is/?output=json'

export type NetworkProbeStage =
  | 'dns_resolve'
  | 'tcp_connect'
  | 'proxy_bridge'
  | 'browser_launch'
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
  }
}

function classifyErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/407|authentication/i.test(message)) return 'auth_failed'
  if (/timeout|timed out/i.test(message)) return 'timeout'
  if (/ECONNREFUSED|connection refused/i.test(message)) return 'connection_refused'
  if (/ENOTFOUND|dns/i.test(message)) return 'dns_failed'
  if (/certificate|tls|ssl/i.test(message)) return 'tls_failed'
  return 'unknown'
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
        errorCode: classifyErrorCode(error),
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
              errorCode: classifyErrorCode(error),
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

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
  const bridgeStartedAt = Date.now()
  let launchProxy: Awaited<ReturnType<typeof resolveLaunchProxy>> | null = null
  try {
    launchProxy = await resolveLaunchProxy(proxy, { egressPath })
    diagnostics.push(
      createDiagnostic(egressPath.type, 'proxy_bridge', true, proxy.host, Number(proxy.port), {
        latencyMs: Date.now() - bridgeStartedAt,
      }),
    )
  } catch (error) {
    diagnostics.push(
      createDiagnostic(egressPath.type, 'proxy_bridge', false, proxy.host, Number(proxy.port), {
        latencyMs: Date.now() - bridgeStartedAt,
        errorCode: classifyErrorCode(error),
        errorMessage: error instanceof Error ? error.message : 'Failed to create local proxy bridge',
      }),
    )
    throw error
  }

  try {
    const launchStartedAt = Date.now()
    browser = await chromium.launch({
      headless: true,
      executablePath: resolveChromiumExecutable(),
      proxy: launchProxy.config || undefined,
      env: buildChromiumLaunchEnv(),
      args: applyProxyCompatibilityArgs([], proxy, {
        bridgeActive: launchProxy.bridgeActive,
      }),
    })
    diagnostics.push(
      createDiagnostic(egressPath.type, 'browser_launch', true, proxy.host, Number(proxy.port), {
        latencyMs: Date.now() - launchStartedAt,
      }),
    )

    const page = await browser.newPage()
    const probeStartedAt = Date.now()
    await page.goto(LOOKUP_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    const bodyText = (await page.textContent('body'))?.trim() ?? ''
    const payload = parseLookupPayload(bodyText ? JSON.parse(bodyText) : null)
    if (!payload) {
      throw new Error('Lookup payload missing timezone data')
    }
    diagnostics.push(
      createDiagnostic(egressPath.type, 'target_probe', true, proxy.host, Number(proxy.port), {
        latencyMs: Date.now() - probeStartedAt,
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
    diagnostics.push(
      createDiagnostic(egressPath.type, 'target_probe', false, proxy.host, Number(proxy.port), {
        latencyMs: 0,
        errorCode: classifyErrorCode(error),
        errorMessage: error instanceof Error ? error.message : 'Proxy probe failed',
      }),
    )
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      diagnostics,
      egressPathType: egressPath.type,
      bridgeDetail: launchProxy?.detail || '',
    })
  } finally {
    await browser?.close().catch(() => undefined)
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
    diagnostics: failures.flatMap((failure) => failure.diagnostics),
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
