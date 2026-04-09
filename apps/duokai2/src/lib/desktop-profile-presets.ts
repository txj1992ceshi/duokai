import type { ProfileFormState } from './desktop-types'
import type { LocaleCode } from '../i18n'
import {
  DEFAULT_ENVIRONMENT_LANGUAGE,
  normalizeEnvironmentLanguage,
} from '../shared/environmentLanguages'
import type {
  DeviceProfile,
  EnvironmentPurpose,
  FingerprintConfig,
  ProfileRecord,
} from '../shared/types'

const STARTUP_PLATFORM_URLS: Record<string, string> = {
  amazon: 'https://www.amazon.com/',
  tiktok: 'https://www.tiktok.com/',
  google: 'https://www.google.com/',
  facebook: 'https://www.facebook.com/',
  linkedin: 'https://www.linkedin.com/',
  instagram: 'https://www.instagram.com/',
  x: 'https://x.com/',
  youtube: 'https://www.youtube.com/',
}

export const STARTUP_PLATFORM_OPTIONS = [
  { value: '', labelZh: '请选择', labelEn: 'Select' },
  { value: 'amazon', labelZh: 'Amazon', labelEn: 'Amazon' },
  { value: 'tiktok', labelZh: 'TikTok', labelEn: 'TikTok' },
  { value: 'google', labelZh: 'Google', labelEn: 'Google' },
  { value: 'facebook', labelZh: 'Facebook', labelEn: 'Facebook' },
  { value: 'linkedin', labelZh: 'LinkedIn', labelEn: 'LinkedIn' },
  { value: 'instagram', labelZh: 'Instagram', labelEn: 'Instagram' },
  { value: 'x', labelZh: 'X', labelEn: 'X' },
  { value: 'youtube', labelZh: 'YouTube', labelEn: 'YouTube' },
  { value: 'custom', labelZh: '自定义平台', labelEn: 'Custom platform' },
] as const

export const ENVIRONMENT_PURPOSE_OPTIONS: Array<{
  value: EnvironmentPurpose
  zh: string
  en: string
}> = [
  { value: 'operation', zh: '日常运营', en: 'Operation' },
  { value: 'nurture', zh: '养号维护', en: 'Nurture' },
  { value: 'register', zh: '注册环境', en: 'Register' },
] as const

const ENVIRONMENT_PURPOSE_PRESETS: Record<
  EnvironmentPurpose,
  {
    summaryZh: string
    summaryEn: string
  }
> = {
  register: {
    summaryZh: '注册环境优先保持稳定身份，不随机化，不清缓存，并强依赖 IP 联动的语言、时区和地理位置。',
    summaryEn:
      'Register profiles keep a stable identity, avoid randomization/cache resets, and rely on IP-derived language, timezone, and geolocation.',
  },
  nurture: {
    summaryZh: '养号环境强调登录态连续性与长期稳定，尽量避免会引起身份漂移的设置。',
    summaryEn:
      'Nurture profiles prioritize session continuity and long-term stability, avoiding settings that cause identity drift.',
  },
  operation: {
    summaryZh: '日常运营环境面向持续使用，保留会话与标签页同步，兼顾稳定性和日常效率。',
    summaryEn:
      'Operation profiles are tuned for ongoing use, keeping sessions and tabs stable for daily workflows.',
  },
}

const PLATFORM_TEMPLATE_PRESETS: Record<
  'linkedin' | 'tiktok',
  {
    recommendedPurpose: EnvironmentPurpose
    summaryZh: string
    summaryEn: string
    strategyZh: string
    strategyEn: string
  }
> = {
  linkedin: {
    recommendedPurpose: 'register',
    summaryZh: '更保守的办公桌面画像，适合注册与资料完善。',
    summaryEn: 'Conservative office-style desktop profile suited for registration and profile completion.',
    strategyZh: 'LinkedIn 建议一号一 IP、低频注册、优先办公型桌面画像，并避免随机化与清缓存。',
    strategyEn:
      'LinkedIn favors one-account-per-IP, low-frequency registration, office-style desktop fingerprints, and avoiding randomization or cache wipes.',
  },
  tiktok: {
    recommendedPurpose: 'nurture',
    summaryZh: '偏内容消费与日常运营的桌面画像，适合养号和长期使用。',
    summaryEn: 'Content-oriented desktop profile suited for nurture and long-term operation.',
    strategyZh: 'TikTok 更重视地区一致性、媒体能力与长期会话连续性，适合先养号再进入日常运营。',
    strategyEn:
      'TikTok cares more about regional consistency, media capabilities, and long-lived sessions, so nurturing before daily operation is preferred.',
  },
}

function resolveLocalizedText(
  locale: LocaleCode | string,
  zh: string,
  en: string,
): string {
  return locale === 'zh-CN' ? zh : en
}

export function detectRendererOperatingSystem(): string {
  if (typeof navigator === 'undefined') {
    return 'Windows'
  }
  const platform = `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase()
  if (platform.includes('mac')) {
    return 'macOS'
  }
  if (platform.includes('linux')) {
    return 'Linux'
  }
  return 'Windows'
}

export function buildDesktopUserAgent(operatingSystem: string, browserVersion: string): string {
  const majorVersion = String(browserVersion || '136').trim() || '136'
  const os = operatingSystem.toLowerCase()
  if (os.includes('mac')) {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${majorVersion}.0.0.0 Safari/537.36`
  }
  if (os.includes('linux')) {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${majorVersion}.0.0.0 Safari/537.36`
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${majorVersion}.0.0.0 Safari/537.36`
}

function resolvePlatformStartupUrl(platform: string, customPlatformUrl: string): string {
  if (platform === 'custom') {
    return customPlatformUrl.trim()
  }
  return STARTUP_PLATFORM_URLS[platform] || ''
}

export function normalizeFingerprintForSave(config: FingerprintConfig): FingerprintConfig {
  const resolvedStartupUrl = resolvePlatformStartupUrl(
    config.basicSettings.platform,
    config.basicSettings.customPlatformUrl,
  )
  const nextUserAgent = buildDesktopUserAgent(
    config.advanced.operatingSystem,
    config.advanced.browserVersion,
  )

  return {
    ...config,
    userAgent: nextUserAgent,
    basicSettings: {
      ...config.basicSettings,
      customPlatformUrl: resolvedStartupUrl,
    },
  }
}

export function summarizeIdentitySignature(
  profile: DeviceProfile | null,
  fallback: FingerprintConfig,
): string {
  const operatingSystem = profile?.operatingSystem || fallback.advanced.operatingSystem || ''
  const platform =
    profile?.platform ||
    (operatingSystem.includes('Windows')
      ? 'Win32'
      : operatingSystem.includes('mac')
        ? 'MacIntel'
        : 'Linux x86_64')
  const browserKernel = profile?.browserKernel || fallback.advanced.browserKernel
  const browserVersion = profile?.browserVersion || fallback.advanced.browserVersion || ''
  const deviceClass =
    profile?.deviceClass || (fallback.advanced.deviceMode === 'desktop' ? 'desktop' : 'mobile')
  return [operatingSystem, platform, `${browserKernel} ${browserVersion}`.trim(), deviceClass]
    .filter(Boolean)
    .join(' · ')
}

export function summarizeLocaleSignature(
  profile: DeviceProfile | null,
  fallback: FingerprintConfig,
): string {
  const language = profile?.locale.language || fallback.language || ''
  const interfaceLanguage =
    profile?.locale.interfaceLanguage || fallback.advanced.interfaceLanguage || ''
  const timezone = profile?.locale.timezone || fallback.timezone || ''
  const geolocation = profile?.locale.geolocation || fallback.advanced.geolocation || ''
  return [language, interfaceLanguage, timezone, geolocation].filter(Boolean).join(' · ')
}

export function summarizeHardwareSignature(
  profile: DeviceProfile | null,
  fallback: FingerprintConfig,
): string {
  const width = profile?.viewport.width || fallback.advanced.windowWidth
  const height = profile?.viewport.height || fallback.advanced.windowHeight
  const cpu = profile?.hardware.cpuCores || fallback.advanced.cpuCores
  const memory = profile?.hardware.memoryGb || fallback.advanced.memoryGb
  const renderer = profile?.hardware.webglRenderer || fallback.advanced.webglRenderer || ''
  return [`${width}x${height}`, `${cpu}C/${memory}GB`, renderer].filter(Boolean).join(' · ')
}

export function getEnvironmentPurposeLabel(
  purpose: EnvironmentPurpose,
  locale: LocaleCode | string,
): string {
  const match = ENVIRONMENT_PURPOSE_OPTIONS.find((item) => item.value === purpose)
  if (!match) {
    return purpose
  }
  return resolveLocalizedText(locale, match.zh, match.en)
}

export function getEnvironmentPurposeSummary(
  purpose: EnvironmentPurpose,
  locale: LocaleCode | string,
): string {
  const preset = ENVIRONMENT_PURPOSE_PRESETS[purpose]
  if (!preset) {
    return resolveLocalizedText(
      locale,
      '当前环境用途未应用专属策略。',
      'No dedicated purpose strategy is applied.',
    )
  }
  return resolveLocalizedText(locale, preset.summaryZh, preset.summaryEn)
}

export function getLifecycleStageSummary(
  profile: ProfileRecord,
  locale: LocaleCode | string,
): string {
  const metadata = profile.fingerprintConfig.runtimeMetadata
  const parts: string[] = []
  if (metadata.lastRegisterLaunchAt) {
    parts.push(
      resolveLocalizedText(
        locale,
        `最近注册启动 ${new Date(metadata.lastRegisterLaunchAt).toLocaleString()}`,
        `Last register launch ${new Date(metadata.lastRegisterLaunchAt).toLocaleString()}`,
      ),
    )
  }
  if (metadata.lastNurtureTransitionAt) {
    parts.push(
      resolveLocalizedText(
        locale,
        `进入养号 ${new Date(metadata.lastNurtureTransitionAt).toLocaleString()}`,
        `Entered nurture ${new Date(metadata.lastNurtureTransitionAt).toLocaleString()}`,
      ),
    )
  }
  if (metadata.lastOperationTransitionAt) {
    parts.push(
      resolveLocalizedText(
        locale,
        `进入运营 ${new Date(metadata.lastOperationTransitionAt).toLocaleString()}`,
        `Entered operation ${new Date(metadata.lastOperationTransitionAt).toLocaleString()}`,
      ),
    )
  }
  if (parts.length === 0) {
    return resolveLocalizedText(
      locale,
      '当前环境尚未记录注册/养号/运营迁移。',
      'No register/nurture/operation transition is recorded yet.',
    )
  }
  return parts.join(' · ')
}

export const defaultFingerprint: FingerprintConfig = {
  userAgent: buildDesktopUserAgent(detectRendererOperatingSystem(), '136'),
  language: DEFAULT_ENVIRONMENT_LANGUAGE,
  timezone: '',
  resolution: '1440x900',
  webrtcMode: 'default',
  basicSettings: {
    platform: '',
    customPlatformName: '',
    customPlatformUrl: '',
    platformUsername: '',
    platformPassword: '',
    validateByUsername: false,
    multiOpenMode: 'allow',
    twoFactorSecret: '',
    cookieSeed: '',
  },
  proxySettings: {
    proxyMode: 'direct',
    ipLookupChannel: 'IP2Location',
    proxyType: 'http',
    ipProtocol: 'ipv4',
    host: '',
    port: 0,
    username: '',
    password: '',
    udpEnabled: false,
  },
  commonSettings: {
    pageMode: 'local',
    blockImages: false,
    blockImagesAboveKb: 0,
    syncTabs: true,
    syncCookies: true,
    clearCacheOnLaunch: false,
    randomizeFingerprintOnLaunch: false,
    allowChromeLogin: false,
    hardwareAcceleration: true,
    memorySaver: false,
  },
  advanced: {
    browserKernel: 'chrome',
    browserKernelVersion: '140',
    deviceMode: 'desktop',
    operatingSystem: detectRendererOperatingSystem(),
    operatingSystemVersion: '',
    browserVersion: '136',
    autoLanguageFromIp: true,
    autoInterfaceLanguageFromIp: false,
    interfaceLanguage: '',
    autoTimezoneFromIp: true,
    autoGeolocationFromIp: true,
    geolocationPermission: 'ask',
    geolocation: '',
    windowWidth: 1280,
    windowHeight: 720,
    resolutionMode: 'system',
    fontMode: 'system',
    canvasMode: 'random',
    webglImageMode: 'random',
    webglMetadataMode: 'custom',
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer:
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 Ti Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.15.4633)',
    audioContextMode: 'random',
    mediaDevicesMode: 'off',
    speechVoicesMode: 'random',
    doNotTrackEnabled: false,
    clientRectsMode: 'random',
    deviceInfoMode: 'custom',
    deviceName: 'DESKTOP-U09K1H5',
    hostIp: '172.25.254.247',
    macAddress: '88-B1-11-1B-9D-9E',
    portScanProtection: true,
    portScanAllowlist: '',
    sslFingerprintMode: 'disabled',
    customPluginFingerprint: 'disabled',
    cpuMode: 'system',
    cpuCores: 8,
    memoryGb: 8,
    launchArgs: '',
  },
  runtimeMetadata: {
    lastResolvedIp: '',
    lastResolvedCountry: '',
    lastResolvedRegion: '',
    lastResolvedCity: '',
    lastResolvedTimezone: '',
    lastResolvedLanguage: '',
    lastResolvedGeolocation: '',
    lastResolvedAt: '',
    lastProxyCheckAt: '',
    lastProxyCheckSuccess: null,
    lastProxyCheckMessage: '',
    lastValidationLevel: 'unknown',
    lastValidationMessages: [],
    lastRegistrationRiskScore: 0,
    lastRegistrationRiskLevel: 'unknown',
    lastRegistrationRiskFactors: [],
    lastRegisterLaunchAt: '',
    lastPurposeTransitionAt: '',
    lastPurposeTransitionFrom: '',
    lastPurposeTransitionTo: '',
    lastNurtureTransitionAt: '',
    lastOperationTransitionAt: '',
    lastQuickCheckAt: '',
    lastQuickCheckSuccess: null,
    lastQuickCheckMessage: '',
    lastEffectiveProxyTransport: '',
    trustedSnapshotStatus: 'unknown',
    configFingerprintHash: '',
    proxyFingerprintHash: '',
    launchValidationStage: 'idle',
    lastQuickIsolationCheck: null,
    trustedLaunchSnapshot: null,
    launchRetryCount: 0,
    injectedFeatures: [],
    lastStorageStateVersion: 0,
    lastStorageStateSyncedAt: '',
    lastStorageStateDeviceId: '',
    lastStorageStateSyncStatus: 'idle',
    lastStorageStateSyncMessage: '',
  },
}

export function randomDesktopFingerprint(current: FingerprintConfig): FingerprintConfig {
  const resolutions = ['1280x720', '1366x768', '1440x900', '1600x900', '1920x1080']
  const resolution =
    resolutions[Math.floor(Math.random() * resolutions.length)] ?? current.resolution
  const [width, height] = resolution.split('x').map(Number)
  return {
    ...current,
    resolution,
    userAgent: buildDesktopUserAgent(
      current.advanced.operatingSystem,
      String(136 + Math.floor(Math.random() * 4)),
    ),
    advanced: {
      ...current.advanced,
      windowWidth: width || current.advanced.windowWidth,
      windowHeight: height || current.advanced.windowHeight,
      deviceName: `DESKTOP-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      hostIp: `172.${20 + Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      macAddress: Array.from({ length: 6 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, '0')
          .toUpperCase(),
      ).join('-'),
      cpuCores: [4, 8, 12, 16][Math.floor(Math.random() * 4)] ?? current.advanced.cpuCores,
      memoryGb: [4, 8, 16, 32][Math.floor(Math.random() * 4)] ?? current.advanced.memoryGb,
    },
  }
}

export function normalizeTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function cloneFingerprintConfig(
  base: FingerprintConfig = defaultFingerprint,
): FingerprintConfig {
  return {
    ...base,
    basicSettings: { ...base.basicSettings },
    proxySettings: { ...base.proxySettings },
    commonSettings: { ...base.commonSettings },
    advanced: { ...base.advanced },
    runtimeMetadata: {
      ...base.runtimeMetadata,
      lastValidationMessages: [...base.runtimeMetadata.lastValidationMessages],
      injectedFeatures: [...base.runtimeMetadata.injectedFeatures],
    },
  }
}

export function applyPlatformPresetToForm(
  fingerprintConfig: FingerprintConfig,
  environmentPurpose: EnvironmentPurpose,
  platform: string,
): { fingerprintConfig: FingerprintConfig; environmentPurpose: EnvironmentPurpose } {
  if (!platform || platform === 'custom') {
    return {
      fingerprintConfig: {
        ...fingerprintConfig,
        basicSettings: {
          ...fingerprintConfig.basicSettings,
          platform,
        },
      },
      environmentPurpose,
    }
  }

  const baseFingerprint = {
    ...fingerprintConfig,
    basicSettings: {
      ...fingerprintConfig.basicSettings,
      platform,
      customPlatformName: '',
      customPlatformUrl: '',
    },
  }

  if (platform === 'linkedin') {
    const browserVersion = '136'
    const operatingSystem = 'Windows'
    const preset: { environmentPurpose: EnvironmentPurpose; fingerprintConfig: FingerprintConfig } =
      {
        environmentPurpose: PLATFORM_TEMPLATE_PRESETS.linkedin.recommendedPurpose,
        fingerprintConfig: {
          ...baseFingerprint,
          userAgent: buildDesktopUserAgent(operatingSystem, browserVersion),
          commonSettings: {
            ...baseFingerprint.commonSettings,
            pageMode: 'local',
            blockImages: false,
            syncTabs: false,
            syncCookies: true,
            clearCacheOnLaunch: false,
            randomizeFingerprintOnLaunch: false,
            allowChromeLogin: false,
            memorySaver: true,
          },
          advanced: {
            ...baseFingerprint.advanced,
            deviceMode: 'desktop',
            operatingSystem,
            browserVersion,
            autoLanguageFromIp: true,
            autoInterfaceLanguageFromIp: false,
            autoTimezoneFromIp: true,
            autoGeolocationFromIp: true,
            geolocationPermission: 'ask',
            windowWidth: 1440,
            windowHeight: 900,
            resolutionMode: 'system',
            fontMode: 'system',
            canvasMode: 'random',
            webglImageMode: 'random',
            webglMetadataMode: 'custom',
            webglVendor: 'Google Inc. (Intel)',
            webglRenderer:
              'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            audioContextMode: 'random',
            mediaDevicesMode: 'off',
            speechVoicesMode: 'random',
            clientRectsMode: 'random',
            cpuMode: 'system',
            cpuCores: 8,
            memoryGb: 8,
          },
          resolution: '1440x900',
        },
      }
    return applyEnvironmentPurposePresetToForm(
      preset.fingerprintConfig,
      preset.environmentPurpose,
    )
  }

  if (platform === 'tiktok') {
    const browserVersion = '136'
    const operatingSystem = 'Windows'
    const preset: { environmentPurpose: EnvironmentPurpose; fingerprintConfig: FingerprintConfig } =
      {
        environmentPurpose: PLATFORM_TEMPLATE_PRESETS.tiktok.recommendedPurpose,
        fingerprintConfig: {
          ...baseFingerprint,
          userAgent: buildDesktopUserAgent(operatingSystem, browserVersion),
          commonSettings: {
            ...baseFingerprint.commonSettings,
            pageMode: 'local',
            blockImages: false,
            syncTabs: true,
            syncCookies: true,
            clearCacheOnLaunch: false,
            randomizeFingerprintOnLaunch: false,
            memorySaver: false,
          },
          advanced: {
            ...baseFingerprint.advanced,
            deviceMode: 'desktop',
            operatingSystem,
            browserVersion,
            autoLanguageFromIp: true,
            autoInterfaceLanguageFromIp: false,
            autoTimezoneFromIp: true,
            autoGeolocationFromIp: true,
            geolocationPermission: 'ask',
            windowWidth: 1600,
            windowHeight: 900,
            resolutionMode: 'system',
            fontMode: 'system',
            canvasMode: 'random',
            webglImageMode: 'random',
            webglMetadataMode: 'custom',
            webglVendor: 'Google Inc. (Intel)',
            webglRenderer:
              'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
            audioContextMode: 'random',
            mediaDevicesMode: 'random',
            speechVoicesMode: 'random',
            clientRectsMode: 'random',
            cpuMode: 'system',
            cpuCores: 8,
            memoryGb: 8,
          },
          resolution: '1600x900',
        },
      }
    return applyEnvironmentPurposePresetToForm(
      preset.fingerprintConfig,
      preset.environmentPurpose,
    )
  }

  return {
    fingerprintConfig: baseFingerprint,
    environmentPurpose,
  }
}

export function applyEnvironmentPurposePresetToForm(
  fingerprintConfig: FingerprintConfig,
  environmentPurpose: EnvironmentPurpose,
): { fingerprintConfig: FingerprintConfig; environmentPurpose: EnvironmentPurpose } {
  const baseFingerprint = cloneFingerprintConfig(fingerprintConfig)

  if (environmentPurpose === 'register') {
    return {
      environmentPurpose,
      fingerprintConfig: {
        ...baseFingerprint,
        commonSettings: {
          ...baseFingerprint.commonSettings,
          clearCacheOnLaunch: false,
          randomizeFingerprintOnLaunch: false,
          syncCookies: true,
          syncTabs: false,
          allowChromeLogin: false,
        },
        advanced: {
          ...baseFingerprint.advanced,
          autoLanguageFromIp: true,
          autoTimezoneFromIp: true,
          autoGeolocationFromIp: true,
          geolocationPermission: 'ask',
        },
      },
    }
  }

  if (environmentPurpose === 'nurture') {
    return {
      environmentPurpose,
      fingerprintConfig: {
        ...baseFingerprint,
        commonSettings: {
          ...baseFingerprint.commonSettings,
          clearCacheOnLaunch: false,
          randomizeFingerprintOnLaunch: false,
          syncCookies: true,
          syncTabs: true,
          memorySaver: true,
        },
        advanced: {
          ...baseFingerprint.advanced,
          autoLanguageFromIp: true,
          autoTimezoneFromIp: true,
          autoGeolocationFromIp: true,
        },
      },
    }
  }

  return {
    environmentPurpose,
    fingerprintConfig: {
      ...baseFingerprint,
      commonSettings: {
        ...baseFingerprint.commonSettings,
        clearCacheOnLaunch: false,
        randomizeFingerprintOnLaunch: false,
        syncCookies: true,
        syncTabs: true,
      },
    },
  }
}

export function emptyProfile(
  proxyId: string | null = null,
  defaultLanguage: string = DEFAULT_ENVIRONMENT_LANGUAGE,
): ProfileFormState {
  return {
    name: '',
    proxyId,
    groupName: '',
    tagsText: '',
    notes: '',
    environmentPurpose: 'operation',
    deviceProfile: null,
    fingerprintConfig: {
      ...cloneFingerprintConfig(defaultFingerprint),
      language: normalizeEnvironmentLanguage(defaultLanguage),
    },
  }
}

export function emptyTemplate(proxyId: string | null = null): ProfileFormState {
  return {
    name: '',
    proxyId,
    groupName: '',
    tagsText: '',
    notes: '',
    environmentPurpose: 'operation',
    deviceProfile: null,
    fingerprintConfig: cloneFingerprintConfig(defaultFingerprint),
  }
}

export function isBlankProfileForm(form: ProfileFormState): boolean {
  return (
    form.name.trim().length === 0 &&
    form.groupName.trim().length === 0 &&
    form.tagsText.trim().length === 0 &&
    form.notes.trim().length === 0
  )
}
