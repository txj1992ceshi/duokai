import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  dictionaries,
  getLocaleFromSettings,
  translateLogCategory,
  translateLogLevel,
  translateStatus,
} from './i18n'
import type {
  AuthUser,
  CloudPhoneDetails,
  CloudPhoneFingerprintSettings,
  CloudPhoneProxyRefMode,
  CloudPhoneProviderConfig,
  CloudPhoneProviderHealth,
  CloudPhoneProviderKind,
  CloudPhoneProviderSummary,
  CloudPhoneRecord,
  CreateCloudPhoneInput,
  DashboardSummary,
  DesktopAuthState,
  DesktopRuntimeInfo,
  DesktopUpdateState,
  DeviceProfile,
  DetectedLocalEmulator,
  EnvironmentPurpose,
  FingerprintConfig,
  ImportResult,
  LogEntry,
  ProfileRecord,
  ProxyRecord,
  ProxyType,
  RuntimeHostInfo,
  RuntimeStatus,
  SettingsPayload,
  TemplateRecord,
  WorkspaceSnapshotRecord,
} from './shared/types'
import type { DesktopApi } from './shared/ipc'
import {
  DEFAULT_ENVIRONMENT_LANGUAGE,
  SUPPORTED_ENVIRONMENT_LANGUAGES,
  normalizeEnvironmentLanguage,
} from './shared/environmentLanguages'

type ViewKey = 'dashboard' | 'profiles' | 'cloudPhones' | 'proxies' | 'logs' | 'settings' | 'account'
type ResourceMode = 'profiles' | 'templates'
type EditorPageMode = 'list' | 'create' | 'edit'
type StatusFilter = 'all' | ProfileRecord['status']
type ProxyPanelMode = 'create' | 'edit'
type DesktopRuntimeApi = DesktopApi
type AgentState = Awaited<ReturnType<DesktopApi['meta']['getAgentState']>>
type AuthState = DesktopAuthState
type UpdateState = DesktopUpdateState
type ProfileFormState = {
  name: string
  proxyId: string | null
  groupName: string
  tagsText: string
  notes: string
  environmentPurpose: EnvironmentPurpose
  deviceProfile: DeviceProfile | null
  fingerprintConfig: FingerprintConfig
}

type TemplateFormState = ProfileFormState
type CloudPhoneFormState = CreateCloudPhoneInput
type AccountProfileFormState = {
  name: string
  email: string
  username: string
  avatarUrl: string
  bio: string
}
type AccountPasswordFormState = {
  currentPassword: string
  nextPassword: string
  confirmPassword: string
}
type ProxyRowFeedback = {
  kind: 'success' | 'error'
  message: string
}
type PendingLaunchState = Record<string, number>

const CLOUD_PHONE_PROVIDER_KIND_MAP: Record<string, CloudPhoneProviderKind> = {
  'self-hosted': 'self-hosted',
  'third-party': 'third-party',
  'local-emulator': 'local-emulator',
  mock: 'mock',
}

function detectRendererOperatingSystem(): string {
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

const OPERATING_SYSTEM_OPTIONS = ['Windows', 'macOS', 'Linux'] as const
const STARTUP_PLATFORM_OPTIONS = [
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

const ENVIRONMENT_PURPOSE_OPTIONS: Array<{ value: EnvironmentPurpose; zh: string; en: string }> = [
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

function buildDesktopUserAgent(operatingSystem: string, browserVersion: string): string {
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

function normalizeFingerprintForSave(config: FingerprintConfig): FingerprintConfig {
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

function summarizeDeviceProfile(profile: DeviceProfile | null, fallback: FingerprintConfig): string {
  const operatingSystem = fallback.advanced.operatingSystem || profile?.operatingSystem || ''
  const browserVersion = fallback.advanced.browserVersion || profile?.browserVersion || ''
  const viewport = `${fallback.advanced.windowWidth}x${fallback.advanced.windowHeight}`
  const language = fallback.language || profile?.locale.language || ''
  const timezone = fallback.timezone || profile?.locale.timezone || ''
  return [operatingSystem, `Chrome ${browserVersion}`, viewport, language, timezone]
    .filter(Boolean)
    .join(' · ')
}

function summarizeSupportMatrix(profile: DeviceProfile | null, locale: string): string {
  if (!profile) {
    return locale === 'zh-CN' ? '画像将在保存后生成。' : 'Device profile will be generated after save.'
  }
  const activeEntries = Object.entries(profile.support)
    .filter(([, value]) => value !== 'placeholder')
    .map(([key, value]) => `${key}:${value}`)
  if (activeEntries.length === 0) {
    return locale === 'zh-CN' ? '当前未启用额外画像能力。' : 'No extra profile capabilities are active.'
  }
  return activeEntries.join(' · ')
}

function summarizeIdentitySignature(profile: DeviceProfile | null, fallback: FingerprintConfig): string {
  const operatingSystem = profile?.operatingSystem || fallback.advanced.operatingSystem || ''
  const platform = profile?.platform || (operatingSystem.includes('Windows') ? 'Win32' : operatingSystem.includes('mac') ? 'MacIntel' : 'Linux x86_64')
  const browserKernel = profile?.browserKernel || fallback.advanced.browserKernel
  const browserVersion = profile?.browserVersion || fallback.advanced.browserVersion || ''
  const deviceClass =
    profile?.deviceClass ||
    (fallback.advanced.deviceMode === 'desktop' ? 'desktop' : 'mobile')
  return [operatingSystem, platform, `${browserKernel} ${browserVersion}`.trim(), deviceClass]
    .filter(Boolean)
    .join(' · ')
}

function summarizeLocaleSignature(profile: DeviceProfile | null, fallback: FingerprintConfig): string {
  const language = profile?.locale.language || fallback.language || ''
  const interfaceLanguage = profile?.locale.interfaceLanguage || fallback.advanced.interfaceLanguage || ''
  const timezone = profile?.locale.timezone || fallback.timezone || ''
  const geolocation = profile?.locale.geolocation || fallback.advanced.geolocation || ''
  return [language, interfaceLanguage, timezone, geolocation].filter(Boolean).join(' · ')
}

function summarizeHardwareSignature(profile: DeviceProfile | null, fallback: FingerprintConfig): string {
  const width = profile?.viewport.width || fallback.advanced.windowWidth
  const height = profile?.viewport.height || fallback.advanced.windowHeight
  const cpu = profile?.hardware.cpuCores || fallback.advanced.cpuCores
  const memory = profile?.hardware.memoryGb || fallback.advanced.memoryGb
  const renderer = profile?.hardware.webglRenderer || fallback.advanced.webglRenderer || ''
  return [`${width}x${height}`, `${cpu}C/${memory}GB`, renderer].filter(Boolean).join(' · ')
}

function summarizeSupportHighlights(profile: DeviceProfile | null, locale: string): string {
  if (!profile) {
    return locale === 'zh-CN' ? '画像能力摘要将在保存后生成。' : 'Profile capability summary will appear after save.'
  }
  const labels: Record<string, { zh: string; en: string }> = {
    fonts: { zh: '字体', en: 'Fonts' },
    mediaDevices: { zh: '媒体设备', en: 'Media devices' },
    speechVoices: { zh: '语音列表', en: 'Speech voices' },
    canvas: { zh: 'Canvas', en: 'Canvas' },
    webgl: { zh: 'WebGL', en: 'WebGL' },
    audio: { zh: '音频', en: 'Audio' },
    clientRects: { zh: '布局测量', en: 'Client rects' },
    geolocation: { zh: '地理位置', en: 'Geolocation' },
    deviceInfo: { zh: '设备信息', en: 'Device info' },
  }
  return Object.entries(profile.support)
    .filter(([key]) => key in labels)
    .map(([key, value]) => `${locale === 'zh-CN' ? labels[key].zh : labels[key].en}:${value}`)
    .join(' · ')
}

function getEnvironmentPurposeLabel(purpose: EnvironmentPurpose, locale: string): string {
  const match = ENVIRONMENT_PURPOSE_OPTIONS.find((item) => item.value === purpose)
  if (!match) {
    return purpose
  }
  return locale === 'zh-CN' ? match.zh : match.en
}

function getEnvironmentPurposeSummary(purpose: EnvironmentPurpose, locale: string): string {
  const preset = ENVIRONMENT_PURPOSE_PRESETS[purpose]
  if (!preset) {
    return locale === 'zh-CN' ? '当前环境用途未应用专属策略。' : 'No dedicated purpose strategy is applied.'
  }
  return locale === 'zh-CN' ? preset.summaryZh : preset.summaryEn
}

function getRegistrationRiskLabel(
  level: 'unknown' | 'low' | 'medium' | 'high',
  locale: string,
): string {
  if (level === 'high') {
    return locale === 'zh-CN' ? '高风险' : 'High risk'
  }
  if (level === 'medium') {
    return locale === 'zh-CN' ? '中风险' : 'Medium risk'
  }
  if (level === 'low') {
    return locale === 'zh-CN' ? '低风险' : 'Low risk'
  }
  return locale === 'zh-CN' ? '未评估' : 'Not assessed'
}

function getPlatformTemplateSummary(platform: string, locale: string): string {
  const preset =
    platform === 'linkedin' || platform === 'tiktok' ? PLATFORM_TEMPLATE_PRESETS[platform] : null
  if (!preset) {
    return locale === 'zh-CN' ? '当前平台未应用专属模板。' : 'No dedicated platform template is applied.'
  }
  return locale === 'zh-CN' ? preset.summaryZh : preset.summaryEn
}

function getPlatformStrategySummary(platform: string, locale: string): string {
  const preset =
    platform === 'linkedin' || platform === 'tiktok' ? PLATFORM_TEMPLATE_PRESETS[platform] : null
  if (!preset) {
    return locale === 'zh-CN' ? '当前平台暂无额外行为策略。' : 'No extra behavior strategy is defined for this platform.'
  }
  return locale === 'zh-CN' ? preset.strategyZh : preset.strategyEn
}

function getLifecycleStageSummary(profile: ProfileRecord, locale: string): string {
  const metadata = profile.fingerprintConfig.runtimeMetadata
  const parts: string[] = []
  if (metadata.lastRegisterLaunchAt) {
    parts.push(
      locale === 'zh-CN'
        ? `最近注册启动 ${new Date(metadata.lastRegisterLaunchAt).toLocaleString()}`
        : `Last register launch ${new Date(metadata.lastRegisterLaunchAt).toLocaleString()}`,
    )
  }
  if (metadata.lastNurtureTransitionAt) {
    parts.push(
      locale === 'zh-CN'
        ? `进入养号 ${new Date(metadata.lastNurtureTransitionAt).toLocaleString()}`
        : `Entered nurture ${new Date(metadata.lastNurtureTransitionAt).toLocaleString()}`,
    )
  }
  if (metadata.lastOperationTransitionAt) {
    parts.push(
      locale === 'zh-CN'
        ? `进入运营 ${new Date(metadata.lastOperationTransitionAt).toLocaleString()}`
        : `Entered operation ${new Date(metadata.lastOperationTransitionAt).toLocaleString()}`,
    )
  }
  if (parts.length === 0) {
    return locale === 'zh-CN'
      ? '当前环境尚未记录注册/养号/运营迁移。'
      : 'No register/nurture/operation transition is recorded yet.'
  }
  return parts.join(' · ')
}

const defaultFingerprint: FingerprintConfig = {
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
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 Ti Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.15.4633)',
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

function randomDesktopFingerprint(current: FingerprintConfig): FingerprintConfig {
  const resolutions = ['1280x720', '1366x768', '1440x900', '1600x900', '1920x1080']
  const resolution = resolutions[Math.floor(Math.random() * resolutions.length)] ?? current.resolution
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

function normalizeTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function cloneFingerprintConfig(base: FingerprintConfig = defaultFingerprint): FingerprintConfig {
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

function applyPlatformPresetToForm(
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
    const preset: { environmentPurpose: EnvironmentPurpose; fingerprintConfig: FingerprintConfig } = {
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
          webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
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
    const preset: { environmentPurpose: EnvironmentPurpose; fingerprintConfig: FingerprintConfig } = {
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
          webglRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
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

function applyEnvironmentPurposePresetToForm(
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

function emptyProfile(
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

function emptyTemplate(proxyId: string | null = null): TemplateFormState {
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

function isBlankProfileForm(form: ProfileFormState): boolean {
  return (
    form.name.trim().length === 0 &&
    form.groupName.trim().length === 0 &&
    form.tagsText.trim().length === 0 &&
    form.notes.trim().length === 0
  )
}

function emptyProxy() {
  return {
    name: '',
    type: 'http' as ProxyType,
    host: '',
    port: 8080,
    username: '',
    password: '',
  }
}

function emptyAccountProfileForm(user: AuthUser | null): AccountProfileFormState {
  return {
    name: user?.name || '',
    email: user?.email || '',
    username: user?.username || '',
    avatarUrl: user?.avatarUrl || '',
    bio: user?.bio || '',
  }
}

function emptyAccountPasswordForm(): AccountPasswordFormState {
  return {
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  }
}

function buildProviderConfig(
  providerKey: string,
  settings: SettingsPayload,
  current?: CloudPhoneProviderConfig,
): CloudPhoneProviderConfig {
  const currentConfig = current ?? {}
  if (providerKey === 'self-hosted') {
    return {
      ...currentConfig,
      baseUrl: currentConfig.baseUrl ?? settings.selfHostedCloudPhoneBaseUrl ?? '',
      apiKey: currentConfig.apiKey ?? settings.selfHostedCloudPhoneApiKey ?? '',
      clusterId: currentConfig.clusterId ?? settings.selfHostedCloudPhoneClusterId ?? '',
      poolId: currentConfig.poolId ?? '',
    }
  }
  if (providerKey === 'third-party') {
    return {
      ...currentConfig,
      vendorKey: currentConfig.vendorKey ?? settings.thirdPartyCloudPhoneVendor ?? '',
      baseUrl: currentConfig.baseUrl ?? settings.thirdPartyCloudPhoneBaseUrl ?? '',
      token: currentConfig.token ?? settings.thirdPartyCloudPhoneToken ?? '',
      projectId: currentConfig.projectId ?? '',
    }
  }
  if (providerKey === 'local-emulator') {
    return {
      ...currentConfig,
      adbPath: currentConfig.adbPath ?? settings.localEmulatorAdbPath ?? 'adb',
      adbSerial: currentConfig.adbSerial ?? '',
      emulatorName: currentConfig.emulatorName ?? '',
    }
  }
  return currentConfig
}

function providerKindForKey(providerKey: string): CloudPhoneProviderKind {
  return CLOUD_PHONE_PROVIDER_KIND_MAP[providerKey] ?? 'mock'
}

function emptyCloudPhone(
  settings: SettingsPayload = {},
  defaultProviderKey: string = settings.defaultCloudPhoneProvider || 'self-hosted',
): CloudPhoneFormState {
  const fingerprintSettings: CloudPhoneFingerprintSettings = {
    autoLanguage: true,
    language: null,
    autoTimezone: true,
    timezone: null,
    autoGeolocation: true,
    geolocation: null,
  }

  return {
    name: '',
    groupName: '',
    tags: [],
    notes: '',
    platform: 'android',
    providerKey: defaultProviderKey,
    providerKind: providerKindForKey(defaultProviderKey),
    providerConfig: buildProviderConfig(defaultProviderKey, settings),
    providerInstanceId: null,
    computeType: 'basic',
    ipLookupChannel: 'IP2Location',
    proxyRefMode: 'saved',
    proxyId: null,
    proxyType: 'socks5',
    ipProtocol: 'ipv4',
    proxyHost: '',
    proxyPort: 0,
    proxyUsername: '',
    proxyPassword: '',
    udpEnabled: true,
    fingerprintSettings,
  }
}

function getNestedValue(target: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null || !(key in current)) {
      return undefined
    }
    return (current as Record<string, unknown>)[key]
  }, target)
}

function resolveSelectedProxy(
  proxies: ProxyRecord[],
  proxyId: string | null,
): ProxyRecord | null {
  if (!proxyId) {
    return null
  }
  return proxies.find((item) => item.id === proxyId) ?? null
}

function App() {
  const [view, setView] = useState<ViewKey>('dashboard')
  const [resourceMode, setResourceMode] = useState<ResourceMode>('profiles')
  const [summary, setSummary] = useState<DashboardSummary>({
    totalProfiles: 0,
    runningProfiles: 0,
    totalProxies: 0,
    onlineProxies: 0,
    totalCloudPhones: 0,
    runningCloudPhones: 0,
    cloudPhoneErrors: 0,
    logCount: 0,
  })
  const [cloudPhones, setCloudPhones] = useState<CloudPhoneRecord[]>([])
  const [cloudPhoneProviders, setCloudPhoneProviders] = useState<CloudPhoneProviderSummary[]>([])
  const [cloudPhoneProviderHealth, setCloudPhoneProviderHealth] = useState<
    CloudPhoneProviderHealth[]
  >([])
  const [localEmulatorDevices, setLocalEmulatorDevices] = useState<DetectedLocalEmulator[]>([])
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [templates, setTemplates] = useState<TemplateRecord[]>([])
  const [proxies, setProxies] = useState<ProxyRecord[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [settings, setSettings] = useState<SettingsPayload>({})
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [selectedCloudPhoneId, setSelectedCloudPhoneId] = useState<string | null>(null)
  const [profilePageMode, setProfilePageMode] = useState<EditorPageMode>('list')
  const [cloudPhonePageMode, setCloudPhonePageMode] = useState<EditorPageMode>('list')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedProxyId, setSelectedProxyId] = useState<string | null>(null)
  const [proxyPanelOpen, setProxyPanelOpen] = useState(false)
  const [proxyPanelMode, setProxyPanelMode] = useState<ProxyPanelMode>('create')
  const [testingProxyId, setTestingProxyId] = useState<string | null>(null)
  const [proxyRowFeedback, setProxyRowFeedback] = useState<Record<string, ProxyRowFeedback>>({})
  const [pendingProfileLaunches, setPendingProfileLaunches] = useState<PendingLaunchState>({})
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([])
  const [selectedCloudPhoneIds, setSelectedCloudPhoneIds] = useState<string[]>([])
  const [profileForm, setProfileForm] = useState(emptyProfile())
  const [cloudPhoneForm, setCloudPhoneForm] = useState<CloudPhoneFormState>(emptyCloudPhone())
  const [templateForm, setTemplateForm] = useState(emptyTemplate())
  const [proxyForm, setProxyForm] = useState(emptyProxy())
  const [directoryInfo, setDirectoryInfo] = useState<{
    appDataDir: string
    profilesDir: string
    chromiumExecutable?: string
  } | null>(null)
  const [runtimeInfo, setRuntimeInfo] = useState<DesktopRuntimeInfo | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null)
  const [runtimeHostInfo, setRuntimeHostInfo] = useState<RuntimeHostInfo | null>(null)
  const [agentState, setAgentState] = useState<AgentState | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [busyMessage, setBusyMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [authState, setAuthState] = useState<AuthState | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authIdentifier, setAuthIdentifier] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [accountProfileForm, setAccountProfileForm] = useState<AccountProfileFormState>(
    emptyAccountProfileForm(null),
  )
  const [accountPasswordForm, setAccountPasswordForm] = useState<AccountPasswordFormState>(
    emptyAccountPasswordForm(),
  )
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [cloudPhoneSearchQuery, setCloudPhoneSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [batchGroupName, setBatchGroupName] = useState('')
  const [cloudPhoneGroupFilter, setCloudPhoneGroupFilter] = useState('all')
  const [cloudPhoneBatchGroupName, setCloudPhoneBatchGroupName] = useState('')
  const [cloudPhoneDetails, setCloudPhoneDetails] = useState<CloudPhoneDetails | null>(null)
  const [showMoreProfileCommon, setShowMoreProfileCommon] = useState(false)
  const [showMoreProfileFingerprint, setShowMoreProfileFingerprint] = useState(false)
  const [workspaceSnapshotsByProfileId, setWorkspaceSnapshotsByProfileId] = useState<
    Record<string, WorkspaceSnapshotRecord[]>
  >({})
  const [snapshotLoadingProfileId, setSnapshotLoadingProfileId] = useState<string | null>(null)
  const lastUpdateNoticeKeyRef = useRef('')

  const locale = getLocaleFromSettings(settings.uiLanguage)
  const t = dictionaries[locale]
  const rendererOperatingSystem = detectRendererOperatingSystem()
  const defaultEnvironmentLanguage = normalizeEnvironmentLanguage(
    settings.defaultEnvironmentLanguage,
  )
  const defaultCloudPhoneProvider = settings.defaultCloudPhoneProvider || 'self-hosted'
  const defaultCloudPhoneProviderHealth = useMemo(
    () =>
      cloudPhoneProviderHealth.find((item) => item.key === defaultCloudPhoneProvider) ?? null,
    [cloudPhoneProviderHealth, defaultCloudPhoneProvider],
  )
  const latestNetworkCheck = useMemo(() => {
    const candidates = profiles
      .map((profile) => ({
        profile,
        resolvedAt: profile.fingerprintConfig.runtimeMetadata.lastResolvedAt,
        checkedAt: profile.fingerprintConfig.runtimeMetadata.lastProxyCheckAt,
      }))
      .filter(
        (item) =>
          Boolean(item.resolvedAt) ||
          Boolean(item.checkedAt) ||
          Boolean(item.profile.fingerprintConfig.runtimeMetadata.lastResolvedIp),
      )
      .sort((left, right) => {
        const leftTime = new Date(left.resolvedAt || left.checkedAt || left.profile.updatedAt).getTime()
        const rightTime = new Date(right.resolvedAt || right.checkedAt || right.profile.updatedAt).getTime()
        return rightTime - leftTime
      })
    const latest = candidates[0]
    if (!latest) {
      return null
    }
    const metadata = latest.profile.fingerprintConfig.runtimeMetadata
    return {
      profileName: latest.profile.name,
      success: metadata.lastProxyCheckSuccess,
      ip: metadata.lastResolvedIp,
      country: metadata.lastResolvedCountry || metadata.lastResolvedRegion,
      timezone: metadata.lastResolvedTimezone,
      message: metadata.lastProxyCheckMessage || '',
      checkedAt: metadata.lastProxyCheckAt || metadata.lastResolvedAt || latest.profile.updatedAt,
    }
  }, [profiles])
  const profileBackLabel = locale === 'zh-CN' ? '返回列表' : 'Back to list'
  const cloudPhoneBackLabel = locale === 'zh-CN' ? '返回列表' : 'Back to list'
  const agentReadOnlyMessage = useMemo(() => {
    if (!agentState?.enabled || agentState.writable) {
      return ''
    }
    const lastTask =
      agentState.lastTaskId && agentState.lastTaskStatus
        ? `${agentState.lastTaskId} (${agentState.lastTaskStatus})`
        : ''
    if (locale === 'zh-CN') {
      const reason = agentState.lastError ? `（${agentState.lastError}）` : ''
      const taskInfo = lastTask ? `，最近任务：${lastTask}` : ''
      const failInfo = agentState.consecutiveFailures > 0 ? `，连续失败：${agentState.consecutiveFailures}` : ''
      return `当前为离线只读模式：配置写操作已暂停，等待与控制面恢复连接${reason}${taskInfo}${failInfo}`
    }
    const reason = agentState.lastError ? ` (${agentState.lastError})` : ''
    const taskInfo = lastTask ? `. Last task: ${lastTask}` : ''
    const failInfo =
      agentState.consecutiveFailures > 0
        ? `. Consecutive failures: ${agentState.consecutiveFailures}`
        : ''
    return `Offline read-only mode: config writes are paused until control plane reconnects${reason}${taskInfo}${failInfo}`
  }, [agentState, locale])
  const showProfileWorkspaceList = resourceMode === 'profiles' && profilePageMode === 'list'
  const showProfileWorkspaceEditor = resourceMode === 'profiles' && profilePageMode !== 'list'
  const showTemplateWorkspace = resourceMode === 'templates'
  const showCloudPhoneList = cloudPhonePageMode === 'list'
  const showCloudPhoneEditor = cloudPhonePageMode !== 'list'
  const selectedProfile = useMemo(
    () => profiles.find((item) => item.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  )
  const selectedProfileSnapshots = useMemo(
    () => (selectedProfileId ? workspaceSnapshotsByProfileId[selectedProfileId] ?? [] : []),
    [selectedProfileId, workspaceSnapshotsByProfileId],
  )
  const selectedProfileWorkspace = selectedProfile?.workspace ?? null

  const bridgeUnavailableMessage = useCallback((path?: string) => {
    if (locale === 'zh-CN') {
      return path
        ? `应用桥接未同步，缺少接口 ${path}。请完全关闭当前开发窗口后重新执行 npm run dev。`
        : '应用桥接未同步，请完全关闭当前开发窗口后重新执行 npm run dev。'
    }
    return path
      ? `Desktop bridge is out of sync. Missing API ${path}. Fully close the current dev window and run npm run dev again.`
      : 'Desktop bridge is out of sync. Fully close the current dev window and run npm run dev again.'
  }, [locale])

  const localizeError = useCallback((error: unknown) => {
    if (!(error instanceof Error)) {
      return locale === 'zh-CN' ? '发生未知错误。' : 'Unknown error.'
    }

    if (
      error.message.startsWith('BRIDGE_UNAVAILABLE:') ||
      error.message.startsWith('MISSING_API:') ||
      error.message.includes("Cannot read properties of undefined")
    ) {
      const path = error.message.split(':').slice(1).join(':').trim() || undefined
      return bridgeUnavailableMessage(path)
    }

    if (error.message.startsWith('VALIDATION:')) {
      return error.message.replace('VALIDATION:', '').trim()
    }

    return error.message
  }, [bridgeUnavailableMessage, locale])

  const requireDesktopApi = useCallback((requiredPaths: string[] = []) => {
    const api = window.desktop as DesktopRuntimeApi | undefined
    if (!api) {
      throw new Error('BRIDGE_UNAVAILABLE:')
    }
    for (const path of requiredPaths) {
      if (typeof getNestedValue(api, path) === 'undefined') {
        throw new Error(`MISSING_API:${path}`)
      }
    }
    return api
  }, [])

  const views: { key: ViewKey; label: string }[] = [
    { key: 'dashboard', label: t.nav.dashboard },
    { key: 'profiles', label: t.nav.profiles },
    { key: 'cloudPhones', label: t.nav.cloudPhones },
    { key: 'proxies', label: t.nav.proxies },
    { key: 'logs', label: t.nav.logs },
    { key: 'settings', label: t.nav.settings },
  ]

  const groupOptions = useMemo(() => {
    return Array.from(
      new Set(
        profiles
          .map((profile) => profile.groupName || t.profiles.groupFallback)
          .filter(Boolean),
      ),
    )
  }, [profiles, t.profiles.groupFallback])

  const cloudPhoneGroupOptions = useMemo(() => {
    return Array.from(
      new Set(
        cloudPhones
          .map((item) => item.groupName || t.profiles.groupFallback)
          .filter(Boolean),
      ),
    )
  }, [cloudPhones, t.profiles.groupFallback])

  const cloudPhoneProviderMap = useMemo(
    () => new Map(cloudPhoneProviders.map((item) => [item.key, item])),
    [cloudPhoneProviders],
  )

  const cloudPhoneProviderHealthMap = useMemo(
    () => new Map(cloudPhoneProviderHealth.map((item) => [item.key, item])),
    [cloudPhoneProviderHealth],
  )
  const runtimeRunningIds = useMemo(
    () => new Set(runtimeStatus?.runningProfileIds ?? []),
    [runtimeStatus],
  )
  const runtimeQueuedIds = useMemo(
    () => new Set(runtimeStatus?.queuedProfileIds ?? []),
    [runtimeStatus],
  )
  const runtimeStartingIds = useMemo(
    () => new Set(runtimeStatus?.startingProfileIds ?? []),
    [runtimeStatus],
  )
  const runtimeLaunchStages = useMemo(
    () => runtimeStatus?.launchStages ?? {},
    [runtimeStatus],
  )

  function getLaunchPhaseLabel(profile: ProfileRecord): string {
    const stage = runtimeLaunchStages[profile.id] || profile.fingerprintConfig.runtimeMetadata.launchValidationStage
    if (stage === 'full-check') {
      return locale === 'zh-CN' ? '完整校验中' : 'Full check'
    }
    if (stage === 'quick-check') {
      return locale === 'zh-CN' ? '快速隔离校验中' : 'Quick isolation check'
    }
    if (stage === 'browser-launch') {
      return locale === 'zh-CN' ? '隔离环境启动中' : 'Launching isolated environment'
    }
    return locale === 'zh-CN' ? '启动中' : 'Starting'
  }

  function getLaunchPhaseClass(profile: ProfileRecord): string {
    const stage = runtimeLaunchStages[profile.id] || profile.fingerprintConfig.runtimeMetadata.launchValidationStage
    if (stage === 'full-check') {
      return 'launch-phase-full-check'
    }
    if (stage === 'quick-check') {
      return 'launch-phase-quick-check'
    }
    if (stage === 'browser-launch') {
      return 'launch-phase-browser-launch'
    }
    return 'launch-phase-generic'
  }

  function getStorageSyncSummary(profile: ProfileRecord): {
    label: string
    detail: string
    className: string
  } | null {
    const metadata = profile.fingerprintConfig.runtimeMetadata
    const version = metadata.lastStorageStateVersion
    const syncedAt = metadata.lastStorageStateSyncedAt
    const baseDetail = [
      version > 0 ? `${locale === 'zh-CN' ? '版本' : 'Version'} ${version}` : '',
      syncedAt ? formatDate(syncedAt) : '',
    ]
      .filter(Boolean)
      .join(' · ')

    if (metadata.lastStorageStateSyncStatus === 'conflict') {
      return {
        label: locale === 'zh-CN' ? '登录态冲突' : 'Storage conflict',
        detail:
          metadata.lastStorageStateSyncMessage ||
          (locale === 'zh-CN'
            ? '云端登录态已更新，请重新启动环境同步最新状态'
            : 'Cloud storage state changed. Restart the profile to sync the latest state.'),
        className: 'conflict',
      }
    }
    if (metadata.lastStorageStateSyncStatus === 'error') {
      return {
        label: locale === 'zh-CN' ? '登录态同步失败' : 'Storage sync failed',
        detail: metadata.lastStorageStateSyncMessage || baseDetail,
        className: 'error',
      }
    }
    if (metadata.lastStorageStateSyncStatus === 'pending') {
      return {
        label: locale === 'zh-CN' ? '登录态同步中' : 'Storage syncing',
        detail:
          metadata.lastStorageStateSyncMessage ||
          (baseDetail || (locale === 'zh-CN' ? '正在上传云端登录态' : 'Uploading storage state')),
        className: 'pending',
      }
    }
    if (metadata.lastStorageStateSyncStatus === 'synced' || version > 0) {
      return {
        label: locale === 'zh-CN' ? '登录态已同步' : 'Storage synced',
        detail: baseDetail || metadata.lastStorageStateSyncMessage,
        className: 'synced',
      }
    }
    return {
      label: locale === 'zh-CN' ? '登录态未同步' : 'Storage not synced',
      detail:
        metadata.lastStorageStateSyncMessage ||
        (locale === 'zh-CN'
          ? '当前环境还没有云端登录态版本'
          : 'No cloud storage state version yet'),
      className: 'idle',
    }
  }

  function formatDate(value: string | null) {
    if (!value) {
      return t.common.never
    }
    return new Date(value).toLocaleString(locale)
  }

  function formatSnapshotLabel(snapshotId: string) {
    return snapshotId.length > 12 ? snapshotId.slice(0, 12) : snapshotId
  }

  function describeSnapshotStatus(snapshot: WorkspaceSnapshotRecord) {
    if (snapshot.consistencySummary.status === 'block') {
      return {
        label: locale === 'zh-CN' ? '校验阻断' : 'Consistency blocked',
        className: 'error',
      }
    }
    if (snapshot.healthSummary.status === 'warning' || snapshot.consistencySummary.status === 'warn') {
      return {
        label: locale === 'zh-CN' ? '需人工确认' : 'Needs review',
        className: 'pending',
      }
    }
    if (snapshot.validatedStartAt) {
      return {
        label: locale === 'zh-CN' ? '已通过启动验证' : 'Launch-validated',
        className: 'synced',
      }
    }
    return {
      label: locale === 'zh-CN' ? '普通快照' : 'Snapshot saved',
      className: 'idle',
    }
  }

  function getSnapshotSummaryLine(profile: ProfileRecord) {
    const summary = profile.workspace?.snapshotSummary
    if (!summary) {
      return locale === 'zh-CN'
        ? '旧环境尚未补齐 workspace 快照摘要'
        : 'Legacy profile has not populated workspace snapshot summary yet'
    }
    const parts: string[] = []
    if (summary.lastSnapshotId) {
      parts.push(
        locale === 'zh-CN'
          ? `最近快照 ${formatDate(summary.lastSnapshotAt)}`
          : `Last snapshot ${formatDate(summary.lastSnapshotAt)}`,
      )
    }
    if (summary.lastKnownGoodSnapshotId) {
      parts.push(
        locale === 'zh-CN'
          ? `最近可回滚基线 ${formatDate(summary.lastKnownGoodSnapshotAt)}`
          : `Last known good ${formatDate(summary.lastKnownGoodSnapshotAt)}`,
      )
    }
    if (summary.lastKnownGoodStatus === 'invalid') {
      parts.push(
        locale === 'zh-CN'
          ? `最近可回滚基线已失效${summary.lastKnownGoodInvalidationReason ? ` (${summary.lastKnownGoodInvalidationReason})` : ''}`
          : `Last known good invalidated${summary.lastKnownGoodInvalidationReason ? ` (${summary.lastKnownGoodInvalidationReason})` : ''}`,
      )
    }
    if (parts.length === 0) {
      return locale === 'zh-CN' ? '尚未创建 workspace 快照' : 'No workspace snapshots yet'
    }
    return parts.join(' · ')
  }

  function getTrustSummaryLine(profile: ProfileRecord) {
    const trustSummary = profile.workspace?.trustSummary
    const metadata = profile.fingerprintConfig.runtimeMetadata
    const parts: string[] = []

    const trustedStatus = trustSummary?.trustedSnapshotStatus || metadata.trustedSnapshotStatus || 'unknown'
    if (trustedStatus === 'trusted') {
      parts.push(locale === 'zh-CN' ? '可信启动基线有效' : 'Trusted launch baseline active')
    } else if (trustedStatus === 'stale') {
      parts.push(locale === 'zh-CN' ? '可信启动基线已过期' : 'Trusted launch baseline stale')
    } else if (trustedStatus === 'invalid') {
      parts.push(locale === 'zh-CN' ? '可信启动基线失效' : 'Trusted launch baseline invalid')
    } else {
      parts.push(locale === 'zh-CN' ? '尚未建立可信启动基线' : 'Trusted launch baseline not created')
    }

    const quickCheckAt = trustSummary?.lastQuickIsolationCheckAt || metadata.lastQuickIsolationCheck?.checkedAt || ''
    const quickCheckSuccess =
      trustSummary?.lastQuickIsolationCheckSuccess ?? metadata.lastQuickIsolationCheck?.success ?? null
    if (quickCheckAt) {
      parts.push(
        quickCheckSuccess === false
          ? locale === 'zh-CN'
            ? `快速隔离校验失败 ${formatDate(quickCheckAt)}`
            : `Quick isolation failed ${formatDate(quickCheckAt)}`
          : locale === 'zh-CN'
            ? `快速隔离校验 ${formatDate(quickCheckAt)}`
            : `Quick isolation ${formatDate(quickCheckAt)}`,
      )
    }

    const runtimeLockState = trustSummary?.activeRuntimeLock.state || 'unlocked'
    if (runtimeLockState === 'locked') {
      parts.push(locale === 'zh-CN' ? '运行锁定中' : 'Runtime lock active')
    } else if (runtimeLockState === 'stale-lock') {
      parts.push(locale === 'zh-CN' ? '检测到陈旧锁' : 'Stale runtime lock detected')
    }

    return parts.join(' · ')
  }

  function describeUpdateStatus(state: UpdateState | null) {
    if (!state) {
      return locale === 'zh-CN' ? '正在读取更新状态…' : 'Loading update status...'
    }
    switch (state.status) {
      case 'unsupported':
        return locale === 'zh-CN'
          ? '当前是开发环境，自动更新只在正式打包后的桌面端启用。'
          : 'Auto update is only enabled in packaged desktop builds.'
      case 'checking':
        return locale === 'zh-CN' ? '正在检查最新版本…' : 'Checking for the latest version...'
      case 'available':
        return locale === 'zh-CN'
          ? `发现新版本 ${state.latestVersion || ''}${state.assetName ? `，可下载 ${state.assetName}` : ''}。`
          : `Update ${state.latestVersion || ''} is available${state.assetName ? ` as ${state.assetName}` : ''}.`
      case 'not-available':
        return locale === 'zh-CN' ? '当前已是最新版本。' : 'You already have the latest version.'
      case 'downloading':
        return locale === 'zh-CN'
          ? `正在下载更新 ${state.progressPercent ? `${state.progressPercent}%` : ''}`
          : `Downloading update ${state.progressPercent ? `${state.progressPercent}%` : ''}`
      case 'downloaded':
        return locale === 'zh-CN'
          ? rendererOperatingSystem === 'Windows'
            ? '安装程序已下载完成，点击下方按钮开始安装。'
            : '安装包已下载完成，点击下方按钮打开安装。'
          : rendererOperatingSystem === 'Windows'
            ? 'The installer is ready. Use the button below to start installation.'
            : 'The update package is ready. Use the button below to open the installer.'
      case 'error':
        return state.message || (locale === 'zh-CN' ? '更新检查失败。' : 'Update check failed.')
      default:
        return locale === 'zh-CN' ? '自动更新已就绪，可随时检查。' : 'Auto update is ready. You can check at any time.'
    }
  }

  function getUpdateActionLabel(state: UpdateState | null) {
    if (!state) {
      return locale === 'zh-CN' ? '检查更新' : 'Check for updates'
    }
    if (state.status === 'available') {
      return locale === 'zh-CN' ? '下载更新' : 'Download update'
    }
    if (state.status === 'downloading') {
      return locale === 'zh-CN' ? '下载中…' : 'Downloading...'
    }
    if (state.status === 'downloaded') {
      return locale === 'zh-CN'
        ? rendererOperatingSystem === 'Windows'
          ? '开始安装'
          : '打开安装包'
        : rendererOperatingSystem === 'Windows'
          ? 'Install update'
          : 'Open installer'
    }
    return locale === 'zh-CN' ? '检查更新' : 'Check for updates'
  }

  async function handlePrimaryUpdateAction() {
    if (updateState?.status === 'available') {
      await downloadUpdate()
      return
    }
    if (updateState?.status === 'downloaded') {
      await installUpdate()
      return
    }
    if (updateState?.status === 'downloading') {
      return
    }
    await checkForUpdates(true)
  }

  const pageHeading =
    view === 'cloudPhones'
      ? { title: t.cloudPhones.title, subtitle: t.cloudPhones.subtitle }
      : view === 'account'
        ? {
            title: locale === 'zh-CN' ? '个人中心' : 'Personal Center',
            subtitle:
              locale === 'zh-CN'
                ? '账号资料与桌面端绑定信息。后续可以在这里继续扩展更多个人设置。'
                : 'Account profile and desktop bindings. More personal settings can be added here later.',
          }
      : { title: t.dashboard.title, subtitle: t.dashboard.subtitle }
  const currentAuthUser: AuthUser | null = authState?.user ?? null
  const currentDeviceId = authState?.currentDeviceId || ''

  useEffect(() => {
    setAccountProfileForm(emptyAccountProfileForm(currentAuthUser))
  }, [currentAuthUser])

  const refreshAll = useCallback(async () => {
    const api = requireDesktopApi([
      'auth.syncProfiles',
      'meta.getInfo',
      'dashboard.summary',
      'runtime.getStatus',
      'runtime.getHostInfo',
      'cloudPhones.list',
      'cloudPhones.listProviders',
      'cloudPhones.getProviderHealth',
      'cloudPhones.detectLocalDevices',
      'profiles.list',
      'templates.list',
      'proxies.list',
      'logs.list',
      'settings.get',
      'profiles.getDirectoryInfo',
      'updater.getState',
    ])
    const [
      ,
      dashboard,
      nextRuntimeStatus,
      nextRuntimeHostInfo,
      nextCloudPhones,
      nextCloudPhoneProviders,
      nextCloudPhoneProviderHealth,
      nextLocalEmulatorDevices,
      nextProfiles,
      nextTemplates,
      nextProxies,
      nextLogs,
      nextSettings,
      dirInfo,
      nextAgentState,
      nextUpdateState,
    ] =
      await Promise.all([
        api.auth.syncProfiles(),
        api.dashboard.summary(),
        api.runtime.getStatus(),
        api.runtime.getHostInfo(),
        api.cloudPhones.list(),
        api.cloudPhones.listProviders(),
        api.cloudPhones.getProviderHealth(),
        api.cloudPhones.detectLocalDevices(),
        api.profiles.list(),
        api.templates.list(),
        api.proxies.list(),
        api.logs.list(),
        api.settings.get(),
        api.profiles.getDirectoryInfo(),
        api.meta.getAgentState(),
        api.updater.getState(),
      ])
    const info = await api.meta.getInfo()

    setSummary(dashboard)
    setRuntimeStatus(nextRuntimeStatus)
    setRuntimeHostInfo(nextRuntimeHostInfo)
    setCloudPhones(nextCloudPhones)
    setCloudPhoneProviders(nextCloudPhoneProviders)
    setCloudPhoneProviderHealth(nextCloudPhoneProviderHealth)
    setLocalEmulatorDevices(nextLocalEmulatorDevices)
    setProfiles(nextProfiles)
    setTemplates(nextTemplates)
    setProxies(nextProxies)
    setLogs(nextLogs)
    setSettings(nextSettings)
    setDirectoryInfo(dirInfo)
    setAgentState(nextAgentState)
    setUpdateState(nextUpdateState)
    setRuntimeInfo({
      ...info,
      rendererVersion: __APP_VERSION__,
    })
  }, [requireDesktopApi])

  useEffect(() => {
    void (async () => {
      try {
        const api = requireDesktopApi(['auth.getState'])
        const nextAuthState = await api.auth.getState()
        setAuthState(nextAuthState)
        setAuthReady(true)
        if (nextAuthState.authenticated) {
          await refreshAll()
        }
      } catch (error) {
        setErrorMessage(localizeError(error))
        setAuthReady(true)
      }
    })()
  }, [localizeError, refreshAll, requireDesktopApi])

  useEffect(() => {
    if (!authState?.authenticated) {
      return
    }
    const timer = window.setInterval(async () => {
      try {
        const api = requireDesktopApi([
          'auth.syncProfiles',
          'cloudPhones.refreshStatuses',
          'profiles.list',
          'dashboard.summary',
          'runtime.getStatus',
          'meta.getAgentState',
        ])
        const [, nextCloudPhones, nextProfiles, nextSummary, nextRuntimeStatus, nextAgentState] =
          await Promise.all([
          api.auth.syncProfiles(),
          api.cloudPhones.refreshStatuses(),
          api.profiles.list(),
          api.dashboard.summary(),
          api.runtime.getStatus(),
          api.meta.getAgentState(),
        ])
        setProfiles(nextProfiles)
        setSummary(nextSummary)
        setRuntimeStatus(nextRuntimeStatus)
        setCloudPhones(nextCloudPhones)
        setAgentState(nextAgentState)
      } catch (error) {
        setErrorMessage(localizeError(error))
        return
      }
    }, 2000)

    return () => window.clearInterval(timer)
  }, [authState?.authenticated, localizeError, requireDesktopApi])

  useEffect(() => {
    if (!selectedProfileId) {
      return
    }
    const profile = profiles.find((item) => item.id === selectedProfileId)
    if (!profile) {
      return
    }
    setProfileForm({
      name: profile.name,
      proxyId: profile.proxyId,
      groupName: profile.groupName,
      tagsText: profile.tags.join(', '),
      notes: profile.notes,
      environmentPurpose: profile.environmentPurpose,
      deviceProfile: profile.deviceProfile,
      fingerprintConfig: cloneFingerprintConfig(profile.fingerprintConfig),
    })
    // Only initialize when selected profile changes.
    // Polling refresh updates `profiles` frequently and should not overwrite in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileId])

  useEffect(() => {
    if (!selectedProfileId) {
      return
    }
    void loadWorkspaceSnapshots(selectedProfileId, { showError: false })
    // Only refresh snapshots when profile selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileId])

  useEffect(() => {
    if (!selectedCloudPhoneId) {
      return
    }
    const cloudPhone = cloudPhones.find((item) => item.id === selectedCloudPhoneId)
    if (!cloudPhone) {
      return
    }
    setCloudPhoneForm({
      name: cloudPhone.name,
      groupName: cloudPhone.groupName,
      tags: cloudPhone.tags,
      notes: cloudPhone.notes,
      platform: 'android',
      providerKey: cloudPhone.providerKey,
      providerKind: cloudPhone.providerKind,
      providerConfig: cloudPhone.providerConfig ?? {},
      providerInstanceId: cloudPhone.providerInstanceId,
      computeType: cloudPhone.computeType,
      ipLookupChannel: cloudPhone.ipLookupChannel,
      proxyRefMode: cloudPhone.proxyRefMode,
      proxyId: cloudPhone.proxyId,
      proxyType: cloudPhone.proxyType,
      ipProtocol: cloudPhone.ipProtocol,
      proxyHost: cloudPhone.proxyHost,
      proxyPort: cloudPhone.proxyPort,
      proxyUsername: cloudPhone.proxyUsername,
      proxyPassword: cloudPhone.proxyPassword,
      udpEnabled: cloudPhone.udpEnabled,
      fingerprintSettings: cloudPhone.fingerprintSettings,
    })
  }, [cloudPhones, selectedCloudPhoneId])

  useEffect(() => {
    if (!selectedTemplateId) {
      return
    }
    const template = templates.find((item) => item.id === selectedTemplateId)
    if (!template) {
      return
    }
    setTemplateForm({
      name: template.name,
      proxyId: template.proxyId,
      groupName: template.groupName,
      tagsText: template.tags.join(', '),
      notes: template.notes,
      environmentPurpose: template.environmentPurpose,
      deviceProfile: null,
      fingerprintConfig: cloneFingerprintConfig(template.fingerprintConfig),
    })
  }, [selectedTemplateId, templates])

  useEffect(() => {
    if (!selectedProxyId) {
      return
    }
    const proxy = proxies.find((item) => item.id === selectedProxyId)
    if (!proxy) {
      return
    }
    setProxyForm({
      name: proxy.name,
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
    })
  }, [selectedProxyId, proxies])

  useEffect(() => {
    if (!noticeMessage) {
      return
    }
    const timer = window.setTimeout(() => {
      setNoticeMessage('')
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [noticeMessage])

  useEffect(() => {
    const api = window.desktop as DesktopRuntimeApi | undefined
    if (!api?.updater?.onStateChange) {
      return
    }
    return api.updater.onStateChange((nextState) => {
      setUpdateState(nextState)
    })
  }, [])

  useEffect(() => {
    if (!updateState) {
      return
    }
    const noticeKey = `${updateState.status}:${updateState.latestVersion || ''}:${updateState.progressPercent}`
    if (lastUpdateNoticeKeyRef.current === noticeKey) {
      return
    }
    if (updateState.status === 'available' && updateState.latestVersion) {
      lastUpdateNoticeKeyRef.current = noticeKey
      setNoticeMessage(
        locale === 'zh-CN'
          ? `发现新版本 ${updateState.latestVersion}，可在设置中下载安装。`
          : `Update ${updateState.latestVersion} is available. Download it from Settings.`,
      )
    }
    if (updateState.status === 'downloaded') {
      lastUpdateNoticeKeyRef.current = noticeKey
      setNoticeMessage(
        locale === 'zh-CN'
          ? '更新包已准备好，可在设置中开始安装。'
          : 'The update package is ready to install from Settings.',
      )
    }
  }, [locale, updateState])

  useEffect(() => {
    setPendingProfileLaunches((current) => {
      const next = { ...current }
      let changed = false
      for (const profileId of Object.keys(current)) {
        const profile = profiles.find((item) => item.id === profileId)
        if (!profile) {
          delete next[profileId]
          changed = true
          continue
        }
        const runtimeStillPending = runtimeQueuedIds.has(profileId) || runtimeStartingIds.has(profileId)
        if (
          runtimeRunningIds.has(profileId) ||
          profile.status === 'running' ||
          profile.status === 'error' ||
          (!runtimeStillPending && profile.status !== 'starting' && profile.status !== 'queued')
        ) {
          delete next[profileId]
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [profiles, runtimeQueuedIds, runtimeRunningIds, runtimeStartingIds])

  useEffect(() => {
    setNoticeMessage('')
    if (view !== 'proxies') {
      setProxyPanelOpen(false)
      setProxyPanelMode('create')
      setSelectedProxyId(null)
      setProxyForm(emptyProxy())
      setTestingProxyId(null)
      setProxyRowFeedback({})
    }
  }, [view])

  useEffect(() => {
    if (selectedProfileId) {
      return
    }
    if (!isBlankProfileForm(profileForm)) {
      return
    }
    if (profileForm.fingerprintConfig.language === defaultEnvironmentLanguage) {
      return
    }
    setProfileForm((current) => ({
      ...current,
      fingerprintConfig: {
        ...current.fingerprintConfig,
        language: defaultEnvironmentLanguage,
      },
    }))
  }, [defaultEnvironmentLanguage, profileForm, selectedProfileId])

  useEffect(() => {
    if (selectedCloudPhoneId) {
      return
    }
    setCloudPhoneForm((current) => {
      const isBlank =
        current.name.trim().length === 0 &&
        current.groupName.trim().length === 0 &&
        current.tags.length === 0 &&
        current.notes.trim().length === 0 &&
        current.proxyId === null &&
        current.proxyHost.trim().length === 0 &&
        current.proxyPort === 0 &&
        current.proxyUsername.trim().length === 0 &&
        current.proxyPassword.trim().length === 0
      if (!isBlank) {
        return current
      }
      const nextProviderKey = current.providerKey || defaultCloudPhoneProvider
      return {
        ...current,
        providerKey: nextProviderKey,
        providerKind: providerKindForKey(nextProviderKey),
        providerConfig: buildProviderConfig(nextProviderKey, settings, current.providerConfig),
      }
    })
  }, [defaultCloudPhoneProvider, selectedCloudPhoneId, settings])

  useEffect(() => {
    if (selectedCloudPhoneId) {
      return
    }
    setCloudPhoneForm((current) => {
      if (current.proxyRefMode !== 'saved') {
        return current
      }
      if (current.proxyId && proxies.some((item) => item.id === current.proxyId)) {
        return current
      }
      const nextProxyId = proxies[0]?.id ?? null
      if (nextProxyId === current.proxyId) {
        return current
      }
      return {
        ...current,
        proxyId: nextProxyId,
      }
    })
  }, [proxies, selectedCloudPhoneId])

  const filteredProfiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return profiles.filter((profile) => {
      const profileGroup = profile.groupName || t.profiles.groupFallback
      const matchesQuery =
        query.length === 0 ||
        profile.name.toLowerCase().includes(query) ||
        profile.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        profileGroup.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || profile.status === statusFilter
      const matchesGroup = groupFilter === 'all' || profileGroup === groupFilter
      return matchesQuery && matchesStatus && matchesGroup
    })
  }, [groupFilter, profiles, searchQuery, statusFilter, t.profiles.groupFallback])

  const filteredCloudPhones = useMemo(() => {
    const query = cloudPhoneSearchQuery.trim().toLowerCase()
    return cloudPhones.filter((item) => {
      const itemGroup = item.groupName || t.profiles.groupFallback
      const matchesQuery =
        query.length === 0 ||
        item.name.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        itemGroup.toLowerCase().includes(query)
      const matchesGroup = cloudPhoneGroupFilter === 'all' || itemGroup === cloudPhoneGroupFilter
      return matchesQuery && matchesGroup
    })
  }, [cloudPhoneGroupFilter, cloudPhoneSearchQuery, cloudPhones, t.profiles.groupFallback])

  const groupedCloudPhones = useMemo(() => {
    return filteredCloudPhones.reduce<Record<string, CloudPhoneRecord[]>>((acc, item) => {
      const key = item.groupName || t.profiles.groupFallback
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(item)
      return acc
    }, {})
  }, [filteredCloudPhones, t.profiles.groupFallback])

  const groupedProfiles = useMemo(() => {
    return filteredProfiles.reduce<Record<string, ProfileRecord[]>>((acc, profile) => {
      const key = profile.groupName || t.profiles.groupFallback
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(profile)
      return acc
    }, {})
  }, [filteredProfiles, t.profiles.groupFallback])

  async function withBusy(message: string, action: () => Promise<void>) {
    setBusyMessage(message)
    setErrorMessage('')
    setNoticeMessage('')
    try {
      await action()
      await refreshAll()
    } catch (error) {
      setErrorMessage(localizeError(error))
    } finally {
      setBusyMessage('')
    }
  }

  async function loadWorkspaceSnapshots(
    profileId: string,
    options: { showError?: boolean } = {},
  ) {
    setSnapshotLoadingProfileId(profileId)
    try {
      const api = requireDesktopApi(['workspace.snapshots.list'])
      const snapshots = await api.workspace.snapshots.list(profileId)
      setWorkspaceSnapshotsByProfileId((current) => ({
        ...current,
        [profileId]: snapshots,
      }))
      return snapshots
    } catch (error) {
      if (options.showError !== false) {
        setErrorMessage(localizeError(error))
      }
      return []
    } finally {
      setSnapshotLoadingProfileId((current) => (current === profileId ? null : current))
    }
  }

  async function createWorkspaceSnapshotForProfile(profileId: string) {
    await withBusy(
      locale === 'zh-CN' ? '正在创建 workspace 快照...' : 'Creating workspace snapshot...',
      async () => {
        const api = requireDesktopApi(['workspace.snapshots.create'])
        const snapshot = await api.workspace.snapshots.create(profileId)
        await loadWorkspaceSnapshots(profileId, { showError: false })
        setNoticeMessage(
          locale === 'zh-CN'
            ? `已创建快照 ${formatSnapshotLabel(snapshot.snapshotId)}。`
            : `Created snapshot ${formatSnapshotLabel(snapshot.snapshotId)}.`,
        )
      },
    )
  }

  async function restoreWorkspaceSnapshotForProfile(profileId: string, snapshotId: string) {
    const confirmed = window.confirm(
      locale === 'zh-CN'
        ? '恢复快照会写回当前 workspace 元数据和登录态，继续吗？'
        : 'Restoring a snapshot will write back workspace metadata and storage state. Continue?',
    )
    if (!confirmed) {
      return
    }
    await withBusy(
      locale === 'zh-CN' ? '正在恢复 workspace 快照...' : 'Restoring workspace snapshot...',
      async () => {
        const api = requireDesktopApi(['workspace.snapshots.restore'])
        await api.workspace.snapshots.restore(profileId, snapshotId)
        await loadWorkspaceSnapshots(profileId, { showError: false })
        setNoticeMessage(
          locale === 'zh-CN'
            ? `已恢复快照 ${formatSnapshotLabel(snapshotId)}。`
            : `Restored snapshot ${formatSnapshotLabel(snapshotId)}.`,
        )
      },
    )
  }

  async function rollbackWorkspaceSnapshotForProfile(profileId: string) {
    const confirmed = window.confirm(
      locale === 'zh-CN'
        ? '将回滚到最近一次 last known good 快照，继续吗？'
        : 'This will roll back to the latest last known good snapshot. Continue?',
    )
    if (!confirmed) {
      return
    }
    await withBusy(
      locale === 'zh-CN' ? '正在回滚到最近可用快照...' : 'Rolling back to last known good snapshot...',
      async () => {
        const api = requireDesktopApi(['workspace.snapshots.rollback'])
        const restoredProfile = await api.workspace.snapshots.rollback(profileId)
        await loadWorkspaceSnapshots(profileId, { showError: false })
        setNoticeMessage(
          locale === 'zh-CN'
            ? `已回滚 ${restoredProfile.name} 到最近可用快照。`
            : `Rolled back ${restoredProfile.name} to the last known good snapshot.`,
        )
      },
    )
  }

  function toggleProfileSelection(profileId: string) {
    setSelectedProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((item) => item !== profileId)
        : [...current, profileId],
    )
  }

  function toggleCloudPhoneSelection(cloudPhoneId: string) {
    setSelectedCloudPhoneIds((current) =>
      current.includes(cloudPhoneId)
        ? current.filter((item) => item !== cloudPhoneId)
        : [...current, cloudPhoneId],
    )
  }

  function openCreateProfilePage() {
    setSelectedProfileId(null)
    setProfileForm(emptyProfile(proxies[0]?.id ?? null, defaultEnvironmentLanguage))
    setProfilePageMode('create')
  }

  function openEditProfilePage(profileId: string) {
    setSelectedProfileId(profileId)
    setProfilePageMode('edit')
  }

  function returnToProfileList() {
    setSelectedProfileId(null)
    setProfilePageMode('list')
  }

  function openCreateCloudPhonePage() {
    setSelectedCloudPhoneId(null)
    setCloudPhoneDetails(null)
    setCloudPhoneForm({
      ...emptyCloudPhone(settings, defaultCloudPhoneProvider),
      proxyId: proxies[0]?.id ?? null,
    })
    setCloudPhonePageMode('create')
  }

  function openEditCloudPhonePage(cloudPhoneId: string) {
    setSelectedCloudPhoneId(cloudPhoneId)
    setCloudPhonePageMode('edit')
  }

  function returnToCloudPhoneList() {
    setSelectedCloudPhoneId(null)
    setCloudPhoneDetails(null)
    setCloudPhonePageMode('list')
  }

  function loadTemplateIntoProfile(template: TemplateRecord) {
    setResourceMode('profiles')
    setSelectedProfileId(null)
    setProfilePageMode('create')
    setProfileForm({
      name: '',
      proxyId: template.proxyId,
      groupName: template.groupName,
      tagsText: template.tags.join(', '),
      notes: template.notes,
      environmentPurpose: template.environmentPurpose,
      deviceProfile: null,
      fingerprintConfig: {
        ...cloneFingerprintConfig(template.fingerprintConfig),
        runtimeMetadata: {
          ...defaultFingerprint.runtimeMetadata,
          lastValidationMessages: [],
          injectedFeatures: [],
        },
      },
    })
  }

  async function saveProfile() {
    await withBusy(
      selectedProfileId ? t.busy.updateProfile : t.busy.createProfile,
      async () => {
        if (profileForm.name.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '环境名称不能为空。' : 'Profile name is required.'}`,
          )
        }
        if (
          profileForm.fingerprintConfig.proxySettings.proxyMode === 'manager' &&
          !profileForm.proxyId
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '请选择代理管理中的代理。' : 'Select a managed proxy.'}`,
          )
        }
        if (
          profileForm.fingerprintConfig.proxySettings.proxyMode === 'custom' &&
          profileForm.fingerprintConfig.proxySettings.host.trim().length === 0
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '自定义代理主机不能为空。' : 'Custom proxy host is required.'}`,
          )
        }
        if (
          profileForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          profileForm.fingerprintConfig.basicSettings.customPlatformName.trim().length === 0
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '自定义平台名称不能为空。' : 'Custom platform name is required.'}`,
          )
        }
        if (
          profileForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          profileForm.fingerprintConfig.basicSettings.customPlatformUrl.trim().length > 0 &&
          !/^https?:\/\//i.test(profileForm.fingerprintConfig.basicSettings.customPlatformUrl.trim())
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '平台 URL 需以 http:// 或 https:// 开头。' : 'Platform URL must start with http:// or https://.'}`,
          )
        }
        const api = requireDesktopApi(['profiles.create', 'profiles.update'])
        const payload = {
          name: profileForm.name.trim(),
          proxyId:
            profileForm.fingerprintConfig.proxySettings.proxyMode === 'manager'
              ? profileForm.proxyId || null
              : null,
          groupName: profileForm.groupName,
          tags: normalizeTags(profileForm.tagsText),
          notes: profileForm.notes,
          environmentPurpose: profileForm.environmentPurpose,
          deviceProfile: profileForm.deviceProfile ?? undefined,
          fingerprintConfig: normalizeFingerprintForSave({
            ...profileForm.fingerprintConfig,
            basicSettings: {
              ...profileForm.fingerprintConfig.basicSettings,
              customPlatformName:
                profileForm.fingerprintConfig.basicSettings.platform === 'custom'
                  ? profileForm.fingerprintConfig.basicSettings.customPlatformName.trim()
                  : '',
              customPlatformUrl: profileForm.fingerprintConfig.basicSettings.customPlatformUrl.trim(),
            },
            resolution: `${profileForm.fingerprintConfig.advanced.windowWidth}x${profileForm.fingerprintConfig.advanced.windowHeight}`,
          }),
        }

        if (selectedProfileId) {
          await api.profiles.update({
            id: selectedProfileId,
            ...payload,
          })
        } else {
          await api.profiles.create(payload)
        }
        setSelectedProfileId(null)
        setProfilePageMode('list')
        setProfileForm(emptyProfile(proxies[0]?.id ?? null, defaultEnvironmentLanguage))
        setNoticeMessage(
          locale === 'zh-CN' ? '环境已保存，列表已刷新。' : 'Profile saved and list refreshed.',
        )
      },
    )
  }

  async function saveTemplate() {
    await withBusy(
      selectedTemplateId ? t.busy.updateTemplate : t.busy.createTemplate,
      async () => {
        if (templateForm.name.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '模板名称不能为空。' : 'Template name is required.'}`,
          )
        }
        if (
          templateForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          templateForm.fingerprintConfig.basicSettings.customPlatformName.trim().length === 0
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '自定义平台名称不能为空。' : 'Custom platform name is required.'}`,
          )
        }
        if (
          templateForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          templateForm.fingerprintConfig.basicSettings.customPlatformUrl.trim().length > 0 &&
          !/^https?:\/\//i.test(templateForm.fingerprintConfig.basicSettings.customPlatformUrl.trim())
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '平台 URL 需以 http:// 或 https:// 开头。' : 'Platform URL must start with http:// or https://.'}`,
          )
        }
        const api = requireDesktopApi(['templates.create', 'templates.update'])
        const payload = {
          name: templateForm.name.trim(),
          proxyId: templateForm.proxyId || null,
          groupName: templateForm.groupName,
          environmentPurpose: templateForm.environmentPurpose,
          tags: normalizeTags(templateForm.tagsText),
          notes: templateForm.notes,
          fingerprintConfig: normalizeFingerprintForSave({
            ...templateForm.fingerprintConfig,
            runtimeMetadata: {
              ...defaultFingerprint.runtimeMetadata,
              lastValidationMessages: [],
              injectedFeatures: [],
            },
            basicSettings: {
              ...templateForm.fingerprintConfig.basicSettings,
              customPlatformName:
                templateForm.fingerprintConfig.basicSettings.platform === 'custom'
                  ? templateForm.fingerprintConfig.basicSettings.customPlatformName.trim()
                  : '',
              customPlatformUrl:
                templateForm.fingerprintConfig.basicSettings.platform === 'custom'
                  ? templateForm.fingerprintConfig.basicSettings.customPlatformUrl.trim()
                  : '',
            },
            resolution: `${templateForm.fingerprintConfig.advanced.windowWidth}x${templateForm.fingerprintConfig.advanced.windowHeight}`,
          }),
        }
        if (selectedTemplateId) {
          await api.templates.update({
            id: selectedTemplateId,
            ...payload,
          })
        } else {
          await api.templates.create(payload)
        }
        setSelectedTemplateId(null)
        setTemplateForm(emptyTemplate(proxies[0]?.id ?? null))
        setNoticeMessage(
          locale === 'zh-CN' ? '模板已保存，列表已刷新。' : 'Template saved and list refreshed.',
        )
      },
    )
  }

  async function saveProxy() {
    await withBusy(
      selectedProxyId ? t.busy.updateProxy : t.busy.createProxy,
      async () => {
        if (proxyForm.name.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '代理名称不能为空。' : 'Proxy name is required.'}`,
          )
        }
        if (proxyForm.host.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '代理主机不能为空。' : 'Proxy host is required.'}`,
          )
        }
        if (!Number.isFinite(Number(proxyForm.port)) || Number(proxyForm.port) <= 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '代理端口必须大于 0。' : 'Proxy port must be greater than 0.'}`,
          )
        }
        const api = requireDesktopApi(['proxies.create', 'proxies.update'])
        const payload = { ...proxyForm, port: Number(proxyForm.port) }
        if (selectedProxyId) {
          await api.proxies.update({ id: selectedProxyId, ...payload })
        } else {
          await api.proxies.create(payload)
        }
        setSelectedProxyId(null)
        setProxyPanelOpen(false)
        setProxyPanelMode('create')
        setProxyForm(emptyProxy())
        setNoticeMessage(
          locale === 'zh-CN' ? '代理已保存，列表已刷新。' : 'Proxy saved and list refreshed.',
        )
      },
    )
  }

  async function testProxy(proxyId: string) {
    setTestingProxyId(proxyId)
    setErrorMessage('')
    setNoticeMessage('')
    setProxyRowFeedback((current) => {
      const next = { ...current }
      delete next[proxyId]
      return next
    })
    try {
      const api = requireDesktopApi(['proxies.test'])
      await api.proxies.test(proxyId)
      setProxyRowFeedback((current) => ({
        ...current,
        [proxyId]: {
          kind: 'success',
          message: locale === 'zh-CN' ? '测试通过' : 'Passed',
        },
      }))
    } catch (error) {
      const message = localizeError(error)
      setProxyRowFeedback((current) => ({
        ...current,
        [proxyId]: {
          kind: 'error',
          message: locale === 'zh-CN' ? `测试失败：${message}` : `Failed: ${message}`,
        },
      }))
    } finally {
      setTestingProxyId(null)
      window.setTimeout(() => {
        setProxyRowFeedback((current) => {
          const next = { ...current }
          delete next[proxyId]
          return next
        })
      }, 3000)
      await refreshAll()
    }
  }

  async function launchProfile(profileId: string) {
    setPendingProfileLaunches((current) => ({ ...current, [profileId]: Date.now() }))
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['runtime.launch'])
      await api.runtime.launch(profileId)
      setNoticeMessage(locale === 'zh-CN' ? '环境已加入启动队列。' : 'Profile queued for launch.')
      await refreshAll()
    } catch (error) {
      setPendingProfileLaunches((current) => {
        const next = { ...current }
        delete next[profileId]
        return next
      })
      setErrorMessage(localizeError(error))
    }
  }

  async function stopProfile(profileId: string) {
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['runtime.stop'])
      await api.runtime.stop(profileId)
      setPendingProfileLaunches((current) => {
        const next = { ...current }
        delete next[profileId]
        return next
      })
      setNoticeMessage(locale === 'zh-CN' ? '环境已停止。' : 'Profile stopped.')
      await refreshAll()
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function transitionProfilePurpose(profile: ProfileRecord, targetPurpose: EnvironmentPurpose) {
    if (profile.environmentPurpose === targetPurpose) {
      return
    }
    const next = applyEnvironmentPurposePresetToForm(
      cloneFingerprintConfig(profile.fingerprintConfig),
      targetPurpose,
    )
    await withBusy(
      locale === 'zh-CN'
        ? `正在迁移到${getEnvironmentPurposeLabel(targetPurpose, locale)}...`
        : `Migrating to ${getEnvironmentPurposeLabel(targetPurpose, locale)}...`,
      async () => {
        const api = requireDesktopApi(['profiles.update'])
        await api.profiles.update({
          id: profile.id,
          name: profile.name,
          proxyId: profile.proxyId,
          groupName: profile.groupName,
          tags: profile.tags,
          notes: profile.notes,
          environmentPurpose: next.environmentPurpose,
          deviceProfile: profile.deviceProfile,
          fingerprintConfig: normalizeFingerprintForSave({
            ...next.fingerprintConfig,
            resolution: `${next.fingerprintConfig.advanced.windowWidth}x${next.fingerprintConfig.advanced.windowHeight}`,
          }),
        })
        setNoticeMessage(
          locale === 'zh-CN'
            ? `环境已迁移到${getEnvironmentPurposeLabel(targetPurpose, locale)}。`
            : `Profile migrated to ${getEnvironmentPurposeLabel(targetPurpose, locale)}.`,
        )
      },
    )
  }

  function getProfileVisualState(profile: ProfileRecord): ProfileRecord['status'] {
    if (pendingProfileLaunches[profile.id] || runtimeQueuedIds.has(profile.id) || runtimeStartingIds.has(profile.id)) {
      return 'starting'
    }
    return profile.status
  }

  function openCreateProxyPanel() {
    setSelectedProxyId(null)
    setProxyPanelMode('create')
    setProxyForm(emptyProxy())
    setProxyPanelOpen((current) => {
      if (!current) {
        return true
      }
      return proxyPanelMode === 'create' ? false : true
    })
  }

  function openEditProxyPanel(proxyId: string) {
    setSelectedProxyId(proxyId)
    setProxyPanelMode('edit')
    setProxyPanelOpen(true)
  }

  function closeProxyPanel() {
    setProxyPanelOpen(false)
    setProxyPanelMode('create')
    setSelectedProxyId(null)
    setProxyForm(emptyProxy())
  }

  async function checkForUpdates(manual = true) {
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['updater.check'])
      const nextState = await api.updater.check()
      setUpdateState(nextState)
      if (manual && nextState.status === 'not-available') {
        setNoticeMessage(locale === 'zh-CN' ? '当前已是最新版本。' : 'You already have the latest version.')
      }
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function downloadUpdate() {
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['updater.download'])
      const nextState = await api.updater.download()
      setUpdateState(nextState)
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function installUpdate() {
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['updater.install'])
      const result = await api.updater.install()
      setNoticeMessage(result.message)
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function openReleasePage() {
    try {
      const api = requireDesktopApi(['updater.openReleasePage'])
      await api.updater.openReleasePage()
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function saveSettings() {
    await withBusy(t.busy.saveSettings, async () => {
      const api = requireDesktopApi(['settings.set'])
      await api.settings.set(settings)
      setNoticeMessage(locale === 'zh-CN' ? '设置已保存。' : 'Settings saved.')
    })
  }

  async function saveCloudPhone() {
    await withBusy(
      selectedCloudPhoneId ? t.busy.updateCloudPhone : t.busy.createCloudPhone,
      async () => {
        if (cloudPhoneForm.name.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '云手机环境名称不能为空。' : 'Cloud phone name is required.'}`,
          )
        }
        if (cloudPhoneForm.proxyRefMode === 'saved') {
          if (!cloudPhoneForm.proxyId) {
            throw new Error(
              `VALIDATION:${locale === 'zh-CN' ? '请选择已保存代理。' : 'Select a saved proxy.'}`,
            )
          }
        } else {
          if (cloudPhoneForm.proxyHost.trim().length === 0) {
            throw new Error(
              `VALIDATION:${locale === 'zh-CN' ? '代理主机不能为空。' : 'Proxy host is required.'}`,
            )
          }
          if (cloudPhoneForm.proxyPort <= 0) {
            throw new Error(
              `VALIDATION:${locale === 'zh-CN' ? '代理端口必须大于 0。' : 'Proxy port must be greater than 0.'}`,
            )
          }
          if (cloudPhoneForm.proxyUsername.trim().length === 0) {
            throw new Error(
              `VALIDATION:${locale === 'zh-CN' ? '代理账号不能为空。' : 'Proxy username is required.'}`,
            )
          }
          if (cloudPhoneForm.proxyPassword.trim().length === 0) {
            throw new Error(
              `VALIDATION:${locale === 'zh-CN' ? '代理密码不能为空。' : 'Proxy password is required.'}`,
            )
          }
        }

        const api = requireDesktopApi(['cloudPhones.create', 'cloudPhones.update'])
        const payload = {
          ...cloudPhoneForm,
          name: cloudPhoneForm.name.trim(),
          groupName: cloudPhoneForm.groupName.trim(),
          tags: cloudPhoneForm.tags,
          notes: cloudPhoneForm.notes.trim(),
          providerKind: providerKindForKey(cloudPhoneForm.providerKey),
          providerConfig: buildProviderConfig(
            cloudPhoneForm.providerKey,
            settings,
            cloudPhoneForm.providerConfig,
          ),
          proxyRefMode: cloudPhoneForm.proxyRefMode,
          proxyId: cloudPhoneForm.proxyRefMode === 'saved' ? cloudPhoneForm.proxyId : null,
          proxyHost: cloudPhoneForm.proxyHost.trim(),
          proxyUsername: cloudPhoneForm.proxyUsername.trim(),
        }

        if (selectedCloudPhoneId) {
          await api.cloudPhones.update({
            id: selectedCloudPhoneId,
            ...payload,
          })
        } else {
          await api.cloudPhones.create(payload)
        }
        setSelectedCloudPhoneId(null)
        setCloudPhonePageMode('list')
        setCloudPhoneDetails(null)
        setCloudPhoneForm(emptyCloudPhone(settings, defaultCloudPhoneProvider))
        setNoticeMessage(
          locale === 'zh-CN'
            ? '云手机环境已保存，列表已刷新。'
            : 'Cloud phone environment saved and list refreshed.',
        )
      },
    )
  }

  async function testCloudPhoneProxy() {
    await withBusy(t.busy.testCloudPhoneProxy, async () => {
      if (cloudPhoneForm.proxyRefMode === 'saved' && !cloudPhoneForm.proxyId) {
        throw new Error(
          `VALIDATION:${locale === 'zh-CN' ? '请选择已保存代理。' : 'Select a saved proxy.'}`,
        )
      }
      const api = requireDesktopApi(['cloudPhones.testProxy'])
      const result = await api.cloudPhones.testProxy(cloudPhoneForm)
      setNoticeMessage(result.message)
    })
  }

  async function runCloudPhoneBulkDelete() {
    if (selectedCloudPhoneIds.length === 0) {
      return
    }
    if (!window.confirm(t.common.confirmDeleteMany(selectedCloudPhoneIds.length))) {
      return
    }
    await withBusy(t.busy.bulkDeleteCloudPhones, async () => {
      const api = requireDesktopApi(['cloudPhones.bulkDelete'])
      await api.cloudPhones.bulkDelete({ cloudPhoneIds: selectedCloudPhoneIds })
      setSelectedCloudPhoneIds([])
      setNoticeMessage(
        locale === 'zh-CN'
          ? `已删除 ${selectedCloudPhoneIds.length} 个云手机环境。`
          : `Deleted ${selectedCloudPhoneIds.length} cloud phone environments.`,
      )
    })
  }

  async function runBulkDelete() {
    if (selectedProfileIds.length === 0) {
      return
    }
    if (!window.confirm(t.common.confirmDeleteMany(selectedProfileIds.length))) {
      return
    }
    await withBusy(t.busy.bulkDelete, async () => {
      const api = requireDesktopApi(['profiles.bulkDelete'])
      await api.profiles.bulkDelete({ profileIds: selectedProfileIds })
      setSelectedProfileIds([])
      setNoticeMessage(
        locale === 'zh-CN'
          ? `已删除 ${selectedProfileIds.length} 个环境。`
          : `Deleted ${selectedProfileIds.length} profiles.`,
      )
    })
  }

  function updateCloudPhoneProvider(providerKey: string) {
    setCloudPhoneForm((current) => ({
      ...current,
      providerKey,
      providerKind: providerKindForKey(providerKey),
      providerConfig: buildProviderConfig(providerKey, settings, current.providerConfig),
    }))
    setCloudPhoneDetails(null)
  }

  function updateCloudPhoneProxyRefMode(proxyRefMode: CloudPhoneProxyRefMode) {
    setCloudPhoneForm((current) => {
      if (proxyRefMode === 'saved') {
        return {
          ...current,
          proxyRefMode,
          proxyId: current.proxyId ?? proxies[0]?.id ?? null,
        }
      }
      return {
        ...current,
        proxyRefMode,
        proxyId: null,
      }
    })
  }

  function renderProviderLabel(providerKey: string): string {
    if (locale === 'zh-CN') {
      if (providerKey === 'self-hosted') return t.cloudPhones.providerSelfHosted
      if (providerKey === 'third-party') return t.cloudPhones.providerThirdParty
      if (providerKey === 'local-emulator') return t.cloudPhones.providerLocalEmulator
      if (providerKey === 'mock') return t.cloudPhones.providerMock
    }
    const provider = cloudPhoneProviderMap.get(providerKey)
    return provider?.label ?? providerKey
  }

  async function handleDesktopLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthSubmitting(true)
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['auth.login'])
      const nextAuthState = await api.auth.login({
        identifier: authIdentifier,
        password: authPassword,
      })
      setAuthState(nextAuthState)
      setAuthPassword('')
      await refreshAll()
    } catch (error) {
      setErrorMessage(localizeError(error))
    } finally {
      setAuthSubmitting(false)
    }
  }

  async function handleDesktopLogout() {
    try {
      const api = requireDesktopApi(['auth.logout'])
      const nextAuthState = await api.auth.logout()
      setAuthState(nextAuthState)
      setProfiles([])
      setSummary({
        totalProfiles: 0,
        runningProfiles: 0,
        totalProxies: 0,
        onlineProxies: 0,
        totalCloudPhones: 0,
        runningCloudPhones: 0,
        cloudPhoneErrors: 0,
        logCount: 0,
      })
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function saveAccountProfile() {
    await withBusy(locale === 'zh-CN' ? '正在更新个人资料...' : 'Updating account profile...', async () => {
      if (!accountProfileForm.email.trim() && !accountProfileForm.username.trim()) {
        throw new Error(
          `VALIDATION:${locale === 'zh-CN' ? '邮箱和账号至少需要保留一个。' : 'Email or username is required.'}`,
        )
      }
      const api = requireDesktopApi(['auth.updateProfile'])
      const nextAuthState = await api.auth.updateProfile({
        name: accountProfileForm.name.trim(),
        email: accountProfileForm.email.trim(),
        username: accountProfileForm.username.trim(),
        avatarUrl: accountProfileForm.avatarUrl.trim(),
        bio: accountProfileForm.bio.trim(),
      })
      setAuthState(nextAuthState)
      setNoticeMessage(locale === 'zh-CN' ? '个人资料已更新。' : 'Account profile updated.')
    })
  }

  async function saveAccountPassword() {
    await withBusy(locale === 'zh-CN' ? '正在修改密码...' : 'Changing password...', async () => {
      if (!accountPasswordForm.currentPassword || !accountPasswordForm.nextPassword) {
        throw new Error(
          `VALIDATION:${locale === 'zh-CN' ? '请输入当前密码和新密码。' : 'Current password and new password are required.'}`,
        )
      }
      if (accountPasswordForm.nextPassword.length < 6) {
        throw new Error(
          `VALIDATION:${locale === 'zh-CN' ? '新密码至少需要 6 位。' : 'New password must be at least 6 characters.'}`,
        )
      }
      if (accountPasswordForm.nextPassword !== accountPasswordForm.confirmPassword) {
        throw new Error(
          `VALIDATION:${locale === 'zh-CN' ? '两次输入的新密码不一致。' : 'Password confirmation does not match.'}`,
        )
      }
      const api = requireDesktopApi(['auth.changePassword'])
      await api.auth.changePassword({
        currentPassword: accountPasswordForm.currentPassword,
        nextPassword: accountPasswordForm.nextPassword,
      })
      setAccountPasswordForm(emptyAccountPasswordForm())
      setNoticeMessage(locale === 'zh-CN' ? '密码已修改。' : 'Password changed successfully.')
    })
  }

  async function uploadAccountAvatar() {
    await withBusy(locale === 'zh-CN' ? '正在上传头像...' : 'Uploading avatar...', async () => {
      const api = requireDesktopApi(['auth.uploadAvatar'])
      const nextAuthState = await api.auth.uploadAvatar()
      setAuthState(nextAuthState)
      setNoticeMessage(locale === 'zh-CN' ? '头像已更新。' : 'Avatar updated.')
    })
  }

  async function revokeAccountDevice(deviceId: string) {
    const confirmMessage =
      deviceId === currentDeviceId
        ? locale === 'zh-CN'
          ? '确认踢下当前设备吗？执行后当前桌面端会立即退出登录。'
          : 'Revoke current device? This desktop app will be logged out immediately.'
        : locale === 'zh-CN'
          ? '确认踢下这个设备吗？'
          : 'Revoke this device?'
    if (!window.confirm(confirmMessage)) {
      return
    }
    await withBusy(locale === 'zh-CN' ? '正在踢下线设备...' : 'Revoking device...', async () => {
      const api = requireDesktopApi(['auth.revokeDevice'])
      const nextAuthState = await api.auth.revokeDevice(deviceId)
      setAuthState(nextAuthState)
      if (deviceId === currentDeviceId) {
        setProfiles([])
        setView('dashboard')
        setNoticeMessage(locale === 'zh-CN' ? '当前设备已被踢下线，请重新登录。' : 'Current device was revoked. Please log in again.')
        return
      }
      setNoticeMessage(locale === 'zh-CN' ? '设备已踢下线。' : 'Device revoked.')
    })
  }

  async function deleteAccountDevice(deviceId: string) {
    const confirmMessage =
      deviceId === currentDeviceId
        ? locale === 'zh-CN'
          ? '确认删除当前设备吗？执行后当前桌面端会立即退出登录。'
          : 'Delete current device? This desktop app will be logged out immediately.'
        : locale === 'zh-CN'
          ? '确认删除这个设备吗？删除后该设备记录会被移除。'
          : 'Delete this device? Its record will be removed.'
    if (!window.confirm(confirmMessage)) {
      return
    }
    await withBusy(locale === 'zh-CN' ? '正在删除设备...' : 'Deleting device...', async () => {
      const api = requireDesktopApi(['auth.deleteDevice'])
      const nextAuthState = await api.auth.deleteDevice(deviceId)
      setAuthState(nextAuthState)
      if (deviceId === currentDeviceId) {
        setProfiles([])
        setView('dashboard')
        setNoticeMessage(locale === 'zh-CN' ? '当前设备已删除，请重新登录。' : 'Current device was deleted. Please log in again.')
        return
      }
      setNoticeMessage(locale === 'zh-CN' ? '设备已删除。' : 'Device deleted.')
    })
  }

  if (!authReady) {
    return <div className="auth-shell">正在初始化桌面端...</div>
  }

  if (!authState?.authenticated) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-badge">Duokai</div>
          <h1>登录工作台</h1>
          <p>登录后将与控制台共享同一套云端环境数据。</p>
          {errorMessage ? <div className="banner error">{errorMessage}</div> : null}
          <form className="auth-form" onSubmit={handleDesktopLogin}>
            <label>
              <span>账号</span>
              <input
                value={authIdentifier}
                onChange={(event) => setAuthIdentifier(event.target.value)}
                placeholder="请输入邮箱或账号"
              />
            </label>
            <label>
              <span>密码</span>
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="请输入密码"
              />
            </label>
            <button type="submit" className="primary auth-submit" disabled={authSubmitting}>
              {authSubmitting ? '登录中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <strong>{t.appName}</strong>
            <span>{currentAuthUser?.username || currentAuthUser?.email || t.appTagline}</span>
          </div>
        </div>

        <nav className="nav">
          {views.map((item) => (
            <button
              key={item.key}
              className={item.key === view ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="sidebar-card sidebar-user-card"
          onClick={() => setView('account')}
        >
          <span className="sidebar-user-avatar">
            {(currentAuthUser?.name || currentAuthUser?.username || currentAuthUser?.email || 'U')
              .slice(0, 1)
              .toUpperCase()}
          </span>
          <div className="sidebar-user-meta">
            <h3>{currentAuthUser?.name || currentAuthUser?.username || currentAuthUser?.email}</h3>
            <p>{currentAuthUser?.email || currentAuthUser?.username || t.common.loading}</p>
            <p>{locale === 'zh-CN' ? '点击进入个人中心' : 'Open personal center'}</p>
          </div>
        </button>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>{pageHeading.title}</h1>
            <p>{pageHeading.subtitle}</p>
          </div>
          <div className="topbar-actions">
            <div className="status-pill">
              {busyMessage || t.common.runningSummary(summary.runningProfiles, summary.totalProfiles)}
            </div>
            <button type="button" className="secondary-button logout-button" onClick={handleDesktopLogout}>
              退出登录
            </button>
          </div>
        </header>

        {errorMessage ? <div className="banner error">{errorMessage}</div> : null}
        {!errorMessage && agentReadOnlyMessage ? <div className="banner warning">{agentReadOnlyMessage}</div> : null}
        {!errorMessage && noticeMessage ? <div className="toast success">{noticeMessage}</div> : null}
        {updateState && (updateState.status === 'available' || updateState.status === 'downloading' || updateState.status === 'downloaded') ? (
          <div className="banner info updater-banner">
            <div>
              <strong>
                {locale === 'zh-CN'
                  ? `桌面端更新 ${updateState.latestVersion || ''}`
                  : `Desktop update ${updateState.latestVersion || ''}`}
              </strong>
              <p>{describeUpdateStatus(updateState)}</p>
            </div>
            <div className="updater-banner-actions">
              <button
                type="button"
                className="primary"
                onClick={() => void handlePrimaryUpdateAction()}
                disabled={updateState.status === 'downloading'}
              >
                {getUpdateActionLabel(updateState)}
              </button>
              <button type="button" className="secondary-button" onClick={() => void openReleasePage()}>
                {locale === 'zh-CN' ? '发布页' : 'Release page'}
              </button>
            </div>
          </div>
        ) : null}

        {view === 'dashboard' ? (
          <section className="panel-grid">
            <article className="metric-card">
              <span>{t.dashboard.profiles}</span>
              <strong>{summary.totalProfiles}</strong>
              <small>{t.common.activeNow(summary.runningProfiles)}</small>
            </article>
            <article className="metric-card">
              <span>{t.dashboard.proxies}</span>
              <strong>{summary.totalProxies}</strong>
              <small>
                {summary.onlineProxies} {t.common.healthy}
              </small>
            </article>
            <article className="metric-card">
              <span>{t.dashboard.templates}</span>
              <strong>{templates.length}</strong>
              <small>{t.profiles.fromTemplate}</small>
            </article>
            <article className="metric-card">
              <span>{t.cloudPhones.title}</span>
              <strong>{summary.totalCloudPhones}</strong>
              <small>{t.common.activeNow(summary.runningCloudPhones)}</small>
            </article>
            <article className="metric-card">
              <span>{t.cloudPhones.defaultProviderHealth}</span>
              <strong>
                {defaultCloudPhoneProviderHealth
                  ? defaultCloudPhoneProviderHealth.available
                    ? t.common.ready
                    : t.common.missing
                  : t.common.loading}
              </strong>
              <small>
                {defaultCloudPhoneProviderHealth?.message ?? renderProviderLabel(defaultCloudPhoneProvider)}
              </small>
            </article>
            <article className="metric-card">
              <span>{t.dashboard.chromium}</span>
              <strong>
                {directoryInfo?.chromiumExecutable ? t.common.ready : t.common.missing}
              </strong>
              <small>{directoryInfo?.chromiumExecutable ?? t.dashboard.installChromium}</small>
            </article>
            <section className="metric-card metric-card-compact status-summary-card">
              <div className="status-summary-row">
                <span>{locale === 'zh-CN' ? '运行宿主' : 'Runtime host'}</span>
                <strong>
                  {runtimeHostInfo
                    ? runtimeHostInfo.available
                      ? runtimeHostInfo.label
                      : locale === 'zh-CN'
                        ? '降级'
                        : 'Fallback'
                    : t.common.loading}
                </strong>
                <small>
                  {runtimeHostInfo
                    ? `${runtimeHostInfo.reason} · ${locale === 'zh-CN' ? '运行中' : 'Running'} ${
                        runtimeStatus?.runningProfileIds.length ?? 0
                      } · ${locale === 'zh-CN' ? '排队' : 'Queued'} ${
                        runtimeStatus?.queuedProfileIds.length ?? 0
                      }`
                    : t.common.loading}
                </small>
              </div>
              <div className="status-summary-row">
                <span>{locale === 'zh-CN' ? '网络检查' : 'Network check'}</span>
                <strong>
                  {latestNetworkCheck
                    ? latestNetworkCheck.success === false
                      ? locale === 'zh-CN'
                        ? '失败'
                        : 'Failed'
                      : locale === 'zh-CN'
                        ? '正常'
                        : 'Ready'
                    : t.common.loading}
                </strong>
                <small>
                  {latestNetworkCheck
                    ? `${latestNetworkCheck.profileName} · ${
                        latestNetworkCheck.ip || (locale === 'zh-CN' ? '未解析' : 'unresolved')
                      } · ${
                        latestNetworkCheck.country || (locale === 'zh-CN' ? '未知地区' : 'unknown')
                      } · ${
                        latestNetworkCheck.timezone ||
                        (locale === 'zh-CN' ? '未生成时区' : 'timezone pending')
                      }`
                    : locale === 'zh-CN'
                      ? '最近一次代理/出口检查结果。'
                      : 'Latest proxy/egress check result.'}
                </small>
              </div>
            </section>
            <section className="wide-card">
              <div className="section-title">
                <h2>{t.dashboard.recentLogs}</h2>
              </div>
              <div className="log-list">
                {logs.slice(0, 8).map((entry) => (
                  <div key={entry.id} className={`log-row ${entry.level}`}>
                    <span>{translateLogCategory(locale, entry.category)}</span>
                    <p>{entry.message}</p>
                    <time>{formatDate(entry.createdAt)}</time>
                  </div>
                ))}
                {logs.length === 0 ? <p className="empty">{t.dashboard.noLogs}</p> : null}
              </div>
            </section>
          </section>
        ) : null}

        {view === 'profiles' ? (
          <section
            className={
              resourceMode === 'templates' ? 'workspace workspace-wide' : 'workspace workspace-single'
            }
          >
            {showProfileWorkspaceList || showTemplateWorkspace ? (
            <div className="list-card">
              <div className="section-title">
                <h2>{t.profiles.title}</h2>
                <div className="section-title-actions">
                  <div className="chip-row">
                    <button
                      className={resourceMode === 'profiles' ? 'chip active' : 'chip'}
                      onClick={() => setResourceMode('profiles')}
                    >
                      {t.profiles.manageProfiles}
                    </button>
                    <button
                      className={resourceMode === 'templates' ? 'chip active' : 'chip'}
                      onClick={() => setResourceMode('templates')}
                    >
                      {t.profiles.manageTemplates}
                    </button>
                  </div>
                  {resourceMode === 'profiles' ? (
                    <button className="primary" onClick={openCreateProfilePage}>
                      {t.profiles.createProfile}
                    </button>
                  ) : null}
                </div>
              </div>

              {resourceMode === 'profiles' ? (
                <>
                  <div className="toolbar">
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder={`${t.common.search}...`}
                    />
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                    >
                      <option value="all">{t.profiles.statusFilter}: {t.common.all}</option>
                      <option value="queued">{translateStatus(locale, 'queued')}</option>
                      <option value="starting">{translateStatus(locale, 'starting')}</option>
                      <option value="running">{translateStatus(locale, 'running')}</option>
                      <option value="idle">{translateStatus(locale, 'idle')}</option>
                      <option value="stopped">{translateStatus(locale, 'stopped')}</option>
                      <option value="error">{translateStatus(locale, 'error')}</option>
                    </select>
                    <select
                      value={groupFilter}
                      onChange={(event) => setGroupFilter(event.target.value)}
                    >
                      <option value="all">{t.profiles.groupFilter}: {t.common.all}</option>
                      {groupOptions.map((groupName) => (
                        <option key={groupName} value={groupName}>
                          {groupName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="batch-toolbar">
                    <span>{t.profiles.selectedCount(selectedProfileIds.length)}</span>
                    <button
                      className="secondary"
                      disabled={selectedProfileIds.length === 0}
                      onClick={() =>
                        void withBusy(t.busy.bulkStart, async () => {
                          const api = requireDesktopApi(['profiles.bulkStart'])
                          await api.profiles.bulkStart({
                            profileIds: selectedProfileIds,
                          })
                          setNoticeMessage(
                            locale === 'zh-CN'
                              ? `已将 ${selectedProfileIds.length} 个环境加入启动队列。`
                              : `Queued ${selectedProfileIds.length} profiles for launch.`,
                          )
                        })
                      }
                    >
                      {t.profiles.batchStart}
                    </button>
                    <button
                      className="secondary"
                      disabled={selectedProfileIds.length === 0}
                      onClick={() =>
                        void withBusy(t.busy.bulkStop, async () => {
                          const api = requireDesktopApi(['profiles.bulkStop'])
                          await api.profiles.bulkStop({
                            profileIds: selectedProfileIds,
                          })
                          setNoticeMessage(
                            locale === 'zh-CN'
                              ? `已停止 ${selectedProfileIds.length} 个环境。`
                              : `Stopped ${selectedProfileIds.length} profiles.`,
                          )
                        })
                      }
                    >
                      {t.profiles.batchStop}
                    </button>
                    <input
                      value={batchGroupName}
                      onChange={(event) => setBatchGroupName(event.target.value)}
                      placeholder={t.profiles.group}
                    />
                    <button
                      className="secondary"
                      disabled={selectedProfileIds.length === 0 || batchGroupName.trim().length === 0}
                      onClick={() =>
                        void withBusy(t.busy.bulkAssignGroup, async () => {
                          const api = requireDesktopApi(['profiles.bulkAssignGroup'])
                          await api.profiles.bulkAssignGroup({
                            profileIds: selectedProfileIds,
                            groupName: batchGroupName.trim(),
                          })
                          setBatchGroupName('')
                          setNoticeMessage(
                            locale === 'zh-CN'
                              ? '批量分组已更新。'
                              : 'Bulk group assignment updated.',
                          )
                        })
                      }
                    >
                      {t.profiles.batchAssignGroup}
                    </button>
                    <button
                      className="danger"
                      disabled={selectedProfileIds.length === 0}
                      onClick={() => void runBulkDelete()}
                    >
                      {t.profiles.batchDelete}
                    </button>
                  </div>

                  {Object.entries(groupedProfiles).map(([groupName, items]) => (
                    <div key={groupName} className="profile-group">
                      <h3>{groupName}</h3>
                      {items.map((profile) => {
                        const visualStatus = getProfileVisualState(profile)
                        const showLaunching = visualStatus === 'starting' || visualStatus === 'queued'
                        const isActive =
                          visualStatus === 'running' || visualStatus === 'starting' || visualStatus === 'queued'
                        const launchPhaseLabel = getLaunchPhaseLabel(profile)
                        const launchPhaseClass = getLaunchPhaseClass(profile)
                        const storageSyncSummary = getStorageSyncSummary(profile)

                        return (
                          <article key={profile.id} className="list-row list-row-compact">
                            <label className="check-cell">
                              <input
                                type="checkbox"
                                checked={selectedProfileIds.includes(profile.id)}
                                onChange={() => toggleProfileSelection(profile.id)}
                              />
                            </label>
                            <div className="list-main">
                              <strong>{profile.name}</strong>
                        <p>
                          {profile.tags.join(', ') || t.common.noTags}
                          {profile.fingerprintConfig.runtimeMetadata.lastResolvedIp
                            ? ` · IP ${profile.fingerprintConfig.runtimeMetadata.lastResolvedIp} · ${profile.fingerprintConfig.runtimeMetadata.lastResolvedCountry || profile.fingerprintConfig.runtimeMetadata.lastResolvedRegion || profile.fingerprintConfig.runtimeMetadata.lastResolvedTimezone}`
                            : ''}
                        </p>
                        <p>
                          {getEnvironmentPurposeLabel(profile.environmentPurpose, locale)}
                          {` · ${summarizeDeviceProfile(profile.deviceProfile, profile.fingerprintConfig)}`}
                        </p>
                        <p className="section-note">{getEnvironmentPurposeSummary(profile.environmentPurpose, locale)}</p>
                        <p className="section-note">
                          {locale === 'zh-CN' ? '身份签名：' : 'Identity: '}
                          {summarizeIdentitySignature(profile.deviceProfile, profile.fingerprintConfig)}
                        </p>
                        <p className="section-note">
                          {locale === 'zh-CN' ? '地区签名：' : 'Locale: '}
                          {summarizeLocaleSignature(profile.deviceProfile, profile.fingerprintConfig)}
                        </p>
                        <p className="section-note">
                          {locale === 'zh-CN' ? '硬件签名：' : 'Hardware: '}
                          {summarizeHardwareSignature(profile.deviceProfile, profile.fingerprintConfig)}
                        </p>
                        <p className="section-note">
                          {locale === 'zh-CN' ? '阶段轨迹：' : 'Lifecycle: '}
                          {getLifecycleStageSummary(profile, locale)}
                        </p>
                        <p className="section-note">
                          {locale === 'zh-CN' ? 'Workspace 快照：' : 'Workspace snapshots: '}
                          {getSnapshotSummaryLine(profile)}
                        </p>
                        <p className="section-note">
                          {locale === 'zh-CN' ? '隔离信任：' : 'Isolation trust: '}
                          {getTrustSummaryLine(profile)}
                        </p>
                        {profile.environmentPurpose === 'register' ? (
                          <p className="section-note">
                            {locale === 'zh-CN'
                              ? `注册风险：${getRegistrationRiskLabel(
                                  profile.fingerprintConfig.runtimeMetadata.lastRegistrationRiskLevel,
                                  locale,
                                )} · ${profile.fingerprintConfig.runtimeMetadata.lastRegistrationRiskScore} 分`
                              : `Registration risk: ${getRegistrationRiskLabel(
                                  profile.fingerprintConfig.runtimeMetadata.lastRegistrationRiskLevel,
                                  locale,
                                )} · ${profile.fingerprintConfig.runtimeMetadata.lastRegistrationRiskScore} points`}
                            {profile.fingerprintConfig.runtimeMetadata.lastRegistrationRiskFactors.length > 0
                              ? ` · ${profile.fingerprintConfig.runtimeMetadata.lastRegistrationRiskFactors.join(' ')}`
                              : ''}
                          </p>
                        ) : null}
                        {profile.fingerprintConfig.runtimeMetadata.lastValidationLevel !== 'unknown' ? (
                          <p>
                            {locale === 'zh-CN' ? '最近校验' : 'Latest validation'}
                                  {`: ${profile.fingerprintConfig.runtimeMetadata.lastValidationLevel}`}
                                  {profile.fingerprintConfig.runtimeMetadata.lastValidationMessages.length > 0
                                    ? ` · ${profile.fingerprintConfig.runtimeMetadata.lastValidationMessages.join(' ')}`
                                    : ''}
                                </p>
                              ) : null}
                              {storageSyncSummary ? (
                                <div className={`storage-sync-note ${storageSyncSummary.className}`}>
                                  <span className="storage-sync-note-label">{storageSyncSummary.label}</span>
                                  <span>{storageSyncSummary.detail}</span>
                                </div>
                              ) : null}
                            </div>
                            <div className="list-meta">
                              <span className={`badge ${showLaunching ? launchPhaseClass : visualStatus}`}>
                                {showLaunching ? (
                                  <span className="status-with-spinner">
                                    <span className={`status-spinner ${launchPhaseClass}`} />
                                    {launchPhaseLabel}
                                  </span>
                                ) : (
                                  translateStatus(locale, visualStatus)
                                )}
                              </span>
                              <button className="ghost" onClick={() => openEditProfilePage(profile.id)}>
                                {t.common.edit}
                              </button>
                              <button
                                className="ghost"
                                onClick={() =>
                                  void withBusy(t.busy.cloneProfile, async () => {
                                    const api = requireDesktopApi(['profiles.clone'])
                                    await api.profiles.clone(profile.id)
                                    setNoticeMessage(
                                      locale === 'zh-CN' ? '环境已克隆。' : 'Profile cloned.',
                                    )
                                  })
                                }
                              >
                                {t.common.clone}
                              </button>
                              {profile.environmentPurpose === 'register' ? (
                                <button
                                  className="ghost"
                                  disabled={isActive}
                                  onClick={() => void transitionProfilePurpose(profile, 'nurture')}
                                >
                                  {locale === 'zh-CN' ? '迁移养号' : 'Move to nurture'}
                                </button>
                              ) : null}
                              {profile.environmentPurpose === 'nurture' ? (
                                <button
                                  className="ghost"
                                  disabled={isActive}
                                  onClick={() => void transitionProfilePurpose(profile, 'operation')}
                                >
                                  {locale === 'zh-CN' ? '转为运营' : 'Move to operation'}
                                </button>
                              ) : null}
                              {showLaunching ? (
                                <button
                                  className="primary launch-button is-launching"
                                  disabled
                                >
                                  <span className="status-with-spinner">
                                    <span className="status-spinner" />
                                    {locale === 'zh-CN' ? '启动中' : 'Starting'}
                                  </span>
                                </button>
                              ) : isActive ? (
                                <button className="danger" onClick={() => void stopProfile(profile.id)}>
                                  {t.common.stop}
                                </button>
                              ) : (
                                <button
                                  className={`primary launch-button ${showLaunching ? 'is-launching' : ''}`}
                                  onClick={() => void launchProfile(profile.id)}
                                >
                                  {profile.status === 'error'
                                    ? (locale === 'zh-CN' ? '重试启动' : 'Retry launch')
                                    : t.common.launch}
                                </button>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ))}

                  {filteredProfiles.length === 0 ? <p className="empty">{t.profiles.firstProfile}</p> : null}
                </>
              ) : (
                <>
                  <div className="section-note">{t.profiles.createFromTemplateHint}</div>
                  {templates.map((template) => (
                    <article key={template.id} className="list-row">
                      <div className="list-main">
                        <strong>{template.name}</strong>
                        <p>
                          {[
                            getEnvironmentPurposeLabel(template.environmentPurpose, locale),
                            template.tags.join(', ') || t.common.noTags,
                          ].join(' · ')}
                        </p>
                        <p className="section-note">
                          {locale === 'zh-CN'
                            ? `平台模板：${getPlatformTemplateSummary(template.fingerprintConfig.basicSettings.platform, locale)}`
                            : `Platform template: ${getPlatformTemplateSummary(template.fingerprintConfig.basicSettings.platform, locale)}`}
                        </p>
                        <p className="section-note">
                          {locale === 'zh-CN'
                            ? `平台策略：${getPlatformStrategySummary(template.fingerprintConfig.basicSettings.platform, locale)}`
                            : `Platform strategy: ${getPlatformStrategySummary(template.fingerprintConfig.basicSettings.platform, locale)}`}
                        </p>
                        <p className="section-note">
                          {locale === 'zh-CN' ? '身份签名：' : 'Identity: '}
                          {summarizeIdentitySignature(null, template.fingerprintConfig)}
                        </p>
                        <p className="section-note">
                          {locale === 'zh-CN' ? '地区签名：' : 'Locale: '}
                          {summarizeLocaleSignature(null, template.fingerprintConfig)}
                        </p>
                      </div>
                      <div className="list-meta">
                        <button className="ghost" onClick={() => setSelectedTemplateId(template.id)}>
                          {t.common.edit}
                        </button>
                        <button
                          className="primary"
                          onClick={() => loadTemplateIntoProfile(template)}
                        >
                          {t.templates.createProfileFromTemplate}
                        </button>
                      </div>
                    </article>
                  ))}
                  {templates.length === 0 ? <p className="empty">{t.templates.empty}</p> : null}
                </>
              )}
            </div>
            ) : null}

            {showProfileWorkspaceEditor || showTemplateWorkspace ? (
            <div className={`editor-card ${showProfileWorkspaceEditor ? 'editor-page' : ''}`}>
              {resourceMode === 'profiles' ? (
                <>
                  <div className="section-title">
                    <div>
                      {showProfileWorkspaceEditor ? (
                        <button className="ghost page-back" onClick={returnToProfileList}>
                          {profileBackLabel}
                        </button>
                      ) : null}
                      <h2>{selectedProfileId ? t.profiles.editProfile : t.profiles.createProfile}</h2>
                    </div>
                    <div className="chip-row">
                      {selectedProfileId ? (
                        <>
                          <button
                            className="ghost"
                            onClick={() =>
                              void withBusy(t.busy.openProfileFolder, async () => {
                                const api = requireDesktopApi(['profiles.revealDirectory'])
                                await api.profiles.revealDirectory(selectedProfileId)
                              })
                            }
                          >
                            {t.profiles.revealFolder}
                          </button>
                          <button
                            className="secondary"
                            onClick={() =>
                              void withBusy(t.busy.createTemplateFromProfile, async () => {
                                const api = requireDesktopApi(['templates.createFromProfile'])
                                await api.templates.createFromProfile(selectedProfileId)
                                setNoticeMessage(
                                  locale === 'zh-CN'
                                    ? '已从当前环境生成模板。'
                                    : 'Template created from current profile.',
                                )
                              })
                            }
                          >
                            {t.profiles.saveAsTemplate}
                          </button>
                        </>
                      ) : null}
                      <button className="primary" onClick={() => void saveProfile()}>
                        {selectedProfileId ? t.profiles.updateProfile : t.profiles.createProfile}
                      </button>
                    </div>
                  </div>
                  {profileForm.fingerprintConfig.runtimeMetadata.lastValidationMessages.length > 0 ? (
                    <div
                      className={`section-note profile-validation-note ${profileForm.fingerprintConfig.runtimeMetadata.lastValidationLevel}`}
                    >
                      {profileForm.fingerprintConfig.runtimeMetadata.lastValidationMessages.join(' ')}
                    </div>
                  ) : null}
                  {profileForm.environmentPurpose === 'register' ? (
                    <div className="section-note">
                      {locale === 'zh-CN'
                        ? `注册风险：${getRegistrationRiskLabel(
                            profileForm.fingerprintConfig.runtimeMetadata.lastRegistrationRiskLevel,
                            locale,
                          )} · ${profileForm.fingerprintConfig.runtimeMetadata.lastRegistrationRiskScore} 分`
                        : `Registration risk: ${getRegistrationRiskLabel(
                            profileForm.fingerprintConfig.runtimeMetadata.lastRegistrationRiskLevel,
                            locale,
                          )} · ${profileForm.fingerprintConfig.runtimeMetadata.lastRegistrationRiskScore} points`}
                      {profileForm.fingerprintConfig.runtimeMetadata.lastRegistrationRiskFactors.length > 0
                        ? ` · ${profileForm.fingerprintConfig.runtimeMetadata.lastRegistrationRiskFactors.join(' ')}`
                        : ''}
                    </div>
                  ) : null}
                  {selectedProfile && selectedProfileWorkspace ? (
                    <section className="workspace-snapshots-panel">
                      <div className="section-title section-title-sub">
                        <div>
                          <h2>{locale === 'zh-CN' ? 'Workspace 快照' : 'Workspace snapshots'}</h2>
                          <p className="section-note workspace-snapshot-subtitle">
                            {locale === 'zh-CN'
                              ? '这里展示当前环境的 workspace 快照、最近可回滚基线，以及最近一次恢复记录。'
                              : 'This panel shows workspace snapshots, the last rollback baseline, and the latest recovery record.'}
                          </p>
                        </div>
                        <div className="chip-row">
                          <button
                            className="ghost"
                            type="button"
                            onClick={() => void loadWorkspaceSnapshots(selectedProfile.id)}
                            disabled={snapshotLoadingProfileId === selectedProfile.id}
                          >
                            {snapshotLoadingProfileId === selectedProfile.id
                              ? (locale === 'zh-CN' ? '刷新中...' : 'Refreshing...')
                              : (locale === 'zh-CN' ? '刷新快照' : 'Refresh snapshots')}
                          </button>
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => void rollbackWorkspaceSnapshotForProfile(selectedProfile.id)}
                            disabled={
                              !selectedProfileWorkspace.snapshotSummary.lastKnownGoodSnapshotId ||
                              selectedProfileWorkspace.snapshotSummary.lastKnownGoodStatus === 'invalid'
                            }
                          >
                            {locale === 'zh-CN' ? '回滚到最近可用快照' : 'Rollback to last known good'}
                          </button>
                          <button
                            className="primary"
                            type="button"
                            onClick={() => void createWorkspaceSnapshotForProfile(selectedProfile.id)}
                          >
                            {locale === 'zh-CN' ? '创建快照' : 'Create snapshot'}
                          </button>
                        </div>
                      </div>

                      <div className="workspace-snapshot-summary-grid">
                        <article className="workspace-snapshot-summary-card">
                          <span>{locale === 'zh-CN' ? '最近快照' : 'Last snapshot'}</span>
                          <strong>
                            {selectedProfileWorkspace.snapshotSummary.lastSnapshotId
                              ? formatSnapshotLabel(selectedProfileWorkspace.snapshotSummary.lastSnapshotId)
                              : t.common.never}
                          </strong>
                          <small>
                            {formatDate(selectedProfileWorkspace.snapshotSummary.lastSnapshotAt)}
                          </small>
                        </article>
                        <article className="workspace-snapshot-summary-card">
                          <span>{locale === 'zh-CN' ? '最近可用基线' : 'Last known good'}</span>
                          <strong>
                            {selectedProfileWorkspace.snapshotSummary.lastKnownGoodSnapshotId
                              ? formatSnapshotLabel(
                                  selectedProfileWorkspace.snapshotSummary.lastKnownGoodSnapshotId,
                                )
                              : t.common.never}
                          </strong>
                          <small>
                            {formatDate(
                              selectedProfileWorkspace.snapshotSummary.lastKnownGoodSnapshotAt,
                            )}
                          </small>
                          {selectedProfileWorkspace.snapshotSummary.lastKnownGoodStatus === 'invalid' ? (
                            <small>
                              {locale === 'zh-CN'
                                ? `已失效：${selectedProfileWorkspace.snapshotSummary.lastKnownGoodInvalidationReason || 'unknown'}`
                                : `Invalidated: ${selectedProfileWorkspace.snapshotSummary.lastKnownGoodInvalidationReason || 'unknown'}`}
                            </small>
                          ) : null}
                        </article>
                        <article className="workspace-snapshot-summary-card">
                          <span>{locale === 'zh-CN' ? '最近恢复' : 'Latest recovery'}</span>
                          <strong>
                            {selectedProfileWorkspace.recovery.lastRecoveryReason || t.common.never}
                          </strong>
                          <small>{formatDate(selectedProfileWorkspace.recovery.lastRecoveryAt)}</small>
                        </article>
                      </div>

                      {selectedProfileSnapshots.length > 0 ? (
                        <div className="workspace-snapshot-list">
                          {selectedProfileSnapshots.map((snapshot) => {
                            const snapshotStatus = describeSnapshotStatus(snapshot)
                            const isKnownGood =
                              snapshot.snapshotId ===
                              selectedProfileWorkspace.snapshotSummary.lastKnownGoodSnapshotId
                            return (
                              <article key={snapshot.snapshotId} className="workspace-snapshot-row">
                                <div className="workspace-snapshot-main">
                                  <div className="workspace-snapshot-header">
                                    <strong>{formatSnapshotLabel(snapshot.snapshotId)}</strong>
                                    <span
                                      className={`storage-sync-note ${snapshotStatus.className} workspace-snapshot-status`}
                                    >
                                      <span className="storage-sync-note-label">
                                        {snapshotStatus.label}
                                      </span>
                                      {isKnownGood
                                        ? locale === 'zh-CN'
                                          ? '当前 last known good'
                                          : 'Current last known good'
                                        : snapshot.validatedStartAt
                                          ? formatDate(snapshot.validatedStartAt)
                                          : formatDate(snapshot.updatedAt)}
                                    </span>
                                  </div>
                                  <p>
                                    {locale === 'zh-CN' ? '创建时间：' : 'Created: '}
                                    {formatDate(snapshot.createdAt)}
                                    {' · '}
                                    {locale === 'zh-CN' ? '存储版本：' : 'Storage version: '}
                                    {snapshot.storageState.version || 0}
                                  </p>
                                  <p className="section-note">
                                    {locale === 'zh-CN' ? '模板指纹：' : 'Template fingerprint: '}
                                    {snapshot.templateFingerprintHash || t.common.never}
                                  </p>
                                  <p className="section-note">
                                    {locale === 'zh-CN' ? '目录摘要：' : 'Managed directories: '}
                                    {snapshot.directoryManifest
                                      .map((entry) => `${entry.key}(${entry.entryCount})`)
                                      .join(' · ')}
                                  </p>
                                  {snapshot.validatedStartAt ? (
                                    <p className="section-note">
                                      {locale === 'zh-CN' ? '启动验证通过：' : 'Launch validated: '}
                                      {formatDate(snapshot.validatedStartAt)}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="workspace-snapshot-actions">
                                  <button
                                    className="ghost"
                                    type="button"
                                    onClick={() =>
                                      void restoreWorkspaceSnapshotForProfile(
                                        selectedProfile.id,
                                        snapshot.snapshotId,
                                      )
                                    }
                                  >
                                    {locale === 'zh-CN' ? '恢复此快照' : 'Restore snapshot'}
                                  </button>
                                </div>
                              </article>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="empty workspace-snapshot-empty">
                          {snapshotLoadingProfileId === selectedProfile.id
                            ? (locale === 'zh-CN'
                                ? '正在读取 workspace 快照...'
                                : 'Loading workspace snapshots...')
                            : (locale === 'zh-CN'
                                ? '当前环境还没有 workspace 快照。'
                                : 'This profile does not have workspace snapshots yet.')}
                        </p>
                      )}
                    </section>
                  ) : null}
                  {(() => {
                    const storageSyncSummary = getStorageSyncSummary({
                      id: selectedProfileId || 'draft',
                      name: profileForm.name || 'draft',
                      proxyId: profileForm.proxyId,
                      groupName: profileForm.groupName,
                      tags: normalizeTags(profileForm.tagsText),
                      notes: profileForm.notes,
                      environmentPurpose: profileForm.environmentPurpose,
                      deviceProfile:
                        profileForm.deviceProfile || {
                          version: 1,
                          deviceClass:
                            profileForm.fingerprintConfig.advanced.deviceMode === 'desktop'
                              ? 'desktop'
                              : 'mobile',
                          operatingSystem: profileForm.fingerprintConfig.advanced.operatingSystem,
                          platform: profileForm.fingerprintConfig.advanced.operatingSystem.includes('mac')
                            ? 'MacIntel'
                            : profileForm.fingerprintConfig.advanced.operatingSystem.includes('Windows')
                              ? 'Win32'
                              : 'Linux x86_64',
                          browserKernel: profileForm.fingerprintConfig.advanced.browserKernel,
                          browserVersion: profileForm.fingerprintConfig.advanced.browserVersion,
                          userAgent: profileForm.fingerprintConfig.userAgent,
                          viewport: {
                            width: profileForm.fingerprintConfig.advanced.windowWidth,
                            height: profileForm.fingerprintConfig.advanced.windowHeight,
                          },
                          locale: {
                            language: profileForm.fingerprintConfig.language,
                            interfaceLanguage: profileForm.fingerprintConfig.advanced.interfaceLanguage,
                            timezone: profileForm.fingerprintConfig.timezone,
                            geolocation: profileForm.fingerprintConfig.advanced.geolocation,
                          },
                          hardware: {
                            cpuCores: profileForm.fingerprintConfig.advanced.cpuCores,
                            memoryGb: profileForm.fingerprintConfig.advanced.memoryGb,
                            webglVendor: profileForm.fingerprintConfig.advanced.webglVendor,
                            webglRenderer: profileForm.fingerprintConfig.advanced.webglRenderer,
                          },
                          mediaProfile: {
                            fontMode: profileForm.fingerprintConfig.advanced.fontMode,
                            mediaDevicesMode: profileForm.fingerprintConfig.advanced.mediaDevicesMode,
                            speechVoicesMode: profileForm.fingerprintConfig.advanced.speechVoicesMode,
                            canvasMode: profileForm.fingerprintConfig.advanced.canvasMode,
                            webglImageMode: profileForm.fingerprintConfig.advanced.webglImageMode,
                            webglMetadataMode: profileForm.fingerprintConfig.advanced.webglMetadataMode,
                            audioContextMode: profileForm.fingerprintConfig.advanced.audioContextMode,
                            clientRectsMode: profileForm.fingerprintConfig.advanced.clientRectsMode,
                          },
                          support: {
                            fonts: 'partial',
                            mediaDevices:
                              profileForm.fingerprintConfig.advanced.mediaDevicesMode === 'off'
                                ? 'partial'
                                : 'active',
                            speechVoices:
                              profileForm.fingerprintConfig.advanced.speechVoicesMode === 'off'
                                ? 'partial'
                                : 'active',
                            canvas:
                              profileForm.fingerprintConfig.advanced.canvasMode === 'off'
                                ? 'partial'
                                : 'active',
                            webgl:
                              profileForm.fingerprintConfig.advanced.webglImageMode === 'off' &&
                              profileForm.fingerprintConfig.advanced.webglMetadataMode === 'off'
                                ? 'partial'
                                : 'active',
                            audio:
                              profileForm.fingerprintConfig.advanced.audioContextMode === 'off'
                                ? 'partial'
                                : 'active',
                            clientRects:
                              profileForm.fingerprintConfig.advanced.clientRectsMode === 'off'
                                ? 'partial'
                                : 'active',
                            geolocation:
                              profileForm.fingerprintConfig.advanced.autoGeolocationFromIp ||
                              Boolean(profileForm.fingerprintConfig.advanced.geolocation)
                                ? 'active'
                                : 'partial',
                            deviceInfo: 'partial',
                            sslFingerprint: 'placeholder',
                            pluginFingerprint: 'placeholder',
                          },
                          createdAt: '',
                          updatedAt: '',
                        },
                      fingerprintConfig: profileForm.fingerprintConfig,
                      status: 'stopped',
                      lastStartedAt: null,
                      createdAt: '',
                      updatedAt: '',
                    })
                    return storageSyncSummary ? (
                      <div className={`section-note storage-sync-banner ${storageSyncSummary.className}`}>
                        <strong>{storageSyncSummary.label}</strong>
                        <span>{storageSyncSummary.detail}</span>
                      </div>
                    ) : null
                  })()}
                  <div className="section-title section-title-sub">
                    <h2>{locale === 'zh-CN' ? '基础设置' : 'Basic settings'}</h2>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '环境用途' : 'Environment purpose'}</span>
                      <select
                        value={profileForm.environmentPurpose}
                        onChange={(event) =>
                          setProfileForm((current) => {
                            const next = applyEnvironmentPurposePresetToForm(
                              current.fingerprintConfig,
                              event.target.value as EnvironmentPurpose,
                            )
                            return {
                              ...current,
                              environmentPurpose: next.environmentPurpose,
                              fingerprintConfig: next.fingerprintConfig,
                              deviceProfile: null,
                            }
                          })
                        }
                      >
                        {ENVIRONMENT_PURPOSE_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {locale === 'zh-CN' ? item.zh : item.en}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '设备画像摘要' : 'Device profile summary'}</span>
                      <input
                        value={summarizeDeviceProfile(profileForm.deviceProfile, profileForm.fingerprintConfig)}
                        readOnly
                      />
                    </label>
                  </div>
                  <div className="section-note">
                    {getEnvironmentPurposeSummary(profileForm.environmentPurpose, locale)}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN' ? '阶段轨迹：' : 'Lifecycle: '}
                    {getLifecycleStageSummary(
                      {
                        id: selectedProfileId || 'draft',
                        name: profileForm.name || 'draft',
                        proxyId: profileForm.proxyId,
                        groupName: profileForm.groupName,
                        tags: normalizeTags(profileForm.tagsText),
                        notes: profileForm.notes,
                        environmentPurpose: profileForm.environmentPurpose,
                        deviceProfile: profileForm.deviceProfile || {
                          version: 1,
                          deviceClass:
                            profileForm.fingerprintConfig.advanced.deviceMode === 'desktop'
                              ? 'desktop'
                              : 'mobile',
                          operatingSystem: profileForm.fingerprintConfig.advanced.operatingSystem,
                          platform: profileForm.fingerprintConfig.advanced.operatingSystem.includes('mac')
                            ? 'MacIntel'
                            : profileForm.fingerprintConfig.advanced.operatingSystem.includes('Windows')
                              ? 'Win32'
                              : 'Linux x86_64',
                          browserKernel: profileForm.fingerprintConfig.advanced.browserKernel,
                          browserVersion: profileForm.fingerprintConfig.advanced.browserVersion,
                          userAgent: profileForm.fingerprintConfig.userAgent,
                          viewport: {
                            width: profileForm.fingerprintConfig.advanced.windowWidth,
                            height: profileForm.fingerprintConfig.advanced.windowHeight,
                          },
                          locale: {
                            language: profileForm.fingerprintConfig.language,
                            interfaceLanguage: profileForm.fingerprintConfig.advanced.interfaceLanguage,
                            timezone: profileForm.fingerprintConfig.timezone,
                            geolocation: profileForm.fingerprintConfig.advanced.geolocation,
                          },
                          hardware: {
                            cpuCores: profileForm.fingerprintConfig.advanced.cpuCores,
                            memoryGb: profileForm.fingerprintConfig.advanced.memoryGb,
                            webglVendor: profileForm.fingerprintConfig.advanced.webglVendor,
                            webglRenderer: profileForm.fingerprintConfig.advanced.webglRenderer,
                          },
                          mediaProfile: {
                            fontMode: profileForm.fingerprintConfig.advanced.fontMode,
                            mediaDevicesMode: profileForm.fingerprintConfig.advanced.mediaDevicesMode,
                            speechVoicesMode: profileForm.fingerprintConfig.advanced.speechVoicesMode,
                            canvasMode: profileForm.fingerprintConfig.advanced.canvasMode,
                            webglImageMode: profileForm.fingerprintConfig.advanced.webglImageMode,
                            webglMetadataMode: profileForm.fingerprintConfig.advanced.webglMetadataMode,
                            audioContextMode: profileForm.fingerprintConfig.advanced.audioContextMode,
                            clientRectsMode: profileForm.fingerprintConfig.advanced.clientRectsMode,
                          },
                          support: {
                            fonts: 'partial',
                            mediaDevices:
                              profileForm.fingerprintConfig.advanced.mediaDevicesMode === 'off'
                                ? 'partial'
                                : 'active',
                            speechVoices:
                              profileForm.fingerprintConfig.advanced.speechVoicesMode === 'off'
                                ? 'partial'
                                : 'active',
                            canvas:
                              profileForm.fingerprintConfig.advanced.canvasMode === 'off'
                                ? 'partial'
                                : 'active',
                            webgl:
                              profileForm.fingerprintConfig.advanced.webglImageMode === 'off' &&
                              profileForm.fingerprintConfig.advanced.webglMetadataMode === 'off'
                                ? 'partial'
                                : 'active',
                            audio:
                              profileForm.fingerprintConfig.advanced.audioContextMode === 'off'
                                ? 'partial'
                                : 'active',
                            clientRects:
                              profileForm.fingerprintConfig.advanced.clientRectsMode === 'off'
                                ? 'partial'
                                : 'active',
                            geolocation:
                              profileForm.fingerprintConfig.advanced.autoGeolocationFromIp ||
                              Boolean(profileForm.fingerprintConfig.advanced.geolocation)
                                ? 'active'
                                : 'partial',
                            deviceInfo: 'partial',
                            sslFingerprint: 'placeholder',
                            pluginFingerprint: 'placeholder',
                          },
                          createdAt: '',
                          updatedAt: '',
                        },
                        fingerprintConfig: profileForm.fingerprintConfig,
                        status: 'stopped',
                        lastStartedAt: null,
                        createdAt: '',
                        updatedAt: '',
                      },
                      locale,
                    )}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN' ? '身份签名：' : 'Identity: '}
                    {summarizeIdentitySignature(profileForm.deviceProfile, profileForm.fingerprintConfig)}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN' ? '地区签名：' : 'Locale: '}
                    {summarizeLocaleSignature(profileForm.deviceProfile, profileForm.fingerprintConfig)}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN' ? '硬件签名：' : 'Hardware: '}
                    {summarizeHardwareSignature(profileForm.deviceProfile, profileForm.fingerprintConfig)}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? `字段支持矩阵：${summarizeSupportMatrix(profileForm.deviceProfile, locale)}`
                      : `Support matrix: ${summarizeSupportMatrix(profileForm.deviceProfile, locale)}`}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? `画像能力摘要：${summarizeSupportHighlights(profileForm.deviceProfile, locale)}`
                      : `Capability summary: ${summarizeSupportHighlights(profileForm.deviceProfile, locale)}`}
                  </div>
                  <label>
                    <span>{t.profiles.name}</span>
                    <input value={profileForm.name} maxLength={50} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} />
                  </label>
                  <label>
                    <span>{t.profiles.tags}</span>
                    <input value={profileForm.tagsText} onChange={(event) => setProfileForm((current) => ({ ...current, tagsText: event.target.value }))} placeholder={t.profiles.tagsPlaceholder} />
                  </label>
                  <div className="split">
                    <label>
                      <span>{t.profiles.group}</span>
                      <input value={profileForm.groupName} onChange={(event) => setProfileForm((current) => ({ ...current, groupName: event.target.value }))} />
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '平台' : 'Platform'}</span>
                      <select
                        value={profileForm.fingerprintConfig.basicSettings.platform}
                        onChange={(event) =>
                          setProfileForm((current) => {
                            const next = applyPlatformPresetToForm(
                              current.fingerprintConfig,
                              current.environmentPurpose,
                              event.target.value,
                            )
                            return {
                              ...current,
                              environmentPurpose: next.environmentPurpose,
                              fingerprintConfig: next.fingerprintConfig,
                              deviceProfile: null,
                            }
                          })
                        }
                      >
                        {STARTUP_PLATFORM_OPTIONS.map((item) => (
                          <option key={item.value || 'none'} value={item.value}>
                            {locale === 'zh-CN' ? item.labelZh : item.labelEn}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? `平台模板：${getPlatformTemplateSummary(profileForm.fingerprintConfig.basicSettings.platform, locale)}`
                      : `Platform template: ${getPlatformTemplateSummary(profileForm.fingerprintConfig.basicSettings.platform, locale)}`}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? `平台策略：${getPlatformStrategySummary(profileForm.fingerprintConfig.basicSettings.platform, locale)}`
                      : `Platform strategy: ${getPlatformStrategySummary(profileForm.fingerprintConfig.basicSettings.platform, locale)}`}
                  </div>
                  {profileForm.fingerprintConfig.basicSettings.platform === 'custom' ? (
                    <div className="split">
                      <label>
                        <span>{locale === 'zh-CN' ? '平台名称' : 'Platform name'}</span>
                        <input
                          value={profileForm.fingerprintConfig.basicSettings.customPlatformName}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              fingerprintConfig: {
                                ...current.fingerprintConfig,
                                basicSettings: {
                                  ...current.fingerprintConfig.basicSettings,
                                  customPlatformName: event.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>{locale === 'zh-CN' ? '平台 URL' : 'Platform URL'}</span>
                        <input
                          value={profileForm.fingerprintConfig.basicSettings.customPlatformUrl}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              fingerprintConfig: {
                                ...current.fingerprintConfig,
                                basicSettings: {
                                  ...current.fingerprintConfig.basicSettings,
                                  customPlatformUrl: event.target.value,
                                },
                              },
                            }))
                          }
                          placeholder="https://example.com"
                        />
                      </label>
                    </div>
                  ) : null}
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '用户名' : 'Username'}</span>
                      <input
                        value={profileForm.fingerprintConfig.basicSettings.platformUsername}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              basicSettings: {
                                ...current.fingerprintConfig.basicSettings,
                                platformUsername: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '密码' : 'Password'}</span>
                      <input
                        type="password"
                        value={profileForm.fingerprintConfig.basicSettings.platformPassword}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              basicSettings: {
                                ...current.fingerprintConfig.basicSettings,
                                platformPassword: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '多开设置' : 'Multi-open'}</span>
                      <select
                        value={profileForm.fingerprintConfig.basicSettings.multiOpenMode}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              basicSettings: {
                                ...current.fingerprintConfig.basicSettings,
                                multiOpenMode: event.target.value as 'allow' | 'deny',
                              },
                            },
                          }))
                        }
                      >
                        <option value="allow">{locale === 'zh-CN' ? '允许' : 'Allow'}</option>
                        <option value="deny">{locale === 'zh-CN' ? '不允许' : 'Deny'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '2FA 秘钥' : '2FA secret'}</span>
                      <input
                        value={profileForm.fingerprintConfig.basicSettings.twoFactorSecret}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              basicSettings: {
                                ...current.fingerprintConfig.basicSettings,
                                twoFactorSecret: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <span>{locale === 'zh-CN' ? 'Cookie 初始化内容' : 'Cookie seed'}</span>
                    <textarea
                      rows={3}
                      value={profileForm.fingerprintConfig.basicSettings.cookieSeed}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            basicSettings: {
                              ...current.fingerprintConfig.basicSettings,
                              cookieSeed: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.profiles.notes}</span>
                    <textarea rows={4} value={profileForm.notes} onChange={(event) => setProfileForm((current) => ({ ...current, notes: event.target.value }))} />
                  </label>

                  <div className="section-title section-title-sub">
                    <h2>{locale === 'zh-CN' ? '代理设置' : 'Proxy settings'}</h2>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '代理方式' : 'Proxy mode'}</span>
                      <select
                        value={profileForm.fingerprintConfig.proxySettings.proxyMode}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            proxyId: event.target.value === 'manager' ? current.proxyId : null,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              proxySettings: {
                                ...current.fingerprintConfig.proxySettings,
                                proxyMode: event.target.value as typeof current.fingerprintConfig.proxySettings.proxyMode,
                              },
                            },
                          }))
                        }
                      >
                        <option value="direct">{locale === 'zh-CN' ? '直接模式' : 'Direct'}</option>
                        <option value="custom">{locale === 'zh-CN' ? '自定义代理' : 'Custom proxy'}</option>
                        <option value="manager">{locale === 'zh-CN' ? '代理管理' : 'Proxy manager'}</option>
                        <option value="api">{locale === 'zh-CN' ? 'API 提取' : 'Provider API'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? 'IP 查询渠道' : 'IP lookup channel'}</span>
                      <input
                        value={profileForm.fingerprintConfig.proxySettings.ipLookupChannel}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              proxySettings: {
                                ...current.fingerprintConfig.proxySettings,
                                ipLookupChannel: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  {profileForm.fingerprintConfig.proxySettings.proxyMode === 'manager' ? (
                    <label>
                      <span>{t.profiles.proxy}</span>
                      <select
                        value={profileForm.proxyId ?? ''}
                        onChange={(event) => setProfileForm((current) => ({ ...current, proxyId: event.target.value || null }))}
                      >
                        <option value="">{t.common.noProxy}</option>
                        {proxies.map((proxy) => (
                          <option key={proxy.id} value={proxy.id}>{proxy.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {profileForm.fingerprintConfig.proxySettings.proxyMode === 'custom' ? (
                    <>
                      <div className="split">
                        <label>
                          <span>{locale === 'zh-CN' ? '代理类型' : 'Proxy type'}</span>
                          <select
                            value={profileForm.fingerprintConfig.proxySettings.proxyType}
                            onChange={(event) =>
                              setProfileForm((current) => ({
                                ...current,
                                fingerprintConfig: {
                                  ...current.fingerprintConfig,
                                  proxySettings: {
                                    ...current.fingerprintConfig.proxySettings,
                                    proxyType: event.target.value as ProxyType,
                                  },
                                },
                              }))
                            }
                          >
                            <option value="http">HTTP</option>
                            <option value="https">HTTPS</option>
                            <option value="socks5">SOCKS5</option>
                          </select>
                        </label>
                        <label>
                          <span>{locale === 'zh-CN' ? 'IP 协议' : 'IP protocol'}</span>
                          <select
                            value={profileForm.fingerprintConfig.proxySettings.ipProtocol}
                            onChange={(event) =>
                              setProfileForm((current) => ({
                                ...current,
                                fingerprintConfig: {
                                  ...current.fingerprintConfig,
                                  proxySettings: {
                                    ...current.fingerprintConfig.proxySettings,
                                    ipProtocol: event.target.value as 'ipv4' | 'ipv6',
                                  },
                                },
                              }))
                            }
                          >
                            <option value="ipv4">IPv4</option>
                            <option value="ipv6">IPv6</option>
                          </select>
                        </label>
                      </div>
                      <div className="split">
                        <label>
                          <span>{locale === 'zh-CN' ? '主机' : 'Host'}</span>
                          <input value={profileForm.fingerprintConfig.proxySettings.host} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, proxySettings: { ...current.fingerprintConfig.proxySettings, host: event.target.value } } }))} />
                        </label>
                        <label>
                          <span>{locale === 'zh-CN' ? '端口' : 'Port'}</span>
                          <input type="number" value={profileForm.fingerprintConfig.proxySettings.port || ''} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, proxySettings: { ...current.fingerprintConfig.proxySettings, port: Number(event.target.value) } } }))} />
                        </label>
                      </div>
                      <div className="split">
                        <label>
                          <span>{locale === 'zh-CN' ? '账号' : 'Username'}</span>
                          <input value={profileForm.fingerprintConfig.proxySettings.username} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, proxySettings: { ...current.fingerprintConfig.proxySettings, username: event.target.value } } }))} />
                        </label>
                        <label>
                          <span>{locale === 'zh-CN' ? '密码' : 'Password'}</span>
                          <input type="password" value={profileForm.fingerprintConfig.proxySettings.password} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, proxySettings: { ...current.fingerprintConfig.proxySettings, password: event.target.value } } }))} />
                        </label>
                      </div>
                    </>
                  ) : null}

                  <div className="section-title section-title-sub">
                    <h2>{locale === 'zh-CN' ? '常用设置' : 'Common settings'}</h2>
                    <button className="ghost" onClick={() => setShowMoreProfileCommon((value) => !value)}>
                      {showMoreProfileCommon ? (locale === 'zh-CN' ? '收起' : 'Collapse') : (locale === 'zh-CN' ? '展示更多' : 'Show more')}
                    </button>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '浏览器窗口工作台页面' : 'Workspace page'}</span>
                      <select value={profileForm.fingerprintConfig.commonSettings.pageMode} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, pageMode: event.target.value as 'local' | 'hidden' } } }))}>
                        <option value="local">{locale === 'zh-CN' ? '本地页面' : 'Local page'}</option>
                        <option value="hidden">{locale === 'zh-CN' ? '不显示' : 'Hidden'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '禁止加载图片' : 'Block images'}</span>
                      <select value={profileForm.fingerprintConfig.commonSettings.blockImages ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, blockImages: event.target.value === 'true' } } }))}>
                        <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                        <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                      </select>
                    </label>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '同步标签页' : 'Sync tabs'}</span>
                      <select value={profileForm.fingerprintConfig.commonSettings.syncTabs ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, syncTabs: event.target.value === 'true' } } }))}>
                        <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                        <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '同步 Cookie' : 'Sync cookies'}</span>
                      <select value={profileForm.fingerprintConfig.commonSettings.syncCookies ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, syncCookies: event.target.value === 'true' } } }))}>
                        <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                        <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                      </select>
                    </label>
                  </div>
                  {showMoreProfileCommon ? (
                    <div className="split">
                      <label>
                        <span>{locale === 'zh-CN' ? '启动前清缓存' : 'Clear cache on launch'}</span>
                        <select value={profileForm.fingerprintConfig.commonSettings.clearCacheOnLaunch ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, clearCacheOnLaunch: event.target.value === 'true' } } }))}>
                          <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                          <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                        </select>
                      </label>
                      <label>
                        <span>{locale === 'zh-CN' ? '启动随机指纹' : 'Randomize on launch'}</span>
                        <select value={profileForm.fingerprintConfig.commonSettings.randomizeFingerprintOnLaunch ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, randomizeFingerprintOnLaunch: event.target.value === 'true' } } }))}>
                          <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                          <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                        </select>
                      </label>
                      <label>
                        <span>{locale === 'zh-CN' ? '允许登录 Chrome' : 'Allow Chrome login'}</span>
                        <select value={profileForm.fingerprintConfig.commonSettings.allowChromeLogin ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, allowChromeLogin: event.target.value === 'true' } } }))}>
                          <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                          <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                        </select>
                      </label>
                      <label>
                        <span>{locale === 'zh-CN' ? '硬件加速' : 'Hardware acceleration'}</span>
                        <select value={profileForm.fingerprintConfig.commonSettings.hardwareAcceleration ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, hardwareAcceleration: event.target.value === 'true' } } }))}>
                          <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                          <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                        </select>
                      </label>
                    </div>
                  ) : null}

                  <div className="section-title section-title-sub">
                    <h2>{locale === 'zh-CN' ? '指纹设置' : 'Fingerprint settings'}</h2>
                    <div className="chip-row">
                      <button className="secondary" onClick={() => setProfileForm((current) => ({ ...current, fingerprintConfig: randomDesktopFingerprint(current.fingerprintConfig) }))}>
                        {locale === 'zh-CN' ? '一键随机生成指纹配置' : 'Randomize fingerprint'}
                      </button>
                      <button className="ghost" onClick={() => setShowMoreProfileFingerprint((value) => !value)}>
                        {showMoreProfileFingerprint ? (locale === 'zh-CN' ? '收起' : 'Collapse') : (locale === 'zh-CN' ? '展示更多' : 'Show more')}
                      </button>
                    </div>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '浏览器' : 'Browser'}</span>
                      <select value={profileForm.fingerprintConfig.advanced.browserKernel} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, browserKernel: event.target.value as 'chrome' | 'system-default' } } }))}>
                        <option value="chrome">Google Chrome</option>
                        <option value="system-default">{locale === 'zh-CN' ? '当前系统默认浏览器' : 'System default browser'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '设备' : 'Device'}</span>
                      <select value={profileForm.fingerprintConfig.advanced.deviceMode} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, deviceMode: event.target.value as 'desktop' | 'android' | 'ios' } } }))}>
                        <option value="desktop">{locale === 'zh-CN' ? '桌面端' : 'Desktop'}</option>
                        <option value="android">Android</option>
                        <option value="ios">iOS</option>
                      </select>
                    </label>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '操作系统' : 'Operating system'}</span>
                      <select
                        value={profileForm.fingerprintConfig.advanced.operatingSystem}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              userAgent: buildDesktopUserAgent(
                                event.target.value,
                                current.fingerprintConfig.advanced.browserVersion,
                              ),
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                operatingSystem: event.target.value,
                              },
                            },
                          }))
                        }
                      >
                        {OPERATING_SYSTEM_OPTIONS.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '浏览器版本' : 'Browser version'}</span>
                      <input
                        value={profileForm.fingerprintConfig.advanced.browserVersion}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              userAgent: buildDesktopUserAgent(
                                current.fingerprintConfig.advanced.operatingSystem,
                                event.target.value,
                              ),
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                browserVersion: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <span>{t.profiles.userAgent}</span>
                    <textarea rows={3} value={profileForm.fingerprintConfig.userAgent} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, userAgent: event.target.value } }))} />
                  </label>
                  {profileForm.fingerprintConfig.runtimeMetadata.lastResolvedIp ? (
                    <div className="section-note">
                      {locale === 'zh-CN'
                        ? `最近联动结果：IP ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedIp} · ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedCountry || profileForm.fingerprintConfig.runtimeMetadata.lastResolvedRegion || '未知地区'} · 时区 ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedTimezone || '未生成'}`
                        : `Last resolved network profile: ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedIp} · ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedCountry || profileForm.fingerprintConfig.runtimeMetadata.lastResolvedRegion || 'Unknown region'} · ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedTimezone || 'No timezone'}`}
                    </div>
                  ) : null}
                  {profileForm.fingerprintConfig.runtimeMetadata.injectedFeatures.length > 0 ? (
                    <div className="section-note">
                      {locale === 'zh-CN'
                        ? `已接入运行时的高级指纹项：${profileForm.fingerprintConfig.runtimeMetadata.injectedFeatures.join('、')}`
                        : `Runtime-injected fingerprint features: ${profileForm.fingerprintConfig.runtimeMetadata.injectedFeatures.join(', ')}`}
                    </div>
                  ) : null}
                  <div className="split">
                    <label>
                      <span>{t.profiles.language}</span>
                      <select
                        value={profileForm.fingerprintConfig.advanced.autoLanguageFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoLanguageFromIp: event.target.value === 'auto',
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{locale === 'zh-CN' ? '基于 IP 自动生成语言' : 'Auto language from IP'}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置语言' : 'Manual language'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t.profiles.timezone}</span>
                      <select
                        value={profileForm.fingerprintConfig.advanced.autoTimezoneFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              timezone:
                                event.target.value === 'auto'
                                  ? ''
                                  : current.fingerprintConfig.timezone || 'America/Los_Angeles',
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoTimezoneFromIp: event.target.value === 'auto',
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{t.cloudPhones.autoTimezone}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置时区' : 'Manual timezone'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '地理位置' : 'Geolocation'}</span>
                      <select
                        value={profileForm.fingerprintConfig.advanced.autoGeolocationFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoGeolocationFromIp: event.target.value === 'auto',
                                geolocation:
                                  event.target.value === 'auto'
                                    ? ''
                                    : current.fingerprintConfig.advanced.geolocation,
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{locale === 'zh-CN' ? '基于 IP 自动生成地理位置' : 'Auto geolocation from IP'}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置地理位置' : 'Manual geolocation'}</option>
                      </select>
                    </label>
                  </div>
                  {!profileForm.fingerprintConfig.advanced.autoLanguageFromIp ? (
                    <label>
                      <span>{t.profiles.language}</span>
                      <select
                        value={normalizeEnvironmentLanguage(profileForm.fingerprintConfig.language, defaultEnvironmentLanguage)}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              language: event.target.value,
                            },
                          }))
                        }
                      >
                        {SUPPORTED_ENVIRONMENT_LANGUAGES.map((code) => (
                          <option key={code} value={code}>{t.common.envLanguageLabel(code)}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {!profileForm.fingerprintConfig.advanced.autoTimezoneFromIp ? (
                    <label>
                      <span>{t.profiles.timezone}</span>
                      <input
                        value={profileForm.fingerprintConfig.timezone}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              timezone: event.target.value,
                            },
                          }))
                        }
                        placeholder="America/Los_Angeles"
                      />
                    </label>
                  ) : null}
                  {!profileForm.fingerprintConfig.advanced.autoGeolocationFromIp ? (
                    <label>
                      <span>{locale === 'zh-CN' ? '地理位置' : 'Geolocation'}</span>
                      <input
                        value={profileForm.fingerprintConfig.advanced.geolocation}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                geolocation: event.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="34.0522, -118.2437"
                      />
                    </label>
                  ) : null}
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? '保存或启动前会优先根据代理出口 IP 联动生成时区、语言与地理位置；没有代理时回退到本机公网 IP。'
                      : 'Before save or launch, timezone, language, and geolocation are resolved from the proxy exit IP when available, otherwise from the local public IP.'}
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '窗口尺寸' : 'Window size'}</span>
                      <input value={`${profileForm.fingerprintConfig.advanced.windowWidth} x ${profileForm.fingerprintConfig.advanced.windowHeight}`} onChange={(event) => {
                        const [widthText, heightText] = event.target.value.split(/x|×/i).map((item) => item.trim())
                        setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, windowWidth: Number(widthText) || current.fingerprintConfig.advanced.windowWidth, windowHeight: Number(heightText) || current.fingerprintConfig.advanced.windowHeight } } }))
                      }} />
                    </label>
                    <label>
                      <span>{t.profiles.webrtc}</span>
                      <select value={profileForm.fingerprintConfig.webrtcMode} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, webrtcMode: event.target.value as FingerprintConfig['webrtcMode'] } }))}>
                        <option value="default">{locale === 'zh-CN' ? '默认' : 'Default'}</option>
                        <option value="disabled">{locale === 'zh-CN' ? '禁用' : 'Disabled'}</option>
                      </select>
                    </label>
                  </div>
                  {showMoreProfileFingerprint ? (
                    <>
                      <div className="split">
                        <label>
                          <span>Canvas</span>
                          <select value={profileForm.fingerprintConfig.advanced.canvasMode} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, canvasMode: event.target.value as typeof current.fingerprintConfig.advanced.canvasMode } } }))}>
                            <option value="random">{locale === 'zh-CN' ? '随机' : 'Random'}</option>
                            <option value="off">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                            <option value="custom">{locale === 'zh-CN' ? '自定义' : 'Custom'}</option>
                          </select>
                        </label>
                        <label>
                          <span>WebGL</span>
                          <select value={profileForm.fingerprintConfig.advanced.webglImageMode} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, webglImageMode: event.target.value as typeof current.fingerprintConfig.advanced.webglImageMode } } }))}>
                            <option value="random">{locale === 'zh-CN' ? '随机' : 'Random'}</option>
                            <option value="off">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                            <option value="custom">{locale === 'zh-CN' ? '自定义' : 'Custom'}</option>
                          </select>
                        </label>
                      </div>
                      <div className="split">
                        <label>
                          <span>{locale === 'zh-CN' ? '设备名称' : 'Device name'}</span>
                          <input value={profileForm.fingerprintConfig.advanced.deviceName} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, deviceName: event.target.value } } }))} />
                        </label>
                        <label>
                          <span>Host IP</span>
                          <input value={profileForm.fingerprintConfig.advanced.hostIp} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, hostIp: event.target.value } } }))} />
                        </label>
                      </div>
                      <div className="split">
                        <label>
                          <span>MAC</span>
                          <input value={profileForm.fingerprintConfig.advanced.macAddress} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, macAddress: event.target.value } } }))} />
                        </label>
                        <label>
                          <span>{locale === 'zh-CN' ? '启动参数' : 'Launch args'}</span>
                          <input value={profileForm.fingerprintConfig.advanced.launchArgs} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, launchArgs: event.target.value } } }))} placeholder="--mute-audio,--disable-extensions" />
                        </label>
                      </div>
                      <div className="split">
                        <label>
                          <span>{locale === 'zh-CN' ? 'CPU 核数' : 'CPU cores'}</span>
                          <input type="number" value={profileForm.fingerprintConfig.advanced.cpuCores} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, cpuCores: Number(event.target.value) || current.fingerprintConfig.advanced.cpuCores } } }))} />
                        </label>
                        <label>
                          <span>{locale === 'zh-CN' ? '设备内存 (GB)' : 'Memory (GB)'}</span>
                          <input type="number" value={profileForm.fingerprintConfig.advanced.memoryGb} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, memoryGb: Number(event.target.value) || current.fingerprintConfig.advanced.memoryGb } } }))} />
                        </label>
                      </div>
                    </>
                  ) : null}
                  <div className="actions">
                    <button className="primary" onClick={() => void saveProfile()}>
                      {selectedProfileId ? t.profiles.updateProfile : t.profiles.createProfile}
                    </button>
                    {selectedProfileId ? (
                      <button
                        className="danger"
                        onClick={() =>
                          void withBusy(t.busy.deleteProfile, async () => {
                            const api = requireDesktopApi(['profiles.delete'])
                            await api.profiles.delete(selectedProfileId)
                            setSelectedProfileId(null)
                            setProfilePageMode('list')
                            setProfileForm(
                              emptyProfile(proxies[0]?.id ?? null, defaultEnvironmentLanguage),
                            )
                            setNoticeMessage(
                              locale === 'zh-CN' ? '环境已删除。' : 'Profile deleted.',
                            )
                          })
                        }
                      >
                        {t.profiles.deleteProfile}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="section-title">
                    <h2>{selectedTemplateId ? t.templates.editTemplate : t.templates.createTemplate}</h2>
                    <button
                      className="secondary"
                      onClick={() => {
                        setSelectedTemplateId(null)
                        setTemplateForm(emptyTemplate(proxies[0]?.id ?? null))
                      }}
                    >
                      {t.templates.newTemplate}
                    </button>
                  </div>
                  <label>
                    <span>{t.profiles.name}</span>
                    <input
                      value={templateForm.name}
                      onChange={(event) =>
                        setTemplateForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.profiles.group}</span>
                    <input
                      value={templateForm.groupName}
                      onChange={(event) =>
                        setTemplateForm((current) => ({ ...current, groupName: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.profiles.tags}</span>
                    <input
                      value={templateForm.tagsText}
                      onChange={(event) =>
                        setTemplateForm((current) => ({ ...current, tagsText: event.target.value }))
                      }
                      placeholder={t.profiles.tagsPlaceholder}
                    />
                  </label>
                  <label>
                    <span>{locale === 'zh-CN' ? '平台' : 'Platform'}</span>
                    <select
                      value={templateForm.fingerprintConfig.basicSettings.platform}
                      onChange={(event) =>
                        setTemplateForm((current) => {
                          const next = applyPlatformPresetToForm(
                            current.fingerprintConfig,
                            current.environmentPurpose,
                            event.target.value,
                          )
                          return {
                            ...current,
                            environmentPurpose: next.environmentPurpose,
                            fingerprintConfig: next.fingerprintConfig,
                            deviceProfile: null,
                          }
                        })
                      }
                    >
                      {STARTUP_PLATFORM_OPTIONS.map((item) => (
                        <option key={item.value || 'none'} value={item.value}>
                          {locale === 'zh-CN' ? item.labelZh : item.labelEn}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{locale === 'zh-CN' ? '模板用途' : 'Template purpose'}</span>
                    <select
                      value={templateForm.environmentPurpose}
                      onChange={(event) =>
                        setTemplateForm((current) => {
                          const next = applyEnvironmentPurposePresetToForm(
                            current.fingerprintConfig,
                            event.target.value as EnvironmentPurpose,
                          )
                          return {
                            ...current,
                            environmentPurpose: next.environmentPurpose,
                            fingerprintConfig: next.fingerprintConfig,
                            deviceProfile: null,
                          }
                        })
                      }
                    >
                      {ENVIRONMENT_PURPOSE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {locale === 'zh-CN' ? item.zh : item.en}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="section-note">
                    {getEnvironmentPurposeSummary(templateForm.environmentPurpose, locale)}
                  </div>
                  <div className="section-note">
                    {getEnvironmentPurposeSummary(templateForm.environmentPurpose, locale)}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN' ? '身份签名：' : 'Identity: '}
                    {summarizeIdentitySignature(null, templateForm.fingerprintConfig)}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN' ? '地区签名：' : 'Locale: '}
                    {summarizeLocaleSignature(null, templateForm.fingerprintConfig)}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN' ? '硬件签名：' : 'Hardware: '}
                    {summarizeHardwareSignature(null, templateForm.fingerprintConfig)}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? `平台模板：${getPlatformTemplateSummary(templateForm.fingerprintConfig.basicSettings.platform, locale)}`
                      : `Platform template: ${getPlatformTemplateSummary(templateForm.fingerprintConfig.basicSettings.platform, locale)}`}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? `平台策略：${getPlatformStrategySummary(templateForm.fingerprintConfig.basicSettings.platform, locale)}`
                      : `Platform strategy: ${getPlatformStrategySummary(templateForm.fingerprintConfig.basicSettings.platform, locale)}`}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? `模板建议用途：${getEnvironmentPurposeLabel(templateForm.environmentPurpose, locale)}`
                      : `Recommended purpose: ${getEnvironmentPurposeLabel(templateForm.environmentPurpose, locale)}`}
                  </div>
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? `画像能力摘要：${summarizeSupportHighlights(templateForm.deviceProfile, locale)}`
                      : `Capability summary: ${summarizeSupportHighlights(templateForm.deviceProfile, locale)}`}
                  </div>
                  {templateForm.fingerprintConfig.basicSettings.platform === 'custom' ? (
                    <div className="split">
                      <label>
                        <span>{locale === 'zh-CN' ? '平台名称' : 'Platform name'}</span>
                        <input
                          value={templateForm.fingerprintConfig.basicSettings.customPlatformName}
                          onChange={(event) =>
                            setTemplateForm((current) => ({
                              ...current,
                              fingerprintConfig: {
                                ...current.fingerprintConfig,
                                basicSettings: {
                                  ...current.fingerprintConfig.basicSettings,
                                  customPlatformName: event.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>{locale === 'zh-CN' ? '平台 URL' : 'Platform URL'}</span>
                        <input
                          value={templateForm.fingerprintConfig.basicSettings.customPlatformUrl}
                          onChange={(event) =>
                            setTemplateForm((current) => ({
                              ...current,
                              fingerprintConfig: {
                                ...current.fingerprintConfig,
                                basicSettings: {
                                  ...current.fingerprintConfig.basicSettings,
                                  customPlatformUrl: event.target.value,
                                },
                              },
                            }))
                          }
                          placeholder="https://example.com"
                        />
                      </label>
                    </div>
                  ) : null}
                  <label>
                    <span>{t.profiles.proxy}</span>
                    <select
                      value={templateForm.proxyId ?? ''}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          proxyId: event.target.value || null,
                        }))
                      }
                    >
                      <option value="">{t.common.noProxy}</option>
                      {proxies.map((proxy) => (
                        <option key={proxy.id} value={proxy.id}>
                          {proxy.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="split">
                    <label>
                      <span>{t.profiles.language}</span>
                      <select
                        value={templateForm.fingerprintConfig.advanced.autoLanguageFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoLanguageFromIp: event.target.value === 'auto',
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{locale === 'zh-CN' ? '基于 IP 自动生成语言' : 'Auto language from IP'}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置语言' : 'Manual language'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t.profiles.timezone}</span>
                      <select
                        value={templateForm.fingerprintConfig.advanced.autoTimezoneFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              timezone:
                                event.target.value === 'auto'
                                  ? ''
                                  : current.fingerprintConfig.timezone || 'America/Los_Angeles',
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoTimezoneFromIp: event.target.value === 'auto',
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{t.cloudPhones.autoTimezone}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置时区' : 'Manual timezone'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '地理位置' : 'Geolocation'}</span>
                      <select
                        value={templateForm.fingerprintConfig.advanced.autoGeolocationFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoGeolocationFromIp: event.target.value === 'auto',
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{locale === 'zh-CN' ? '基于 IP 自动生成地理位置' : 'Auto geolocation from IP'}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置地理位置' : 'Manual geolocation'}</option>
                      </select>
                    </label>
                  </div>
                  {!templateForm.fingerprintConfig.advanced.autoLanguageFromIp ? (
                    <label>
                      <span>{t.profiles.language}</span>
                      <select
                        value={normalizeEnvironmentLanguage(templateForm.fingerprintConfig.language)}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              language: event.target.value,
                            },
                          }))
                        }
                      >
                        {SUPPORTED_ENVIRONMENT_LANGUAGES.map((code) => (
                          <option key={code} value={code}>
                            {t.common.envLanguageLabel(code)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {!templateForm.fingerprintConfig.advanced.autoTimezoneFromIp ? (
                    <label>
                      <span>{t.profiles.timezone}</span>
                      <input
                        value={templateForm.fingerprintConfig.timezone}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              timezone: event.target.value,
                            },
                          }))
                        }
                        placeholder="America/Los_Angeles"
                      />
                    </label>
                  ) : null}
                  {!templateForm.fingerprintConfig.advanced.autoGeolocationFromIp ? (
                    <label>
                      <span>{locale === 'zh-CN' ? '地理位置' : 'Geolocation'}</span>
                      <input
                        value={templateForm.fingerprintConfig.advanced.geolocation}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                geolocation: event.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="34.0522, -118.2437"
                      />
                    </label>
                  ) : null}
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? '从该模板创建环境时，会根据代理出口 IP 或本机公网 IP 自动联动生成时区、语言与地理位置。'
                      : 'Profiles created from this template will auto-resolve timezone, language, and geolocation from the proxy exit IP or local public IP.'}
                  </div>
                  <div className="split">
                    <label>
                      <span>{t.profiles.resolution}</span>
                      <input
                        value={templateForm.fingerprintConfig.resolution}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              resolution: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>{t.profiles.webrtc}</span>
                      <select
                        value={templateForm.fingerprintConfig.webrtcMode}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              webrtcMode: event.target.value as FingerprintConfig['webrtcMode'],
                            },
                          }))
                        }
                      >
                        <option value="default">Default</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    <span>{t.profiles.userAgent}</span>
                    <textarea
                      rows={3}
                      value={templateForm.fingerprintConfig.userAgent}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            userAgent: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.profiles.notes}</span>
                    <textarea
                      rows={4}
                      value={templateForm.notes}
                      onChange={(event) =>
                        setTemplateForm((current) => ({ ...current, notes: event.target.value }))
                      }
                    />
                  </label>
                  <div className="actions">
                    <button className="primary" onClick={() => void saveTemplate()}>
                      {selectedTemplateId ? t.templates.updateTemplate : t.templates.createTemplate}
                    </button>
                    {selectedTemplateId ? (
                      <button
                        className="danger"
                        onClick={() =>
                          void withBusy(t.busy.deleteTemplate, async () => {
                            const api = requireDesktopApi(['templates.delete'])
                            await api.templates.delete(selectedTemplateId)
                            setSelectedTemplateId(null)
                            setTemplateForm(emptyTemplate(proxies[0]?.id ?? null))
                            setNoticeMessage(
                              locale === 'zh-CN' ? '模板已删除。' : 'Template deleted.',
                            )
                          })
                        }
                      >
                        {t.templates.deleteTemplate}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            ) : null}
          </section>
        ) : null}

        {view === 'cloudPhones' ? (
          <section className="workspace workspace-single">
            {showCloudPhoneList ? (
            <div className="list-card">
              <div className="section-title">
                <h2>{t.cloudPhones.title}</h2>
                <div className="section-title-actions">
                  <button
                    className="secondary"
                    onClick={() =>
                      void withBusy(t.busy.refreshCloudPhones, async () => {
                        const api = requireDesktopApi(['cloudPhones.refreshStatuses'])
                        await api.cloudPhones.refreshStatuses()
                        setNoticeMessage(
                          locale === 'zh-CN' ? '云手机状态已刷新。' : 'Cloud phone statuses refreshed.',
                        )
                      })
                    }
                  >
                    {t.cloudPhones.refreshStatuses}
                  </button>
                  <button className="primary" onClick={openCreateCloudPhonePage}>
                    {t.cloudPhones.create}
                  </button>
                </div>
              </div>
              <div className="toolbar">
                <input
                  value={cloudPhoneSearchQuery}
                  onChange={(event) => setCloudPhoneSearchQuery(event.target.value)}
                  placeholder={`${t.common.search}...`}
                />
                <select
                  value={cloudPhoneGroupFilter}
                  onChange={(event) => setCloudPhoneGroupFilter(event.target.value)}
                >
                  <option value="all">{t.profiles.groupFilter}: {t.common.all}</option>
                  {cloudPhoneGroupOptions.map((groupName) => (
                    <option key={groupName} value={groupName}>
                      {groupName}
                    </option>
                  ))}
                </select>
                <div className="section-note">{t.cloudPhones.subtitle}</div>
              </div>
              {defaultCloudPhoneProviderHealth ? (
                <div
                  className={`cloud-phone-provider-strip ${
                    defaultCloudPhoneProviderHealth.available ? 'healthy' : 'warning'
                  }`}
                >
                  <strong>
                    {t.cloudPhones.defaultProvider}: {renderProviderLabel(defaultCloudPhoneProvider)}
                  </strong>
                  <span>
                    {defaultCloudPhoneProviderHealth.available ? t.common.ready : t.common.missing}
                  </span>
                  <p>{defaultCloudPhoneProviderHealth.message}</p>
                </div>
              ) : null}
              <div className="batch-toolbar">
                <span>{t.cloudPhones.selectedCount(selectedCloudPhoneIds.length)}</span>
                <button
                  className="secondary"
                  disabled={selectedCloudPhoneIds.length === 0}
                  onClick={() =>
                    void withBusy(t.busy.bulkStartCloudPhones, async () => {
                      const api = requireDesktopApi(['cloudPhones.bulkStart'])
                      await api.cloudPhones.bulkStart({ cloudPhoneIds: selectedCloudPhoneIds })
                      setNoticeMessage(
                        locale === 'zh-CN'
                          ? `已启动 ${selectedCloudPhoneIds.length} 个云手机环境。`
                          : `Started ${selectedCloudPhoneIds.length} cloud phone environments.`,
                      )
                    })
                  }
                >
                  {t.cloudPhones.batchStart}
                </button>
                <button
                  className="secondary"
                  disabled={selectedCloudPhoneIds.length === 0}
                  onClick={() =>
                    void withBusy(t.busy.bulkStopCloudPhones, async () => {
                      const api = requireDesktopApi(['cloudPhones.bulkStop'])
                      await api.cloudPhones.bulkStop({ cloudPhoneIds: selectedCloudPhoneIds })
                      setNoticeMessage(
                        locale === 'zh-CN'
                          ? `已停止 ${selectedCloudPhoneIds.length} 个云手机环境。`
                          : `Stopped ${selectedCloudPhoneIds.length} cloud phone environments.`,
                      )
                    })
                  }
                >
                  {t.cloudPhones.batchStop}
                </button>
                <input
                  value={cloudPhoneBatchGroupName}
                  onChange={(event) => setCloudPhoneBatchGroupName(event.target.value)}
                  placeholder={t.profiles.group}
                />
                <button
                  className="secondary"
                  disabled={
                    selectedCloudPhoneIds.length === 0 || cloudPhoneBatchGroupName.trim().length === 0
                  }
                  onClick={() =>
                    void withBusy(t.busy.bulkAssignCloudPhoneGroup, async () => {
                      const api = requireDesktopApi(['cloudPhones.bulkAssignGroup'])
                      await api.cloudPhones.bulkAssignGroup({
                        cloudPhoneIds: selectedCloudPhoneIds,
                        groupName: cloudPhoneBatchGroupName.trim(),
                      })
                      setCloudPhoneBatchGroupName('')
                      setNoticeMessage(
                        locale === 'zh-CN'
                          ? '云手机分组已更新。'
                          : 'Cloud phone group assignment updated.',
                      )
                    })
                  }
                >
                  {t.cloudPhones.batchAssignGroup}
                </button>
                <button
                  className="danger"
                  disabled={selectedCloudPhoneIds.length === 0}
                  onClick={() => void runCloudPhoneBulkDelete()}
                >
                  {t.cloudPhones.batchDelete}
                </button>
              </div>
              {Object.entries(groupedCloudPhones).map(([groupName, items]) => (
                <div key={groupName} className="profile-group">
                  <h3>{groupName}</h3>
                  {items.map((item) => (
                    <article key={item.id} className="list-row list-row-compact">
                      <label className="check-cell">
                        <input
                          type="checkbox"
                          checked={selectedCloudPhoneIds.includes(item.id)}
                          onChange={() => toggleCloudPhoneSelection(item.id)}
                        />
                      </label>
                      <div className="list-main">
                        <strong>{item.name}</strong>
                        <p>
                          {t.cloudPhones.provider}: {renderProviderLabel(item.providerKey)} · {t.cloudPhones.computeType}:{' '}
                          {item.computeType}
                        </p>
                      </div>
                      <div className="list-meta">
                        <span className={`badge ${item.status === 'running' ? 'running' : item.status === 'error' ? 'error' : 'stopped'}`}>
                          {t.cloudPhones.statusLabel(item.status)}
                        </span>
                        <button className="ghost" onClick={() => openEditCloudPhonePage(item.id)}>
                          {t.common.edit}
                        </button>
                        <button
                          className="ghost"
                          onClick={() =>
                            void withBusy(t.busy.refreshCloudPhones, async () => {
                              const api = requireDesktopApi(['cloudPhones.getDetails'])
                              const details = await api.cloudPhones.getDetails(item.id)
                              setCloudPhoneDetails(details)
                              setNoticeMessage(details.message)
                            })
                          }
                        >
                          {t.cloudPhones.details}
                        </button>
                        {item.status === 'running' || item.status === 'starting' ? (
                          <button
                            className="danger"
                            onClick={() =>
                              void withBusy(t.busy.stopCloudPhone, async () => {
                                const api = requireDesktopApi(['cloudPhones.stop'])
                                await api.cloudPhones.stop(item.id)
                                setNoticeMessage(
                                  locale === 'zh-CN' ? '云手机环境已停止。' : 'Cloud phone stopped.',
                                )
                              })
                            }
                          >
                            {t.common.stop}
                          </button>
                        ) : (
                          <button
                            className="primary"
                            onClick={() =>
                              void withBusy(t.busy.startCloudPhone, async () => {
                                const api = requireDesktopApi(['cloudPhones.start'])
                                await api.cloudPhones.start(item.id)
                                setNoticeMessage(
                                  locale === 'zh-CN' ? '云手机环境已启动。' : 'Cloud phone started.',
                                )
                              })
                            }
                          >
                            {t.common.launch}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ))}
              {filteredCloudPhones.length === 0 ? <p className="empty">{t.cloudPhones.empty}</p> : null}
            </div>
            ) : null}

            {showCloudPhoneEditor ? (
            <div className="editor-card editor-page">
              <div className="section-title">
                <div>
                  <button className="ghost page-back" onClick={returnToCloudPhoneList}>
                    {cloudPhoneBackLabel}
                  </button>
                  <h2>{selectedCloudPhoneId ? t.cloudPhones.edit : t.cloudPhones.create}</h2>
                </div>
                <button className="primary" onClick={() => void saveCloudPhone()}>
                  {selectedCloudPhoneId ? t.busy.updateCloudPhone : t.cloudPhones.create}
                </button>
              </div>
              <div className="section-title section-title-sub">
                <h2>{t.cloudPhones.providerSettings}</h2>
              </div>
              <label>
                <span>{t.cloudPhones.provider}</span>
                <select
                  value={cloudPhoneForm.providerKey}
                  onChange={(event) => updateCloudPhoneProvider(event.target.value)}
                >
                  {cloudPhoneProviders.map((provider) => (
                    <option key={provider.key} value={provider.key}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              {cloudPhoneProviderHealthMap.get(cloudPhoneForm.providerKey) ? (
                <div
                  className={`cloud-phone-provider-strip ${
                    cloudPhoneProviderHealthMap.get(cloudPhoneForm.providerKey)?.available
                      ? 'healthy'
                      : 'warning'
                  }`}
                >
                  <strong>{renderProviderLabel(cloudPhoneForm.providerKey)}</strong>
                  <span>
                    {cloudPhoneProviderHealthMap.get(cloudPhoneForm.providerKey)?.available
                      ? t.common.ready
                      : t.common.missing}
                  </span>
                  <p>{cloudPhoneProviderHealthMap.get(cloudPhoneForm.providerKey)?.message}</p>
                </div>
              ) : null}
              <div className="section-title section-title-sub">
                <h2>{t.cloudPhones.computeType}</h2>
              </div>
              <label>
                <span>{t.cloudPhones.computeType}</span>
                <select
                  value={cloudPhoneForm.computeType}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      computeType: event.target.value as CloudPhoneFormState['computeType'],
                    }))
                  }
                >
                  <option value="basic">{t.cloudPhones.computeBasic}</option>
                  <option value="standard">{t.cloudPhones.computeStandard}</option>
                  <option value="pro">{t.cloudPhones.computePro}</option>
                </select>
              </label>

              <div className="section-title section-title-sub">
                <h2>{t.profiles.title}</h2>
              </div>
              <label>
                <span>{t.profiles.name}</span>
                <input
                  value={cloudPhoneForm.name}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>{t.profiles.tags}</span>
                <input
                  value={cloudPhoneForm.tags.join(', ')}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      tags: normalizeTags(event.target.value),
                    }))
                  }
                  placeholder={t.profiles.tagsPlaceholder}
                />
              </label>
              <label>
                <span>{t.profiles.group}</span>
                <input
                  value={cloudPhoneForm.groupName}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({ ...current, groupName: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>{t.profiles.notes}</span>
                <textarea
                  rows={3}
                  value={cloudPhoneForm.notes}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>

              <div className="section-title section-title-sub">
                <h2>{t.proxies.title}</h2>
              </div>
              {cloudPhoneForm.providerKey === 'self-hosted' ? (
                <div className="split">
                  <label>
                    <span>{t.cloudPhones.baseUrl}</span>
                    <input
                      value={cloudPhoneForm.providerConfig.baseUrl ?? ''}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            baseUrl: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.cloudPhones.clusterId}</span>
                    <input
                      value={cloudPhoneForm.providerConfig.clusterId ?? ''}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            clusterId: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              {cloudPhoneForm.providerKey === 'third-party' ? (
                <div className="split">
                  <label>
                    <span>{t.cloudPhones.vendorKey}</span>
                    <input
                      value={cloudPhoneForm.providerConfig.vendorKey ?? ''}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            vendorKey: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.cloudPhones.baseUrl}</span>
                    <input
                      value={cloudPhoneForm.providerConfig.baseUrl ?? ''}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            baseUrl: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              {cloudPhoneForm.providerKey === 'local-emulator' ? (
                <>
                  <label>
                    <span>{t.cloudPhones.localDevice}</span>
                    <select
                      value={cloudPhoneForm.providerConfig.adbSerial ?? ''}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            adbSerial: event.target.value,
                            emulatorName:
                              localEmulatorDevices.find((item) => item.serial === event.target.value)?.name ??
                              event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">{t.common.loading}</option>
                      {localEmulatorDevices.map((device) => (
                        <option key={device.serial} value={device.serial}>
                          {device.name} ({device.state})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t.cloudPhones.adbPath}</span>
                    <input
                      value={cloudPhoneForm.providerConfig.adbPath ?? settings.localEmulatorAdbPath ?? 'adb'}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            adbPath: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                </>
              ) : null}
              <label>
                <span>{t.cloudPhones.ipLookupChannel}</span>
                <input
                  value={cloudPhoneForm.ipLookupChannel}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      ipLookupChannel: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>{locale === 'zh-CN' ? '代理来源' : 'Proxy source'}</span>
                <select
                  value={cloudPhoneForm.proxyRefMode}
                  onChange={(event) =>
                    updateCloudPhoneProxyRefMode(event.target.value as CloudPhoneProxyRefMode)
                  }
                >
                  <option value="saved">{locale === 'zh-CN' ? '已保存代理' : 'Saved proxy'}</option>
                  <option value="custom">{locale === 'zh-CN' ? '自定义代理' : 'Custom proxy'}</option>
                </select>
              </label>
              {cloudPhoneForm.proxyRefMode === 'saved' ? (
                <>
                  <label>
                    <span>{locale === 'zh-CN' ? '选择代理' : 'Select proxy'}</span>
                    <select
                      value={cloudPhoneForm.proxyId ?? ''}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          proxyId: event.target.value || null,
                        }))
                      }
                    >
                      <option value="">{locale === 'zh-CN' ? '请选择已保存代理' : 'Select a saved proxy'}</option>
                      {proxies.map((proxy) => (
                        <option key={proxy.id} value={proxy.id}>
                          {proxy.name} · {proxy.type.toUpperCase()} {proxy.host}:{proxy.port}
                        </option>
                      ))}
                    </select>
                  </label>
                  {resolveSelectedProxy(proxies, cloudPhoneForm.proxyId) ? (
                    <div className="section-note">
                      {(() => {
                        const selectedProxy = resolveSelectedProxy(proxies, cloudPhoneForm.proxyId)
                        if (!selectedProxy) return null
                        return locale === 'zh-CN'
                          ? `当前引用代理：${selectedProxy.name} · ${selectedProxy.type.toUpperCase()} ${selectedProxy.host}:${selectedProxy.port}`
                          : `Using saved proxy: ${selectedProxy.name} · ${selectedProxy.type.toUpperCase()} ${selectedProxy.host}:${selectedProxy.port}`
                      })()}
                    </div>
                  ) : null}
                </>
              ) : null}
              {cloudPhoneForm.proxyRefMode === 'custom' ? (
                <div className="cloud-phone-custom-proxy-fields">
              <div className="split">
                <label>
                  <span>{t.cloudPhones.proxyType}</span>
                  <select
                    value={cloudPhoneForm.proxyType}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        proxyType: event.target.value as CloudPhoneFormState['proxyType'],
                      }))
                    }
                  >
                    <option value="socks5">SOCKS5</option>
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                </label>
                <label>
                  <span>{t.cloudPhones.ipProtocol}</span>
                  <select
                    value={cloudPhoneForm.ipProtocol}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        ipProtocol: event.target.value as CloudPhoneFormState['ipProtocol'],
                      }))
                    }
                  >
                    <option value="ipv4">{t.cloudPhones.protocolIpv4}</option>
                    <option value="ipv6">{t.cloudPhones.protocolIpv6}</option>
                  </select>
                </label>
              </div>
              <label>
                <span>{t.cloudPhones.proxyHost}</span>
                <input
                  value={cloudPhoneForm.proxyHost}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({ ...current, proxyHost: event.target.value }))
                  }
                />
              </label>
              <div className="split">
                <label>
                  <span>{t.cloudPhones.proxyPort}</span>
                  <input
                    type="number"
                    value={cloudPhoneForm.proxyPort || ''}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        proxyPort: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.cloudPhones.udpEnabled}</span>
                  <select
                    value={cloudPhoneForm.udpEnabled ? 'true' : 'false'}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        udpEnabled: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">{t.common.ready}</option>
                    <option value="false">{t.common.missing}</option>
                  </select>
                </label>
              </div>
              <div className="split">
                <label>
                  <span>{t.cloudPhones.proxyUsername}</span>
                  <input
                    value={cloudPhoneForm.proxyUsername}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        proxyUsername: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.cloudPhones.proxyPassword}</span>
                  <input
                    type="password"
                    value={cloudPhoneForm.proxyPassword}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        proxyPassword: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button className="secondary" onClick={() => void testCloudPhoneProxy()}>
                {t.cloudPhones.testProxy}
              </button>
                </div>
              ) : (
                <button className="secondary" onClick={() => void testCloudPhoneProxy()}>
                  {t.cloudPhones.testProxy}
                </button>
              )}

              <div className="section-title section-title-sub">
                <h2>{t.cloudPhones.fingerprint}</h2>
              </div>
              <label>
                <span>{t.profiles.language}</span>
                <select
                  value={cloudPhoneForm.fingerprintSettings.autoLanguage ? 'auto' : 'manual'}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      fingerprintSettings: {
                        ...current.fingerprintSettings,
                        autoLanguage: event.target.value === 'auto',
                        language:
                          event.target.value === 'auto'
                            ? null
                            : current.fingerprintSettings.language ?? defaultEnvironmentLanguage,
                      },
                    }))
                  }
                >
                  <option value="auto">{t.cloudPhones.autoLanguage}</option>
                  <option value="manual">{t.common.edit}</option>
                </select>
              </label>
              {!cloudPhoneForm.fingerprintSettings.autoLanguage ? (
                <label>
                  <span>{t.profiles.language}</span>
                  <select
                    value={cloudPhoneForm.fingerprintSettings.language ?? defaultEnvironmentLanguage}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        fingerprintSettings: {
                          ...current.fingerprintSettings,
                          language: event.target.value,
                        },
                      }))
                    }
                  >
                    {SUPPORTED_ENVIRONMENT_LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {t.common.envLanguageLabel(code)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                <span>{t.profiles.timezone}</span>
                <select
                  value={cloudPhoneForm.fingerprintSettings.autoTimezone ? 'auto' : 'manual'}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      fingerprintSettings: {
                        ...current.fingerprintSettings,
                        autoTimezone: event.target.value === 'auto',
                        timezone:
                          event.target.value === 'auto'
                            ? null
                            : current.fingerprintSettings.timezone ?? 'Asia/Shanghai',
                      },
                    }))
                  }
                >
                  <option value="auto">{t.cloudPhones.autoTimezone}</option>
                  <option value="manual">{t.common.edit}</option>
                </select>
              </label>
              {!cloudPhoneForm.fingerprintSettings.autoTimezone ? (
                <label>
                  <span>{t.profiles.timezone}</span>
                  <input
                    value={cloudPhoneForm.fingerprintSettings.timezone ?? ''}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        fingerprintSettings: {
                          ...current.fingerprintSettings,
                          timezone: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              ) : null}
              <label>
                <span>{t.cloudPhones.geolocation}</span>
                <select
                  value={cloudPhoneForm.fingerprintSettings.autoGeolocation ? 'auto' : 'manual'}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      fingerprintSettings: {
                        ...current.fingerprintSettings,
                        autoGeolocation: event.target.value === 'auto',
                        geolocation:
                          event.target.value === 'auto'
                            ? null
                            : current.fingerprintSettings.geolocation ?? '',
                      },
                    }))
                  }
                >
                  <option value="auto">{t.cloudPhones.autoGeolocation}</option>
                  <option value="manual">{t.common.edit}</option>
                </select>
              </label>
              {!cloudPhoneForm.fingerprintSettings.autoGeolocation ? (
                <label>
                  <span>{t.cloudPhones.geolocation}</span>
                  <input
                    value={cloudPhoneForm.fingerprintSettings.geolocation ?? ''}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        fingerprintSettings: {
                          ...current.fingerprintSettings,
                          geolocation: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              ) : null}

              {cloudPhoneDetails ? (
                <div className="import-summary">
                  <strong>{t.cloudPhones.details}</strong>
                  <p>{cloudPhoneDetails.message}</p>
                  <p>{cloudPhoneDetails.endpointUrl ?? t.common.missing}</p>
                  <p>{cloudPhoneDetails.connectionLabel ?? t.common.missing}</p>
                </div>
              ) : null}

              <div className="actions">
                {selectedCloudPhoneId ? (
                  <button
                    className="danger"
                    onClick={() =>
                      void withBusy(t.busy.deleteCloudPhone, async () => {
                        const api = requireDesktopApi(['cloudPhones.delete'])
                        await api.cloudPhones.delete(selectedCloudPhoneId)
                        setSelectedCloudPhoneId(null)
                        setCloudPhonePageMode('list')
                        setCloudPhoneDetails(null)
                        setCloudPhoneForm(emptyCloudPhone(settings, defaultCloudPhoneProvider))
                        setNoticeMessage(
                          locale === 'zh-CN'
                            ? '云手机环境已删除。'
                            : 'Cloud phone environment deleted.',
                        )
                      })
                    }
                  >
                    {t.common.delete}
                  </button>
                ) : null}
              </div>
            </div>
            ) : null}
          </section>
        ) : null}

        {view === 'proxies' ? (
          <section className="workspace workspace-single proxy-workspace">
            <div className="list-card">
              <div className="section-title">
                <h2>{t.proxies.title}</h2>
                <button
                  className="secondary"
                  onClick={openCreateProxyPanel}
                >
                  {proxyPanelOpen && proxyPanelMode === 'create'
                    ? locale === 'zh-CN'
                      ? '收起新建'
                      : 'Close create'
                    : t.proxies.newProxy}
                </button>
              </div>

              {proxies.map((proxy) => (
                <article key={proxy.id} className="list-row">
                  <div className="list-main">
                    <strong>{proxy.name}</strong>
                    <p>
                      {proxy.type.toUpperCase()} {proxy.host}:{proxy.port}
                    </p>
                  </div>
                  <div className="list-meta">
                    <span className={`badge ${proxy.status}`}>
                      {translateStatus(locale, proxy.status)}
                    </span>
                    {proxyRowFeedback[proxy.id] ? (
                      <span className={`proxy-inline-feedback ${proxyRowFeedback[proxy.id].kind}`}>
                        {proxyRowFeedback[proxy.id].message}
                      </span>
                    ) : null}
                    <button className="ghost" onClick={() => openEditProxyPanel(proxy.id)}>
                      {t.common.edit}
                    </button>
                    <button
                      className={`primary proxy-test-button ${testingProxyId === proxy.id ? 'is-testing' : ''}`}
                      disabled={testingProxyId === proxy.id}
                      onClick={() => void testProxy(proxy.id)}
                    >
                      {testingProxyId === proxy.id ? (
                        <span className="proxy-test-button-content">
                          <span className="proxy-test-spinner" />
                          {locale === 'zh-CN' ? '测试中' : 'Testing'}
                        </span>
                      ) : (
                        t.common.test
                      )}
                    </button>
                  </div>
                </article>
              ))}
              {proxies.length === 0 ? <p className="empty">{t.proxies.empty}</p> : null}
            </div>

            {proxyPanelOpen ? (
              <div className="drawer-backdrop" onClick={closeProxyPanel}>
                <aside
                  className="drawer-panel editor-card"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="section-title">
                    <h2>{proxyPanelMode === 'edit' ? t.proxies.editProxy : t.proxies.createProxy}</h2>
                    <button className="ghost editor-close-button" onClick={closeProxyPanel}>
                      {locale === 'zh-CN' ? '关闭' : 'Close'}
                    </button>
                  </div>
                  <label>
                    <span>{t.proxies.name}</span>
                    <input
                      value={proxyForm.name}
                      onChange={(event) =>
                        setProxyForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <div className="split">
                    <label>
                      <span>{t.proxies.type}</span>
                      <select
                        value={proxyForm.type}
                        onChange={(event) =>
                          setProxyForm((current) => ({
                            ...current,
                            type: event.target.value as ProxyRecord['type'],
                          }))
                        }
                      >
                        <option value="http">HTTP</option>
                        <option value="https">HTTPS</option>
                        <option value="socks5">SOCKS5</option>
                      </select>
                    </label>
                    <label>
                      <span>{t.proxies.port}</span>
                      <input
                        type="number"
                        value={proxyForm.port}
                        onChange={(event) =>
                          setProxyForm((current) => ({
                            ...current,
                            port: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <span>{t.proxies.host}</span>
                    <input
                      value={proxyForm.host}
                      onChange={(event) =>
                        setProxyForm((current) => ({ ...current, host: event.target.value }))
                      }
                    />
                  </label>
                  <div className="split">
                    <label>
                      <span>{t.proxies.username}</span>
                      <input
                        value={proxyForm.username}
                        onChange={(event) =>
                          setProxyForm((current) => ({ ...current, username: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span>{t.proxies.password}</span>
                      <input
                        type="password"
                        value={proxyForm.password}
                        onChange={(event) =>
                          setProxyForm((current) => ({ ...current, password: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="actions">
                    <button className="primary" onClick={() => void saveProxy()}>
                      {proxyPanelMode === 'edit' ? t.proxies.updateProxy : t.proxies.createProxy}
                    </button>
                    {proxyPanelMode === 'edit' && selectedProxyId ? (
                      <button
                        className="danger"
                        onClick={() =>
                          void withBusy(t.busy.deleteProxy, async () => {
                            const api = requireDesktopApi(['proxies.delete'])
                            await api.proxies.delete(selectedProxyId)
                            closeProxyPanel()
                            setNoticeMessage(
                              locale === 'zh-CN' ? '代理已删除。' : 'Proxy deleted.',
                            )
                          })
                        }
                      >
                        {t.proxies.deleteProxy}
                      </button>
                    ) : null}
                  </div>
                </aside>
              </div>
            ) : null}
          </section>
        ) : null}

        {view === 'logs' ? (
          <section className="panel-single">
            <div className="section-title">
              <h2>{t.logs.title}</h2>
              <button
                className="secondary"
                onClick={() =>
                  void withBusy(t.busy.clearLogs, async () => {
                    const api = requireDesktopApi(['logs.clear'])
                    await api.logs.clear()
                    setNoticeMessage(locale === 'zh-CN' ? '日志已清空。' : 'Logs cleared.')
                  })
                }
              >
                {t.logs.clear}
              </button>
            </div>
            <div className="log-list">
              {logs.map((entry) => (
                <div key={entry.id} className={`log-row ${entry.level}`}>
                  <span>{translateLogLevel(locale, entry.level)}</span>
                  <p>{entry.message}</p>
                  <time>{formatDate(entry.createdAt)}</time>
                </div>
              ))}
              {logs.length === 0 ? <p className="empty">{t.logs.empty}</p> : null}
            </div>
          </section>
        ) : null}

        {view === 'settings' ? (
          <section className="workspace">
            <div className="editor-card">
              <div className="section-title">
                <h2>{t.settings.title}</h2>
              </div>
              <label>
                <span>{t.settings.language}</span>
                <select
                  value={settings.uiLanguage ?? 'zh-CN'}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      uiLanguage: event.target.value,
                    }))
                  }
                >
                  <option value="zh-CN">{t.settings.languageZh}</option>
                  <option value="en-US">{t.settings.languageEn}</option>
                </select>
              </label>
              <label>
                <span>{t.settings.defaultEnvironmentLanguage}</span>
                <select
                  value={defaultEnvironmentLanguage}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      defaultEnvironmentLanguage: event.target.value,
                    }))
                  }
                >
                  {SUPPORTED_ENVIRONMENT_LANGUAGES.map((code) => (
                    <option key={code} value={code}>
                      {t.common.envLanguageLabel(code)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.settings.controlPlaneApiBase}</span>
                <input
                  value={settings.controlPlaneApiBase ?? ''}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      controlPlaneApiBase: event.target.value,
                    }))
                  }
                  placeholder="http://duokai.duckdns.org"
                />
              </label>
              <label>
                <span>{t.settings.workspaceName}</span>
                <input
                  value={settings.workspaceName ?? ''}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      workspaceName: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>{t.settings.defaultHomePage}</span>
                <input
                  value={settings.defaultHomePage ?? ''}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      defaultHomePage: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>{t.settings.notes}</span>
                <textarea
                  rows={5}
                  value={settings.notes ?? ''}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="split">
                <label>
                  <span>{t.settings.runtimeMaxConcurrentStarts}</span>
                  <input
                    type="number"
                    min={1}
                    value={settings.runtimeMaxConcurrentStarts ?? '2'}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        runtimeMaxConcurrentStarts: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.settings.runtimeMaxActiveProfiles}</span>
                  <input
                    type="number"
                    min={1}
                    value={settings.runtimeMaxActiveProfiles ?? '6'}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        runtimeMaxActiveProfiles: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.settings.runtimeMaxLaunchRetries}</span>
                  <input
                    type="number"
                    min={0}
                    value={settings.runtimeMaxLaunchRetries ?? '2'}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        runtimeMaxLaunchRetries: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="section-title section-title-sub">
                <h2>{t.settings.cloudPhoneProviders}</h2>
              </div>
              <label>
                <span>{t.settings.defaultCloudPhoneProvider}</span>
                <select
                  value={defaultCloudPhoneProvider}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      defaultCloudPhoneProvider: event.target.value,
                    }))
                  }
                >
                  {cloudPhoneProviders.map((provider) => (
                    <option key={provider.key} value={provider.key}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="split">
                <label>
                  <span>{t.settings.selfHostedBaseUrl}</span>
                  <input
                    value={settings.selfHostedCloudPhoneBaseUrl ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        selfHostedCloudPhoneBaseUrl: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.settings.selfHostedApiKey}</span>
                  <input
                    type="password"
                    value={settings.selfHostedCloudPhoneApiKey ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        selfHostedCloudPhoneApiKey: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="split">
                <label>
                  <span>{t.settings.selfHostedClusterId}</span>
                  <input
                    value={settings.selfHostedCloudPhoneClusterId ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        selfHostedCloudPhoneClusterId: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.settings.thirdPartyVendor}</span>
                  <input
                    value={settings.thirdPartyCloudPhoneVendor ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        thirdPartyCloudPhoneVendor: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="split">
                <label>
                  <span>{t.settings.thirdPartyBaseUrl}</span>
                  <input
                    value={settings.thirdPartyCloudPhoneBaseUrl ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        thirdPartyCloudPhoneBaseUrl: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.settings.thirdPartyToken}</span>
                  <input
                    type="password"
                    value={settings.thirdPartyCloudPhoneToken ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        thirdPartyCloudPhoneToken: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                <span>{t.settings.localEmulatorAdbPath}</span>
                <input
                  value={settings.localEmulatorAdbPath ?? 'adb'}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      localEmulatorAdbPath: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="import-summary">
                <strong>{t.settings.providerHealth}</strong>
                  <ul className="warning-list">
                    {cloudPhoneProviderHealth.map((provider) => (
                      <li key={provider.key}>
                        {renderProviderLabel(provider.key)}: {provider.available ? t.common.ready : t.common.missing} ·{' '}
                        {provider.message}
                      </li>
                    ))}
                </ul>
              </div>
              {localEmulatorDevices.length > 0 ? (
                <div className="import-summary">
                  <strong>{t.settings.localDevices}</strong>
                  <ul className="warning-list">
                    {localEmulatorDevices.map((device) => (
                      <li key={device.serial}>
                        {device.name} ({device.serial}) · {device.state}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="actions">
                <button className="primary" onClick={() => void saveSettings()}>
                  {t.settings.save}
                </button>
              </div>
            </div>

            <div className="list-card">
              <div className="section-title">
                <h2>{t.settings.dataTools}</h2>
              </div>
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() =>
                    void withBusy(t.busy.exportBundle, async () => {
                      const api = requireDesktopApi(['data.exportBundle'])
                      await api.data.exportBundle()
                      setNoticeMessage(
                        locale === 'zh-CN' ? '配置包已导出。' : 'Configuration bundle exported.',
                      )
                    })
                  }
                >
                  {t.settings.exportBundle}
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void withBusy(t.busy.importBundle, async () => {
                      const api = requireDesktopApi(['data.importBundle'])
                      const result = await api.data.importBundle()
                      setImportResult(result)
                      if (result) {
                        setNoticeMessage(
                          locale === 'zh-CN'
                            ? '配置包已导入，数据已刷新。'
                            : 'Configuration bundle imported and data refreshed.',
                        )
                      }
                    })
                  }
                >
                  {t.settings.importBundle}
                </button>
              </div>

              {importResult ? (
                <div className="import-summary">
                  <strong>{t.settings.importResult}</strong>
                  <p>{t.common.importSummary(importResult)}</p>
                  {importResult.warnings.length > 0 ? (
                    <ul className="warning-list">
                      {importResult.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="section-title section-title-sub">
                <h2>{t.settings.runtimePaths}</h2>
              </div>
              <dl className="details-list">
                <div>
                  <dt>{t.settings.appData}</dt>
                  <dd>{directoryInfo?.appDataDir ?? t.common.loading}</dd>
                </div>
                <div>
                  <dt>{t.settings.profiles}</dt>
                  <dd>{directoryInfo?.profilesDir ?? t.common.loading}</dd>
                </div>
                <div>
                  <dt>{t.settings.chromiumBinary}</dt>
                  <dd>{directoryInfo?.chromiumExecutable ?? t.settings.missingChromium}</dd>
                </div>
              </dl>

              <div className="section-title section-title-sub">
                <h2>{t.settings.runtimeInfo}</h2>
              </div>
              <dl className="details-list">
                <div>
                  <dt>{t.settings.runtimeMode}</dt>
                  <dd>{runtimeInfo?.mode ?? t.common.loading}</dd>
                </div>
                <div>
                  <dt>{t.settings.mainVersion}</dt>
                  <dd>{runtimeInfo?.mainVersion ?? t.common.loading}</dd>
                </div>
                <div>
                  <dt>{t.settings.preloadVersion}</dt>
                  <dd>{runtimeInfo?.preloadVersion ?? t.common.loading}</dd>
                </div>
                <div>
                  <dt>{t.settings.rendererVersion}</dt>
                  <dd>{runtimeInfo?.rendererVersion ?? __APP_VERSION__}</dd>
                </div>
                <div>
                  <dt>{t.settings.capabilities}</dt>
                  <dd>{runtimeInfo?.capabilities.join(', ') ?? t.common.loading}</dd>
                </div>
              </dl>

              <div className="section-title section-title-sub">
                <h2>{locale === 'zh-CN' ? '桌面端更新' : 'Desktop updates'}</h2>
              </div>
              <div className="update-card">
                <div className="update-card-main">
                  <strong>
                    {locale === 'zh-CN'
                      ? `当前版本 ${runtimeInfo?.appVersion ?? __APP_VERSION__}`
                      : `Current version ${runtimeInfo?.appVersion ?? __APP_VERSION__}`}
                  </strong>
                  <p>{describeUpdateStatus(updateState)}</p>
                  <dl className="details-list compact">
                    <div>
                      <dt>{locale === 'zh-CN' ? '最新版本' : 'Latest version'}</dt>
                      <dd>{updateState?.latestVersion || '-'}</dd>
                    </div>
                    <div>
                      <dt>{locale === 'zh-CN' ? '发布时间' : 'Published at'}</dt>
                      <dd>{updateState?.publishedAt ? formatDate(updateState.publishedAt) : t.common.never}</dd>
                    </div>
                    <div>
                      <dt>{locale === 'zh-CN' ? '安装包' : 'Installer asset'}</dt>
                      <dd>{updateState?.assetName || '-'}</dd>
                    </div>
                    <div>
                      <dt>{locale === 'zh-CN' ? '最近检查' : 'Last checked'}</dt>
                      <dd>{updateState?.checkedAt ? formatDate(updateState.checkedAt) : t.common.never}</dd>
                    </div>
                  </dl>
                  {updateState?.downloadedFile ? (
                    <p className="section-note">
                      {locale === 'zh-CN'
                        ? `已下载到：${updateState.downloadedFile}`
                        : `Downloaded to: ${updateState.downloadedFile}`}
                    </p>
                  ) : null}
                  {rendererOperatingSystem === 'macOS' ? (
                    <p className="section-note">
                      {locale === 'zh-CN'
                        ? 'Mac 当前采用“检测更新并提示安装”模式，下载后会打开安装包。'
                        : 'On macOS the app checks for updates and opens the installer package after download.'}
                    </p>
                  ) : null}
                </div>
                <div className="update-card-actions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void handlePrimaryUpdateAction()}
                    disabled={updateState?.status === 'downloading'}
                  >
                    {getUpdateActionLabel(updateState)}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void checkForUpdates(true)}>
                    {locale === 'zh-CN' ? '重新检查' : 'Check again'}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void openReleasePage()}>
                    {locale === 'zh-CN' ? '打开发布页' : 'Open release page'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {view === 'account' ? (
          <section className="workspace workspace-single">
            <div className="editor-card account-card">
              <div className="section-title">
                <h2>{locale === 'zh-CN' ? '个人中心' : 'Personal Center'}</h2>
              </div>
              <div className="account-hero">
                {currentAuthUser?.avatarUrl ? (
                  <img className="account-avatar account-avatar-image" src={currentAuthUser.avatarUrl} alt="avatar" />
                ) : (
                  <span className="account-avatar">
                    {(currentAuthUser?.name || currentAuthUser?.username || currentAuthUser?.email || 'U')
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                )}
                <div>
                  <strong>{currentAuthUser?.name || currentAuthUser?.username || currentAuthUser?.email}</strong>
                  <p>{currentAuthUser?.email || currentAuthUser?.username}</p>
                </div>
              </div>
              <dl className="details-list">
                <div>
                  <dt>{locale === 'zh-CN' ? '账号 ID' : 'Account ID'}</dt>
                  <dd>{currentAuthUser?.id || '-'}</dd>
                </div>
                <div>
                  <dt>{locale === 'zh-CN' ? '用户名' : 'Username'}</dt>
                  <dd>{currentAuthUser?.username || '-'}</dd>
                </div>
                <div>
                  <dt>{locale === 'zh-CN' ? '邮箱' : 'Email'}</dt>
                  <dd>{currentAuthUser?.email || '-'}</dd>
                </div>
                <div>
                  <dt>{locale === 'zh-CN' ? '角色' : 'Role'}</dt>
                  <dd>{currentAuthUser?.role || '-'}</dd>
                </div>
                <div>
                  <dt>{locale === 'zh-CN' ? '状态' : 'Status'}</dt>
                  <dd>{currentAuthUser?.status || '-'}</dd>
                </div>
              </dl>
              <div className="section-title section-title-sub">
                <h2>{locale === 'zh-CN' ? '基础资料' : 'Basic profile'}</h2>
              </div>
              <div className="split">
                <label>
                  <span>{locale === 'zh-CN' ? '名称' : 'Name'}</span>
                  <input
                    value={accountProfileForm.name}
                    onChange={(event) =>
                      setAccountProfileForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>{locale === 'zh-CN' ? '账号' : 'Username'}</span>
                  <input
                    value={accountProfileForm.username}
                    onChange={(event) =>
                      setAccountProfileForm((current) => ({
                        ...current,
                        username: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                <span>{locale === 'zh-CN' ? '头像' : 'Avatar'}</span>
                <div className="account-avatar-row">
                  <input
                    value={accountProfileForm.avatarUrl}
                    onChange={(event) =>
                      setAccountProfileForm((current) => ({
                        ...current,
                        avatarUrl: event.target.value,
                      }))
                    }
                    placeholder="https://example.com/avatar.png"
                  />
                  <button className="secondary" type="button" onClick={() => void uploadAccountAvatar()}>
                    {locale === 'zh-CN' ? '上传图片' : 'Upload image'}
                  </button>
                </div>
              </label>
              <label>
                <span>{locale === 'zh-CN' ? '邮箱' : 'Email'}</span>
                <input
                  value={accountProfileForm.email}
                  onChange={(event) =>
                    setAccountProfileForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>{locale === 'zh-CN' ? '备注' : 'Bio / Notes'}</span>
                <textarea
                  rows={4}
                  value={accountProfileForm.bio}
                  onChange={(event) =>
                    setAccountProfileForm((current) => ({ ...current, bio: event.target.value }))
                  }
                />
              </label>
              <div className="actions">
                <button className="primary" onClick={() => void saveAccountProfile()}>
                  {locale === 'zh-CN' ? '保存资料' : 'Save profile'}
                </button>
              </div>
              <div className="section-title section-title-sub">
                <h2>{locale === 'zh-CN' ? '登录设备' : 'Logged-in devices'}</h2>
              </div>
              {currentAuthUser?.devices && currentAuthUser.devices.length > 0 ? (
                <div className="device-list">
                  {currentAuthUser.devices.map((device) => (
                    <div key={device.deviceId} className="device-card">
                      <strong>{device.deviceName || device.deviceId}</strong>
                      <p>
                        {(device.platform || '-') +
                          ' · ' +
                          (device.source || '-')}
                      </p>
                      {device.isCurrent ? (
                        <span className="device-badge">
                          {locale === 'zh-CN' ? '当前设备' : 'Current device'}
                        </span>
                      ) : null}
                      <p>
                        {locale === 'zh-CN' ? '最近登录' : 'Last login'}: {formatDate(device.lastLoginAt)}
                      </p>
                      <p>
                        {locale === 'zh-CN' ? '最近在线' : 'Last seen'}: {formatDate(device.lastSeenAt)}
                      </p>
                      {device.revokedAt ? (
                        <p>
                          {locale === 'zh-CN' ? '已失效' : 'Revoked'}: {formatDate(device.revokedAt)}
                        </p>
                      ) : null}
                      <div className="device-actions">
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => void revokeAccountDevice(device.deviceId)}
                        >
                          {device.isCurrent
                            ? locale === 'zh-CN'
                              ? '踢下当前设备'
                              : 'Revoke current'
                            : locale === 'zh-CN'
                              ? '踢下线'
                              : 'Revoke'}
                        </button>
                        <button
                          className="ghost danger"
                          type="button"
                          onClick={() => void deleteAccountDevice(device.deviceId)}
                        >
                          {locale === 'zh-CN' ? '删除设备' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">{locale === 'zh-CN' ? '暂无设备记录。' : 'No device records yet.'}</p>
              )}
              <div className="section-title section-title-sub">
                <h2>{locale === 'zh-CN' ? '订阅信息' : 'Subscription'}</h2>
              </div>
              <dl className="details-list">
                <div>
                  <dt>{locale === 'zh-CN' ? '套餐' : 'Plan'}</dt>
                  <dd>{currentAuthUser?.subscription?.plan || 'free'}</dd>
                </div>
                <div>
                  <dt>{locale === 'zh-CN' ? '状态' : 'Status'}</dt>
                  <dd>{currentAuthUser?.subscription?.status || 'free'}</dd>
                </div>
                <div>
                  <dt>{locale === 'zh-CN' ? '到期时间' : 'Expires at'}</dt>
                  <dd>{formatDate(currentAuthUser?.subscription?.expiresAt || null)}</dd>
                </div>
              </dl>
              <div className="section-title section-title-sub">
                <h2>{locale === 'zh-CN' ? '密码安全' : 'Password security'}</h2>
              </div>
              <div className="split">
                <label>
                  <span>{locale === 'zh-CN' ? '当前密码' : 'Current password'}</span>
                  <input
                    type="password"
                    value={accountPasswordForm.currentPassword}
                    onChange={(event) =>
                      setAccountPasswordForm((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{locale === 'zh-CN' ? '新密码' : 'New password'}</span>
                  <input
                    type="password"
                    value={accountPasswordForm.nextPassword}
                    onChange={(event) =>
                      setAccountPasswordForm((current) => ({
                        ...current,
                        nextPassword: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                <span>{locale === 'zh-CN' ? '确认新密码' : 'Confirm new password'}</span>
                <input
                  type="password"
                  value={accountPasswordForm.confirmPassword}
                  onChange={(event) =>
                    setAccountPasswordForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="actions">
                <button className="secondary" onClick={() => void saveAccountPassword()}>
                  {locale === 'zh-CN' ? '修改密码' : 'Change password'}
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

export default App
