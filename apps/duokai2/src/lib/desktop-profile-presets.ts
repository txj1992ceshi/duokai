import type { ProfileFormState } from './desktop-types'
import type { LocaleCode } from '../i18n'
import {
  DEFAULT_ENVIRONMENT_LANGUAGE,
  normalizeEnvironmentLanguage,
} from '../shared/environmentLanguages'
import {
  assignStableHardwareFingerprint,
  randomizeStableHardwareFingerprint,
  sanitizeTemplateHardwareFingerprint,
} from '../shared/hardwareProfiles'
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
    summaryZh: '用于标记注册类场景，便于筛选和提醒；不会自动改变当前环境配置。',
    summaryEn:
      'Use this label for registration-oriented workflows. It is used for filtering and reminders only and does not change runtime settings automatically.',
  },
  nurture: {
    summaryZh: '用于标记养号维护场景，便于筛选和提醒；不会自动改变当前环境配置。',
    summaryEn:
      'Use this label for nurture or maintenance workflows. It is used for filtering and reminders only and does not change runtime settings automatically.',
  },
  operation: {
    summaryZh: '用于标记日常运营场景，便于筛选和提醒；不会自动改变当前环境配置。',
    summaryEn:
      'Use this label for daily operation workflows. It is used for filtering and reminders only and does not change runtime settings automatically.',
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
  const majorVersion = String(browserVersion || '147').trim() || '147'
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

function syncBrowserIdentity(config: FingerprintConfig): FingerprintConfig {
  const browserVersion = String(config.advanced.browserVersion || '').trim() || '147'
  return {
    ...config,
    userAgent: buildDesktopUserAgent(config.advanced.operatingSystem, browserVersion),
    advanced: {
      ...config.advanced,
      browserKernelVersion: browserVersion,
      browserVersion,
    },
  }
}

export function normalizeFingerprintForSave(config: FingerprintConfig): FingerprintConfig {
  const resolvedStartupUrl = resolvePlatformStartupUrl(
    config.basicSettings.platform,
    config.basicSettings.customPlatformUrl,
  )
  const nextConfig = syncBrowserIdentity(config)

  return {
    ...nextConfig,
    basicSettings: {
      ...nextConfig.basicSettings,
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
        `最近以注册标签启动 ${new Date(metadata.lastRegisterLaunchAt).toLocaleString()}`,
        `Last launch while tagged register ${new Date(metadata.lastRegisterLaunchAt).toLocaleString()}`,
      ),
    )
  }
  if (metadata.lastNurtureTransitionAt) {
    parts.push(
      resolveLocalizedText(
        locale,
        `标记为养号 ${new Date(metadata.lastNurtureTransitionAt).toLocaleString()}`,
        `Marked as nurture ${new Date(metadata.lastNurtureTransitionAt).toLocaleString()}`,
      ),
    )
  }
  if (metadata.lastOperationTransitionAt) {
    parts.push(
      resolveLocalizedText(
        locale,
        `标记为运营 ${new Date(metadata.lastOperationTransitionAt).toLocaleString()}`,
        `Marked as operation ${new Date(metadata.lastOperationTransitionAt).toLocaleString()}`,
      ),
    )
  }
  if (parts.length === 0) {
    return resolveLocalizedText(
      locale,
      '当前环境尚未记录用途标签变更。',
      'No purpose label changes have been recorded yet.',
    )
  }
  return parts.join(' · ')
}

export const defaultFingerprint: FingerprintConfig = {
  userAgent: buildDesktopUserAgent(detectRendererOperatingSystem(), '147'),
  language: DEFAULT_ENVIRONMENT_LANGUAGE,
  timezone: '',
  resolution: '1440x900',
  webrtcMode: 'proxy-aware',
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
    browserKernelVersion: '147',
    deviceMode: 'desktop',
    operatingSystem: detectRendererOperatingSystem(),
    operatingSystemVersion: '',
    browserVersion: '147',
    autoLanguageFromIp: true,
    autoInterfaceLanguageFromIp: true,
    interfaceLanguage: '',
    autoTimezoneFromIp: true,
    autoGeolocationFromIp: true,
    geolocationPermission: 'allow',
    geolocation: '',
    windowWidth: 1280,
    windowHeight: 720,
    resolutionMode: 'system',
    fontMode: 'system',
    canvasMode: 'custom',
    webglImageMode: 'custom',
    webglMetadataMode: 'custom',
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer:
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 Ti Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.15.4633)',
    audioContextMode: 'custom',
    mediaDevicesMode: 'custom',
    speechVoicesMode: 'custom',
    doNotTrackEnabled: false,
    clientRectsMode: 'off',
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
    lastProxyCheckDiagnosticsJson: '',
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
    lastNetworkEgressPath: '',
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
    lastWorkspaceSummarySyncAt: '',
    lastWorkspaceSummarySyncStatus: 'idle',
    lastWorkspaceSummarySyncMessage: '',
    lastWorkspaceSnapshotSyncAt: '',
    lastWorkspaceSnapshotSyncStatus: 'idle',
    lastWorkspaceSnapshotSyncMessage: '',
    lastEnvironmentSyncAt: '',
    lastEnvironmentSyncStatus: 'idle',
    lastEnvironmentSyncMessage: '',
    lastEnvironmentSyncVersion: 0,
    lastControlPlaneError: '',
    lastControlPlaneErrorAt: '',
    pendingSyncKinds: [],
    lastCriticalRuntimeFault: '',
    hardwareProfileId: '',
    hardwareProfileVersion: '',
    hardwareSeed: '',
    hardwareProfileSource: '',
    hardwareTemplateId: '',
    hardwareVariantId: '',
    hardwareCatalogVersion: '',
  },
}

export function randomDesktopFingerprint(current: FingerprintConfig): FingerprintConfig {
  return randomizeStableHardwareFingerprint(current)
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
    const browserVersion = '146'
    const operatingSystem = 'Windows'
    const preset: { environmentPurpose: EnvironmentPurpose; fingerprintConfig: FingerprintConfig } =
      {
        environmentPurpose: PLATFORM_TEMPLATE_PRESETS.linkedin.recommendedPurpose,
        fingerprintConfig: {
          ...syncBrowserIdentity({
            ...baseFingerprint,
            advanced: {
              ...baseFingerprint.advanced,
              browserVersion,
              operatingSystem,
            },
          }),
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
            browserKernelVersion: browserVersion,
            browserVersion,
            autoLanguageFromIp: true,
            autoInterfaceLanguageFromIp: true,
            autoTimezoneFromIp: true,
            autoGeolocationFromIp: true,
            geolocationPermission: 'allow',
            windowWidth: 1440,
            windowHeight: 900,
            resolutionMode: 'system',
            fontMode: 'system',
            canvasMode: 'custom',
            webglImageMode: 'custom',
            webglMetadataMode: 'custom',
            webglVendor: 'Google Inc. (Intel)',
            webglRenderer:
              'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            audioContextMode: 'custom',
            mediaDevicesMode: 'custom',
            speechVoicesMode: 'custom',
            clientRectsMode: 'off',
            cpuMode: 'system',
            cpuCores: 8,
            memoryGb: 8,
          },
          resolution: '1440x900',
          webrtcMode: 'proxy-aware',
        },
      }
    return {
      environmentPurpose,
      fingerprintConfig: preset.fingerprintConfig,
    }
  }

  if (platform === 'tiktok') {
    const browserVersion = '147'
    const operatingSystem = 'Windows'
    const preset: { environmentPurpose: EnvironmentPurpose; fingerprintConfig: FingerprintConfig } =
      {
        environmentPurpose: PLATFORM_TEMPLATE_PRESETS.tiktok.recommendedPurpose,
        fingerprintConfig: {
          ...syncBrowserIdentity({
            ...baseFingerprint,
            advanced: {
              ...baseFingerprint.advanced,
              browserVersion,
              operatingSystem,
            },
          }),
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
            browserKernelVersion: browserVersion,
            browserVersion,
            autoLanguageFromIp: true,
            autoInterfaceLanguageFromIp: true,
            autoTimezoneFromIp: true,
            autoGeolocationFromIp: true,
            geolocationPermission: 'allow',
            windowWidth: 1600,
            windowHeight: 900,
            resolutionMode: 'system',
            fontMode: 'system',
            canvasMode: 'custom',
            webglImageMode: 'custom',
            webglMetadataMode: 'custom',
            webglVendor: 'Google Inc. (Intel)',
            webglRenderer:
              'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
            audioContextMode: 'custom',
            mediaDevicesMode: 'custom',
            speechVoicesMode: 'custom',
            clientRectsMode: 'off',
            cpuMode: 'system',
            cpuCores: 8,
            memoryGb: 8,
          },
          resolution: '1600x900',
          webrtcMode: 'proxy-aware',
        },
      }
    return {
      environmentPurpose,
      fingerprintConfig: preset.fingerprintConfig,
    }
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
  return {
    environmentPurpose,
    fingerprintConfig: cloneFingerprintConfig(fingerprintConfig),
  }
}

export function emptyProfile(
  proxyId: string | null = null,
  defaultLanguage: string = DEFAULT_ENVIRONMENT_LANGUAGE,
): ProfileFormState {
  const draftId = `draft-${crypto.randomUUID()}`
  return {
    name: '',
    proxyId,
    groupName: '',
    tagsText: '',
    notes: '',
    environmentPurpose: 'operation',
    deviceProfile: null,
    fingerprintConfig: assignStableHardwareFingerprint(
      {
        ...cloneFingerprintConfig(defaultFingerprint),
        language: normalizeEnvironmentLanguage(defaultLanguage),
      },
      draftId,
      {
        forceRegenerate: true,
        seed: draftId,
      },
    ),
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
    fingerprintConfig: sanitizeTemplateHardwareFingerprint(cloneFingerprintConfig(defaultFingerprint)),
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
