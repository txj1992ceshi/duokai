import type { ProxyRecord, WebRtcMode } from '../../src/shared/types'
import { applyWebRtcModeToLaunchArgs } from './webrtc'

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
  const runtimeArgs = applyWebRtcModeToLaunchArgs(args, webrtcMode)
  if (disableGpu) {
    runtimeArgs.push('--disable-gpu')
  }
  return Array.from(new Set(runtimeArgs))
}

export function buildProxyServer(proxy: ProxyRecord): string {
  return `${proxy.type}://${proxy.host}:${proxy.port}`
}
