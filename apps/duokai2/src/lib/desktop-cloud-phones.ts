import type {
  CloudPhoneFingerprintSettings,
  CloudPhoneProviderConfig,
  CloudPhoneProviderKind,
  CreateCloudPhoneInput,
  SettingsPayload,
} from '../shared/types'

const CLOUD_PHONE_PROVIDER_KIND_MAP: Record<string, CloudPhoneProviderKind> = {
  'self-hosted': 'self-hosted',
  'third-party': 'third-party',
  'local-emulator': 'local-emulator',
  mock: 'mock',
}

export function buildProviderConfig(
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

export function providerKindForKey(providerKey: string): CloudPhoneProviderKind {
  return CLOUD_PHONE_PROVIDER_KIND_MAP[providerKey] ?? 'mock'
}

export function emptyCloudPhone(
  settings: SettingsPayload = {},
  defaultProviderKey: string = settings.defaultCloudPhoneProvider || 'self-hosted',
): CreateCloudPhoneInput {
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
