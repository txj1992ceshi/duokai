import type { WebRtcMode } from '../../src/shared/types'

export const PROXY_AWARE_WEBRTC_POLICY = 'disable_non_proxied_udp'

const WEBRTC_FLAG_PREFIXES = [
  '--force-webrtc-ip-handling-policy=',
  '--webrtc-ip-handling-policy=',
]

export function buildWebRtcLaunchArgs(webrtcMode: WebRtcMode): string[] {
  if (webrtcMode === 'disabled') {
    return ['--disable-webrtc']
  }
  if (webrtcMode === 'proxy-aware') {
    return [`--force-webrtc-ip-handling-policy=${PROXY_AWARE_WEBRTC_POLICY}`]
  }
  return []
}

export function applyWebRtcModeToLaunchArgs(
  args: string[] = [],
  webrtcMode: WebRtcMode,
): string[] {
  const normalizedArgs = args
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(
      (item) =>
        item !== '--disable-webrtc' &&
        !WEBRTC_FLAG_PREFIXES.some((prefix) => item.startsWith(prefix)),
    )

  return Array.from(new Set([...normalizedArgs, ...buildWebRtcLaunchArgs(webrtcMode)]))
}
