import { chromium } from 'playwright'
import type { ProfileRecord, ProxyRecord } from '../../src/shared/types'
import { proxyToPlaywrightConfig, resolveChromiumExecutable } from './runtime'

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
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: resolveChromiumExecutable(),
      proxy: proxyToPlaywrightConfig(proxy) ?? undefined,
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
    try {
      if (browser) {
        await browser.close().catch(() => undefined)
        browser = null
      }
      browser = await chromium.launch({
        headless: true,
        executablePath: resolveChromiumExecutable(),
        proxy: proxyToPlaywrightConfig(proxy) ?? undefined,
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
            ? `Proxy connectivity verified, but IP metadata lookup failed: ${error.message}`
            : 'Proxy connectivity verified, but IP metadata lookup failed',
        source: 'proxy',
      }
    } catch {
      throw error
    }
  } finally {
    await browser?.close().catch(() => undefined)
  }
}

export async function checkProfileEgress(
  profile: ProfileRecord,
  proxy: ProxyRecord | null,
): Promise<ProxyCheckResult> {
  try {
    return proxy ? await lookupWithProxy(proxy) : await lookupWithoutProxy()
  } catch (error) {
    return {
      ok: false,
      ip: '',
      country: '',
      region: '',
      city: '',
      timezone: '',
      languageHint: profile.fingerprintConfig.language,
      geolocation: '',
      message: error instanceof Error ? error.message : 'Unknown proxy check error',
      source: proxy ? 'proxy' : 'local',
    }
  }
}
