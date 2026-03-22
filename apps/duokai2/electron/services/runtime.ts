import { chromium } from 'playwright'
import type { ProxyRecord, WebRtcMode } from '../../src/shared/types'

export function parseLocale(language: string): string {
  return language || 'en-US'
}

export function normalizeResolution(value: string): { width: number; height: number } {
  const [widthText, heightText] = value.split('x')
  const width = Number(widthText)
  const height = Number(heightText)
  if (!width || !height) {
    return { width: 1440, height: 900 }
  }
  return { width, height }
}

export function buildRuntimeArgs(
  webrtcMode: WebRtcMode,
  launchArgs = '',
  disableGpu = false,
): string[] {
  const args = launchArgs
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (webrtcMode === 'disabled') {
    args.push('--disable-webrtc')
  }
  if (disableGpu) {
    args.push('--disable-gpu')
  }
  return Array.from(new Set(args))
}

export function buildProxyServer(proxy: ProxyRecord): string {
  return `${proxy.type}://${proxy.host}:${proxy.port}`
}

export function proxyToPlaywrightConfig(proxy: ProxyRecord | null) {
  if (!proxy) {
    return null
  }
  return {
    server: buildProxyServer(proxy),
    username: proxy.username || undefined,
    password: proxy.password || undefined,
  }
}

export function resolveChromiumExecutable(): string | undefined {
  try {
    return chromium.executablePath()
  } catch {
    return undefined
  }
}
