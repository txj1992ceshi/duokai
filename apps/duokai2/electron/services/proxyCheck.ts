import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { chromium } from 'playwright'
import type { ProfileRecord, ProxyRecord } from '../../src/shared/types'
import { resolveLaunchProxy } from './proxyBridge'
import {
  applyProxyCompatibilityArgs,
  buildChromiumLaunchEnv,
  resolveChromiumExecutable,
} from './runtime'

const LOOKUP_URL = 'https://ipwho.is/?output=json'

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

interface ProxyEndpointDiagnostic {
  host: string
  port: number
  resolvedIps: string[]
  reachableIps: string[]
  failedIps: string[]
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
      : typeof data.timezone === 'object' && data.timezone && typeof (data.timezone as Record<string, unknown>).id === 'string'
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
  }
}

async function lookupWithProxy(proxy: ProxyRecord): Promise<ProxyCheckResult> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
  let launchProxy: Awaited<ReturnType<typeof resolveLaunchProxy>> = {
    config: null,
    bridgeActive: false,
    detail: '',
  }
  try {
    launchProxy = await resolveLaunchProxy(proxy)
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: resolveChromiumExecutable(),
        proxy: launchProxy.config || undefined,
        env: buildChromiumLaunchEnv(),
        args: applyProxyCompatibilityArgs([], proxy, { bridgeActive: launchProxy.bridgeActive }),
      })
      const page = await browser.newPage()
      await page.goto(LOOKUP_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      const bodyText = (await page.textContent('body'))?.trim() ?? ''
      const payload = parseLookupPayload(bodyText ? JSON.parse(bodyText) : null)
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
        message: 'Proxy egress resolved successfully',
        source: 'proxy',
      }
    } catch (error) {
      if (browser) {
        await browser.close().catch(() => undefined)
        browser = null
      }

      try {
        browser = await chromium.launch({
          headless: true,
          executablePath: resolveChromiumExecutable(),
          proxy: launchProxy.config || undefined,
          env: buildChromiumLaunchEnv(),
          args: applyProxyCompatibilityArgs([], proxy, { bridgeActive: launchProxy.bridgeActive }),
        })
        const page = await browser.newPage()
        await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 20_000 })
        return {
          ok: true,
          ip: '',
          country: '',
          region: '',
          city: '',
          timezone: '',
          languageHint: '',
          geolocation: '',
          message:
            error instanceof Error
              ? `Proxy connectivity verified proxyType=${proxy.type}; host=${proxy.host}; port=${proxy.port}; bridgeActive=${launchProxy.bridgeActive}; detail=${launchProxy.detail || 'none'}, but IP metadata lookup failed: ${error.message}`
              : 'Proxy connectivity verified, but IP metadata lookup failed',
          source: 'proxy',
        }
      } catch {
        throw error
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown proxy check error'
    throw new Error(
      `${errorMessage} proxyType=${proxy.type}; host=${proxy.host}; port=${proxy.port}; bridgeActive=${launchProxy.bridgeActive}; detail=${launchProxy.detail || 'none'}`,
    )
  } finally {
    await browser?.close().catch(() => undefined)
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

async function diagnoseProxyEndpoint(proxy: ProxyRecord): Promise<ProxyEndpointDiagnostic | null> {
  const port = Number(proxy.port)
  if (!Number.isFinite(port) || port <= 0) {
    return null
  }

  let resolvedIps: string[] = []
  try {
    const entries = await lookup(proxy.host, { all: true, verbatim: false })
    resolvedIps = Array.from(new Set(entries.map((entry) => entry.address).filter(Boolean)))
  } catch {
    return {
      host: proxy.host,
      port,
      resolvedIps: [],
      reachableIps: [],
      failedIps: [],
    }
  }

  const reachableIps: string[] = []
  const failedIps: string[] = []
  for (const ip of resolvedIps.slice(0, 3)) {
    try {
      await connectTcp(ip, port)
      reachableIps.push(ip)
    } catch {
      failedIps.push(ip)
    }
  }

  return {
    host: proxy.host,
    port,
    resolvedIps,
    reachableIps,
    failedIps,
  }
}

function formatProxyDiagnostic(diagnostic: ProxyEndpointDiagnostic | null): string {
  if (!diagnostic) {
    return ''
  }
  if (diagnostic.resolvedIps.length === 0) {
    return ` Proxy endpoint diagnostic: failed to resolve ${diagnostic.host}.`
  }
  if (diagnostic.reachableIps.length === 0) {
    return ` Proxy endpoint diagnostic: resolved ${diagnostic.host}:${diagnostic.port} to ${diagnostic.resolvedIps.join(', ')}, but TCP connection timed out or failed for all tested IPs.`
  }
  return ` Proxy endpoint diagnostic: resolved ${diagnostic.host}:${diagnostic.port} to ${diagnostic.resolvedIps.join(', ')}; reachable IPs: ${diagnostic.reachableIps.join(', ')}.`
}

export async function checkProfileEgress(
  profile: ProfileRecord,
  proxy: ProxyRecord | null,
): Promise<ProxyCheckResult> {
  try {
    return proxy ? await lookupWithProxy(proxy) : await lookupWithoutProxy()
  } catch (error) {
    const diagnostic = proxy ? await diagnoseProxyEndpoint(proxy).catch(() => null) : null
    return {
      ok: false,
      ip: '',
      country: '',
      region: '',
      city: '',
      timezone: '',
      languageHint: profile.fingerprintConfig.language,
      geolocation: '',
      message:
        (error instanceof Error ? error.message : 'Unknown proxy check error') +
        formatProxyDiagnostic(diagnostic),
      source: proxy ? 'proxy' : 'local',
    }
  }
}

export async function checkStandaloneProxyEgress(proxy: ProxyRecord): Promise<ProxyCheckResult> {
  try {
    return await lookupWithProxy(proxy)
  } catch (error) {
    const diagnostic = await diagnoseProxyEndpoint(proxy).catch(() => null)
    return {
      ok: false,
      ip: '',
      country: '',
      region: '',
      city: '',
      timezone: '',
      languageHint: '',
      geolocation: '',
      message:
        (error instanceof Error ? error.message : 'Unknown proxy check error') +
        formatProxyDiagnostic(diagnostic),
      source: 'proxy',
    }
  }
}
