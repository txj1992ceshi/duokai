import type {
  BrowserKernel,
  DeviceProfile,
  DeviceProfileSupportMatrix,
  EnvironmentPurpose,
  FingerprintConfig,
  FontMode,
  ProfileRecord,
  SimpleFingerprintMode,
} from '../../src/shared/types'

export const DEVICE_PROFILE_VERSION = 1
export const DEFAULT_ENVIRONMENT_PURPOSE: EnvironmentPurpose = 'operation'

function inferOperatingSystemFromUserAgent(userAgent: string): string {
  const value = userAgent.toLowerCase()
  if (value.includes('windows nt')) {
    return 'Windows'
  }
  if (value.includes('mac os x') || value.includes('macintosh')) {
    return 'macOS'
  }
  if (value.includes('android')) {
    return 'Android'
  }
  if (value.includes('iphone') || value.includes('ipad') || value.includes('ios')) {
    return 'iOS'
  }
  if (value.includes('linux')) {
    return 'Linux'
  }
  return ''
}

function inferBrowserVersionFromUserAgent(userAgent: string): string {
  const match = userAgent.match(/Chrome\/(\d+)/i)
  return match?.[1] || ''
}

function resolveOperatingSystem(config: FingerprintConfig): string {
  const configured = String(config.advanced.operatingSystem || '').trim()
  const inferred = inferOperatingSystemFromUserAgent(config.userAgent)
  if (!configured) {
    return inferred || 'Windows'
  }

  const configuredValue = configured.toLowerCase()
  if (configuredValue.includes('mac')) {
    return inferred && inferred !== 'macOS' ? inferred : 'macOS'
  }
  if (configuredValue.includes('windows')) {
    return inferred && inferred !== 'Windows' ? inferred : 'Windows'
  }
  if (configuredValue.includes('android')) {
    return inferred && inferred !== 'Android' ? inferred : 'Android'
  }
  if (configuredValue.includes('ios') || configuredValue.includes('iphone') || configuredValue.includes('ipad')) {
    return inferred && inferred !== 'iOS' ? inferred : 'iOS'
  }
  if (configuredValue.includes('linux')) {
    return inferred && inferred !== 'Linux' ? inferred : 'Linux'
  }
  return inferred || configured
}

function resolveBrowserVersion(config: FingerprintConfig): string {
  const configured = String(config.advanced.browserVersion || '').trim()
  const inferred = inferBrowserVersionFromUserAgent(config.userAgent)
  return inferred || configured || '136'
}

function resolvePlatformValue(config: FingerprintConfig, operatingSystem: string): string {
  if (config.advanced.deviceMode === 'android') {
    return 'Linux armv8l'
  }
  if (config.advanced.deviceMode === 'ios') {
    return 'iPhone'
  }
  const value = operatingSystem.toLowerCase()
  if (value.includes('windows')) {
    return 'Win32'
  }
  if (value.includes('mac')) {
    return 'MacIntel'
  }
  return 'Linux x86_64'
}

function resolveInterfaceLanguage(config: FingerprintConfig): string {
  if (config.advanced.autoInterfaceLanguageFromIp) {
    return config.language || 'en-US'
  }
  return config.advanced.interfaceLanguage || config.language || 'en-US'
}

export function buildDeviceProfileSupportMatrix(
  config: FingerprintConfig,
): DeviceProfileSupportMatrix {
  const activeOrPartial = (
    mode: FontMode | SimpleFingerprintMode | 'enabled' | 'disabled',
  ): 'active' | 'partial' => (mode === 'system' || mode === 'disabled' || mode === 'off' ? 'partial' : 'active')

  return {
    fonts: config.advanced.fontMode === 'system' ? 'partial' : 'placeholder',
    mediaDevices: activeOrPartial(config.advanced.mediaDevicesMode),
    speechVoices: activeOrPartial(config.advanced.speechVoicesMode),
    canvas: activeOrPartial(config.advanced.canvasMode),
    webgl: config.advanced.webglImageMode !== 'off' || config.advanced.webglMetadataMode !== 'off' ? 'active' : 'partial',
    audio: activeOrPartial(config.advanced.audioContextMode),
    clientRects: activeOrPartial(config.advanced.clientRectsMode),
    geolocation:
      config.advanced.autoGeolocationFromIp || config.advanced.geolocation.trim().length > 0 ? 'active' : 'partial',
    deviceInfo: config.advanced.deviceInfoMode === 'custom' ? 'partial' : 'placeholder',
    sslFingerprint: config.advanced.sslFingerprintMode === 'enabled' ? 'placeholder' : 'placeholder',
    pluginFingerprint: config.advanced.customPluginFingerprint === 'enabled' ? 'placeholder' : 'placeholder',
  }
}

export function createDeviceProfileFromFingerprint(
  config: FingerprintConfig,
  createdAt = new Date().toISOString(),
  existing?: DeviceProfile | null,
): DeviceProfile {
  const nextUpdatedAt = new Date().toISOString()
  const operatingSystem = resolveOperatingSystem(config)
  const browserVersion = resolveBrowserVersion(config)
  return {
    version: DEVICE_PROFILE_VERSION,
    deviceClass: config.advanced.deviceMode === 'desktop' ? 'desktop' : 'mobile',
    operatingSystem,
    platform: resolvePlatformValue(config, operatingSystem),
    browserKernel: (config.advanced.browserKernel || 'chrome') as BrowserKernel,
    browserVersion,
    userAgent: config.userAgent,
    viewport: {
      width: config.advanced.windowWidth,
      height: config.advanced.windowHeight,
    },
    locale: {
      language: config.language || 'en-US',
      interfaceLanguage: resolveInterfaceLanguage(config),
      timezone: config.timezone || '',
      geolocation: config.advanced.geolocation || '',
    },
    hardware: {
      cpuCores: Math.max(1, Number(config.advanced.cpuCores) || 1),
      memoryGb: Math.max(1, Number(config.advanced.memoryGb) || 1),
      webglVendor: config.advanced.webglVendor,
      webglRenderer: config.advanced.webglRenderer,
    },
    mediaProfile: {
      fontMode: config.advanced.fontMode,
      mediaDevicesMode: config.advanced.mediaDevicesMode,
      speechVoicesMode: config.advanced.speechVoicesMode,
      canvasMode: config.advanced.canvasMode,
      webglImageMode: config.advanced.webglImageMode,
      webglMetadataMode: config.advanced.webglMetadataMode,
      audioContextMode: config.advanced.audioContextMode,
      clientRectsMode: config.advanced.clientRectsMode,
    },
    support: buildDeviceProfileSupportMatrix(config),
    createdAt: existing?.createdAt || createdAt,
    updatedAt: nextUpdatedAt,
  }
}

export function cloneDeviceProfile(profile: DeviceProfile | null | undefined): DeviceProfile | null {
  if (!profile) {
    return null
  }
  return {
    ...profile,
    locale: { ...profile.locale },
    viewport: { ...profile.viewport },
    hardware: { ...profile.hardware },
    mediaProfile: { ...profile.mediaProfile },
    support: { ...profile.support },
    updatedAt: new Date().toISOString(),
  }
}

export function ensureProfileDeviceProfile(
  profile: Pick<ProfileRecord, 'deviceProfile' | 'fingerprintConfig'>,
  createdAt?: string,
): DeviceProfile {
  return createDeviceProfileFromFingerprint(profile.fingerprintConfig, createdAt, profile.deviceProfile)
}

export function summarizeDeviceProfile(profile: DeviceProfile): string {
  const viewport = `${profile.viewport.width}x${profile.viewport.height}`
  const locale = [profile.locale.language, profile.locale.timezone].filter(Boolean).join(' · ')
  return [profile.operatingSystem, `Chrome ${profile.browserVersion}`, viewport, locale]
    .filter(Boolean)
    .join(' · ')
}
