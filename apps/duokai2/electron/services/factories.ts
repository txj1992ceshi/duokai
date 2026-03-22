import { randomUUID } from 'node:crypto'
import type {
  BrowserKernel,
  CloudPhoneFingerprintSettings,
  CreateCloudPhoneInput,
  CreateProfileInput,
  CreateProxyInput,
  CreateTemplateInput,
  FingerprintConfig,
  ProfileAdvancedFingerprintSettings,
  ProfileBasicSettings,
  ProfileCommonSettings,
  ProfileProxySettings,
  ProfileRuntimeMetadata,
  UpdateCloudPhoneInput,
  UpdateProfileInput,
  UpdateProxyInput,
  UpdateTemplateInput,
} from '../../src/shared/types'
import { DEFAULT_ENVIRONMENT_LANGUAGE } from '../../src/shared/environmentLanguages'

export function createDefaultFingerprint(): FingerprintConfig {
  const basicSettings: ProfileBasicSettings = {
    platform: '',
    customPlatformName: '',
    customPlatformUrl: '',
    platformUsername: '',
    platformPassword: '',
    validateByUsername: false,
    multiOpenMode: 'allow',
    twoFactorSecret: '',
    cookieSeed: '',
  }

  const proxySettings: ProfileProxySettings = {
    proxyMode: 'direct',
    ipLookupChannel: 'IP2Location',
    proxyType: 'http',
    ipProtocol: 'ipv4',
    host: '',
    port: 0,
    username: '',
    password: '',
    udpEnabled: false,
  }

  const commonSettings: ProfileCommonSettings = {
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
  }

  const advanced: ProfileAdvancedFingerprintSettings = {
    browserKernel: 'chrome',
    browserKernelVersion: '140',
    deviceMode: 'desktop',
    operatingSystem: 'Windows',
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
  }

  const runtimeMetadata: ProfileRuntimeMetadata = {
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
    launchRetryCount: 0,
    injectedFeatures: [],
  }

  return {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    language: DEFAULT_ENVIRONMENT_LANGUAGE,
    timezone: '',
    resolution: '1440x900',
    webrtcMode: 'default',
    basicSettings,
    proxySettings,
    commonSettings,
    advanced,
    runtimeMetadata,
  }
}

function normalizeBrowserKernel(value?: string | null): BrowserKernel {
  if (value === 'system-default' || value === 'bitfox') {
    return 'system-default'
  }
  return 'chrome'
}

export function normalizeFingerprintConfig(input?: Partial<FingerprintConfig> | null): FingerprintConfig {
  const defaults = createDefaultFingerprint()
  const source = input ?? {}
  const hasExplicitAutoTimezone = Object.prototype.hasOwnProperty.call(
    source.advanced ?? {},
    'autoTimezoneFromIp',
  )
  const normalizedAutoTimezone = hasExplicitAutoTimezone
    ? Boolean(source.advanced?.autoTimezoneFromIp)
    : !(typeof source.timezone === 'string' && source.timezone.trim().length > 0)
  return {
    ...defaults,
    ...source,
    basicSettings: {
      ...defaults.basicSettings,
      ...(source.basicSettings ?? {}),
    },
    proxySettings: {
      ...defaults.proxySettings,
      ...(source.proxySettings ?? {}),
    },
    commonSettings: {
      ...defaults.commonSettings,
      ...(source.commonSettings ?? {}),
    },
    advanced: {
      ...defaults.advanced,
      ...(source.advanced ?? {}),
      browserKernel: normalizeBrowserKernel(source.advanced?.browserKernel),
      autoTimezoneFromIp: normalizedAutoTimezone,
    },
    runtimeMetadata: {
      ...defaults.runtimeMetadata,
      ...(source.runtimeMetadata ?? {}),
    },
  }
}

export function createDefaultCloudPhoneFingerprintSettings(): CloudPhoneFingerprintSettings {
  return {
    autoLanguage: true,
    language: null,
    autoTimezone: true,
    timezone: null,
    autoGeolocation: true,
    geolocation: null,
  }
}

export function createProfilePayload(
  input: CreateProfileInput | UpdateProfileInput,
  createFingerprint: () => FingerprintConfig,
): UpdateProfileInput {
  return {
    id: 'id' in input ? input.id : randomUUID(),
    name: input.name.trim(),
    proxyId: input.proxyId,
    groupName: input.groupName.trim(),
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    notes: input.notes.trim(),
    fingerprintConfig: normalizeFingerprintConfig({
      ...createFingerprint(),
      ...input.fingerprintConfig,
    }),
  }
}

export function createProxyPayload(
  input: CreateProxyInput | UpdateProxyInput,
): UpdateProxyInput {
  return {
    id: 'id' in input ? input.id : randomUUID(),
    name: input.name.trim(),
    type: input.type,
    host: input.host.trim(),
    port: Number(input.port),
    username: input.username.trim(),
    password: input.password,
  }
}

export function createTemplatePayload(
  input: CreateTemplateInput | UpdateTemplateInput,
  createFingerprint: () => FingerprintConfig,
): UpdateTemplateInput {
  return {
    id: 'id' in input ? input.id : randomUUID(),
    name: input.name.trim(),
    proxyId: input.proxyId,
    groupName: input.groupName.trim(),
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    notes: input.notes.trim(),
    fingerprintConfig: normalizeFingerprintConfig({
      ...createFingerprint(),
      ...input.fingerprintConfig,
    }),
  }
}

export function cloneName(name: string): string {
  return `${name} Copy`
}

export function createCloudPhonePayload(
  input: CreateCloudPhoneInput | UpdateCloudPhoneInput,
  providerKey = 'mock',
): UpdateCloudPhoneInput {
  return {
    id: 'id' in input ? input.id : randomUUID(),
    ...input,
    name: input.name.trim(),
    groupName: input.groupName.trim(),
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    notes: input.notes.trim(),
    platform: 'android',
    providerKey,
    providerKind: input.providerKind,
    providerConfig: {
      ...input.providerConfig,
      baseUrl: input.providerConfig.baseUrl?.trim(),
      apiKey: input.providerConfig.apiKey?.trim(),
      clusterId: input.providerConfig.clusterId?.trim(),
      poolId: input.providerConfig.poolId?.trim(),
      vendorKey: input.providerConfig.vendorKey?.trim(),
      token: input.providerConfig.token?.trim(),
      projectId: input.providerConfig.projectId?.trim(),
      adbSerial: input.providerConfig.adbSerial?.trim(),
      emulatorName: input.providerConfig.emulatorName?.trim(),
      adbPath: input.providerConfig.adbPath?.trim(),
    },
    ipLookupChannel: input.ipLookupChannel.trim(),
    proxyHost: input.proxyHost.trim(),
    proxyPort: Number(input.proxyPort),
    proxyUsername: input.proxyUsername.trim(),
    proxyPassword: input.proxyPassword,
    fingerprintSettings: {
      ...createDefaultCloudPhoneFingerprintSettings(),
      ...input.fingerprintSettings,
      language: input.fingerprintSettings.autoLanguage
        ? null
        : input.fingerprintSettings.language?.trim() || null,
      timezone: input.fingerprintSettings.autoTimezone
        ? null
        : input.fingerprintSettings.timezone?.trim() || null,
      geolocation: input.fingerprintSettings.autoGeolocation
        ? null
        : input.fingerprintSettings.geolocation?.trim() || null,
    },
  }
}
