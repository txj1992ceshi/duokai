import { createHash, randomUUID } from 'node:crypto'
import { createDeviceProfileFromFingerprint, DEFAULT_ENVIRONMENT_PURPOSE } from './deviceProfile'
import type {
  BrowserKernel,
  CloudPhoneFingerprintSettings,
  CreateCloudPhoneInput,
  CreateProfileInput,
  CreateProxyInput,
  CreateTemplateInput,
  EnvironmentPurpose,
  FingerprintConfig,
  ProfileRecord,
  WorkspaceAllowedOverrideKey,
  WorkspaceBlockedOverrideKey,
  WorkspaceMigrationCheckpoint,
  WorkspaceConsistencyReport,
  WorkspaceDescriptor,
  WorkspaceEnvironment,
  WorkspaceHealthReport,
  WorkspacePaths,
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

export interface PlatformTemplatePreset {
  key: 'linkedin' | 'tiktok'
  recommendedPurpose: EnvironmentPurpose
  summaryZh: string
  summaryEn: string
}

const PLATFORM_TEMPLATE_PRESETS: Record<'linkedin' | 'tiktok', PlatformTemplatePreset> = {
  linkedin: {
    key: 'linkedin',
    recommendedPurpose: 'register',
    summaryZh: '更保守的办公桌面画像，适合注册与资料完善。',
    summaryEn: 'Conservative office-style desktop profile suited for registration and profile completion.',
  },
  tiktok: {
    key: 'tiktok',
    recommendedPurpose: 'nurture',
    summaryZh: '偏内容消费与日常运营的桌面画像，适合养号和长期使用。',
    summaryEn: 'Content-oriented desktop profile suited for nurture and long-term operation.',
  },
}

export const WORKSPACE_ALLOWED_OVERRIDES: WorkspaceAllowedOverrideKey[] = [
  'timezone',
  'browserLanguage',
  'resolution',
  'downloadsDirAlias',
  'nonCriticalLaunchArgs',
]

export const WORKSPACE_BLOCKED_OVERRIDES: WorkspaceBlockedOverrideKey[] = [
  'browserFamily',
  'profileDir',
  'extensionsDirRoot',
  'webrtcHardPolicy',
  'ipv6HardPolicy',
  'browserMajorVersionRange',
]

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function buildWorkspaceTemplateFingerprintHash(
  templateId: string,
  templateRevision: string,
  resolvedEnvironment: WorkspaceEnvironment,
  paths: WorkspacePaths,
): string {
  return stableHash({
    templateId,
    templateRevision,
    browserFamily: resolvedEnvironment.browserFamily,
    browserMajorVersionRange: resolvedEnvironment.browserMajorVersionRange,
    webrtcPolicy: resolvedEnvironment.webrtcPolicy,
    ipv6Policy: resolvedEnvironment.ipv6Policy,
    profileDir: paths.profileDir,
    extensionsDir: paths.extensionsDir,
    metaDir: paths.metaDir,
  })
}

function createDefaultWorkspacePaths(profileId: string): WorkspacePaths {
  const root = `workspaces/${profileId}`
  return {
    profileDir: `${root}/profile`,
    cacheDir: `${root}/cache`,
    downloadsDir: `${root}/downloads`,
    extensionsDir: `${root}/extensions`,
    metaDir: `${root}/meta`,
  }
}

function normalizeMigrationCheckpoints(
  checkpoints: WorkspaceMigrationCheckpoint[] | null | undefined,
): WorkspaceMigrationCheckpoint[] {
  if (!Array.isArray(checkpoints)) {
    return []
  }
  return checkpoints
    .filter((item): item is WorkspaceMigrationCheckpoint => Boolean(item?.name))
    .map((item) => ({
      name: item.name,
      completedAt: String(item.completedAt || ''),
    }))
}

function createDefaultWorkspaceHealth(): WorkspaceHealthReport {
  return {
    status: 'unknown',
    messages: [],
    checkedAt: '',
  }
}

function createDefaultWorkspaceConsistency(
  templateFingerprintHash: string,
  templateRevision: string,
): WorkspaceConsistencyReport {
  return {
    status: 'unknown',
    messages: [],
    checkedAt: '',
    templateFingerprintHash,
    templateRevision,
  }
}

function createDefaultWorkspaceTrustSummary(): WorkspaceDescriptor['trustSummary'] {
  return {
    lastQuickIsolationCheckAt: '',
    lastQuickIsolationCheckSuccess: null,
    lastQuickIsolationCheckMessage: '',
    trustedSnapshotStatus: 'unknown',
    trustedLaunchVerifiedAt: '',
    activeRuntimeLock: {
      state: 'unlocked',
      ownerDeviceId: '',
      ownerPid: null,
      updatedAt: '',
    },
  }
}

function createResolvedWorkspaceEnvironment(
  fingerprintConfig: FingerprintConfig,
  paths: WorkspacePaths,
): WorkspaceEnvironment {
  return {
    browserFamily: fingerprintConfig.advanced.browserKernel,
    browserMajorVersionRange: String(fingerprintConfig.advanced.browserVersion || '').trim(),
    systemLanguage: fingerprintConfig.advanced.interfaceLanguage || fingerprintConfig.language,
    browserLanguage: fingerprintConfig.language,
    timezone: fingerprintConfig.timezone,
    resolution: fingerprintConfig.resolution,
    fontStrategy: fingerprintConfig.advanced.fontMode,
    webrtcPolicy: fingerprintConfig.webrtcMode,
    ipv6Policy: fingerprintConfig.proxySettings.ipProtocol,
    downloadsDir: paths.downloadsDir,
    launchArgs: fingerprintConfig.advanced.launchArgs
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  }
}

function normalizeDeclaredOverrides(
  input: WorkspaceDescriptor['declaredOverrides'] | null | undefined,
): WorkspaceDescriptor['declaredOverrides'] {
  const result: WorkspaceDescriptor['declaredOverrides'] = {}
  if (!input) {
    return result
  }
  for (const key of WORKSPACE_ALLOWED_OVERRIDES) {
    const value = input[key]
    if (typeof value === 'string') {
      result[key] = value
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => String(item))
    }
  }
  return result
}

export function createDefaultWorkspaceDescriptor(
  profileId: string,
  fingerprintConfig: FingerprintConfig,
  existing?: Partial<WorkspaceDescriptor> | null,
): WorkspaceDescriptor {
  const paths = {
    ...createDefaultWorkspacePaths(profileId),
    ...(existing?.paths ?? {}),
  }
  const resolvedEnvironment = {
    ...createResolvedWorkspaceEnvironment(fingerprintConfig, paths),
    ...(existing?.resolvedEnvironment ?? {}),
  }
  const legacyTemplateId =
    typeof (existing as { templateId?: unknown } | null)?.templateId === 'string' ?
      String((existing as { templateId?: string }).templateId || '').trim()
    : ''
  const legacyTemplateRevision =
    typeof (existing as { templateRevision?: unknown } | null)?.templateRevision === 'string' ?
      String((existing as { templateRevision?: string }).templateRevision || '').trim()
    : ''
  const legacyTemplateFingerprintHash =
    typeof (existing as { templateFingerprintHash?: unknown } | null)?.templateFingerprintHash === 'string' ?
      String((existing as { templateFingerprintHash?: string }).templateFingerprintHash || '').trim()
    : ''
  const templateId = String(existing?.templateBinding?.templateId || legacyTemplateId || '').trim()
  const templateRevision =
    String(existing?.templateBinding?.templateRevision || legacyTemplateRevision || 'legacy-profile-v1').trim() ||
    'legacy-profile-v1'
  const templateFingerprintHash =
    buildWorkspaceTemplateFingerprintHash(templateId, templateRevision, resolvedEnvironment, paths) ||
    String(existing?.templateBinding?.templateFingerprintHash || legacyTemplateFingerprintHash || '').trim()

  return {
    identityProfileId: profileId,
    version: Number(existing?.version || 1) || 1,
    migrationState: existing?.migrationState || 'not_started',
    migrationCheckpoints: normalizeMigrationCheckpoints(existing?.migrationCheckpoints),
    templateBinding: {
      templateId,
      templateRevision,
      templateFingerprintHash,
    },
    allowedOverrides: [...WORKSPACE_ALLOWED_OVERRIDES],
    blockedOverrides: [...WORKSPACE_BLOCKED_OVERRIDES],
    declaredOverrides: normalizeDeclaredOverrides(existing?.declaredOverrides),
    resolvedEnvironment,
    paths,
    healthSummary: {
      ...createDefaultWorkspaceHealth(),
      ...(existing?.healthSummary ??
        (existing as { health?: WorkspaceHealthReport } | null)?.health ??
        {}),
    },
    consistencySummary: {
      ...createDefaultWorkspaceConsistency(templateFingerprintHash, templateRevision),
      ...(existing?.consistencySummary ??
        (existing as { consistency?: WorkspaceConsistencyReport } | null)?.consistency ??
        {}),
      templateFingerprintHash,
      templateRevision,
    },
    trustSummary: {
      ...createDefaultWorkspaceTrustSummary(),
      ...(existing?.trustSummary ?? {}),
      activeRuntimeLock: {
        ...createDefaultWorkspaceTrustSummary().activeRuntimeLock,
        ...(existing?.trustSummary?.activeRuntimeLock ?? {}),
      },
    },
    snapshotSummary: {
      lastSnapshotId: String(existing?.snapshotSummary?.lastSnapshotId || '').trim(),
      lastSnapshotAt: String(existing?.snapshotSummary?.lastSnapshotAt || '').trim(),
      lastKnownGoodSnapshotId: String(existing?.snapshotSummary?.lastKnownGoodSnapshotId || '').trim(),
      lastKnownGoodSnapshotAt: String(existing?.snapshotSummary?.lastKnownGoodSnapshotAt || '').trim(),
      lastKnownGoodStatus:
        existing?.snapshotSummary?.lastKnownGoodStatus === 'valid' ||
        existing?.snapshotSummary?.lastKnownGoodStatus === 'invalid'
          ? existing.snapshotSummary.lastKnownGoodStatus
          : 'unknown',
      lastKnownGoodInvalidatedAt: String(existing?.snapshotSummary?.lastKnownGoodInvalidatedAt || '').trim(),
      lastKnownGoodInvalidationReason: String(
        existing?.snapshotSummary?.lastKnownGoodInvalidationReason || '',
      ).trim(),
    },
    recovery: {
      lastRecoveryAt: String(existing?.recovery?.lastRecoveryAt || '').trim(),
      lastRecoveryReason: String(existing?.recovery?.lastRecoveryReason || '').trim(),
    },
  }
}

export function normalizeWorkspaceDescriptor(
  input: Partial<WorkspaceDescriptor> | null | undefined,
  profileId: string,
  fingerprintConfig: FingerprintConfig,
): WorkspaceDescriptor {
  return createDefaultWorkspaceDescriptor(profileId, fingerprintConfig, input)
}

export function syncFingerprintConfigWithWorkspaceEnvironment(
  fingerprintConfig: FingerprintConfig,
  workspace: WorkspaceDescriptor | null | undefined,
): FingerprintConfig {
  if (!workspace) {
    return fingerprintConfig
  }
  const { resolvedEnvironment } = workspace
  const [widthText, heightText] = resolvedEnvironment.resolution.split('x')
  const width = Number(widthText)
  const height = Number(heightText)
  return {
    ...fingerprintConfig,
    language: resolvedEnvironment.browserLanguage,
    timezone: resolvedEnvironment.timezone,
    resolution: resolvedEnvironment.resolution,
    webrtcMode: resolvedEnvironment.webrtcPolicy,
    proxySettings: {
      ...fingerprintConfig.proxySettings,
      ipProtocol: resolvedEnvironment.ipv6Policy,
    },
    advanced: {
      ...fingerprintConfig.advanced,
      browserKernel: resolvedEnvironment.browserFamily,
      browserVersion: resolvedEnvironment.browserMajorVersionRange,
      interfaceLanguage: resolvedEnvironment.systemLanguage,
      fontMode: resolvedEnvironment.fontStrategy,
      launchArgs: resolvedEnvironment.launchArgs.join(', '),
      windowWidth: Number.isFinite(width) && width > 0 ? width : fingerprintConfig.advanced.windowWidth,
      windowHeight: Number.isFinite(height) && height > 0 ? height : fingerprintConfig.advanced.windowHeight,
    },
  }
}

function detectHostOperatingSystem(): string {
  switch (process.platform) {
    case 'darwin':
      return 'macOS'
    case 'linux':
      return 'Linux'
    default:
      return 'Windows'
  }
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
    operatingSystem: detectHostOperatingSystem(),
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
  }

  return {
    userAgent: buildDesktopUserAgent(advanced.operatingSystem, advanced.browserVersion),
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

export function getPlatformTemplatePreset(platform: string): PlatformTemplatePreset | null {
  const normalized = platform.trim().toLowerCase()
  if (normalized === 'linkedin' || normalized === 'tiktok') {
    return PLATFORM_TEMPLATE_PRESETS[normalized]
  }
  return null
}

export function applyPlatformTemplate(
  fingerprint: FingerprintConfig,
  platform: string,
): {
  fingerprint: FingerprintConfig
  recommendedPurpose: EnvironmentPurpose | null
} {
  const preset = getPlatformTemplatePreset(platform)
  if (!preset) {
    return {
      fingerprint,
      recommendedPurpose: null,
    }
  }

  if (preset.key === 'linkedin') {
    const browserVersion = '136'
    const operatingSystem = 'Windows'
    return {
      recommendedPurpose: preset.recommendedPurpose,
      fingerprint: {
        ...fingerprint,
        userAgent: buildDesktopUserAgent(operatingSystem, browserVersion),
        basicSettings: {
          ...fingerprint.basicSettings,
          platform: 'linkedin',
        },
        commonSettings: {
          ...fingerprint.commonSettings,
          pageMode: 'local',
          blockImages: false,
          memorySaver: true,
        },
        advanced: {
          ...fingerprint.advanced,
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
  }

  const browserVersion = '136'
  const operatingSystem = 'Windows'
  return {
    recommendedPurpose: preset.recommendedPurpose,
    fingerprint: {
      ...fingerprint,
      userAgent: buildDesktopUserAgent(operatingSystem, browserVersion),
      basicSettings: {
        ...fingerprint.basicSettings,
        platform: 'tiktok',
      },
      commonSettings: {
        ...fingerprint.commonSettings,
        pageMode: 'local',
        blockImages: false,
        memorySaver: false,
      },
      advanced: {
        ...fingerprint.advanced,
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
  const id = 'id' in input ? input.id : randomUUID()
  const fingerprintConfig = normalizeFingerprintConfig({
    ...createFingerprint(),
    ...input.fingerprintConfig,
  })
  return {
    id,
    name: input.name.trim(),
    proxyId: input.proxyId,
    groupName: input.groupName.trim(),
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    notes: input.notes.trim(),
    environmentPurpose: input.environmentPurpose ?? DEFAULT_ENVIRONMENT_PURPOSE,
    deviceProfile:
      input.deviceProfile ?
        createDeviceProfileFromFingerprint(
          fingerprintConfig,
          input.deviceProfile.createdAt,
          input.deviceProfile,
        )
      : createDeviceProfileFromFingerprint(fingerprintConfig),
    fingerprintConfig,
    workspace: normalizeWorkspaceDescriptor(
      input.workspace,
      id,
      fingerprintConfig,
    ),
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
    environmentPurpose: input.environmentPurpose ?? DEFAULT_ENVIRONMENT_PURPOSE,
    tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
    notes: input.notes.trim(),
    fingerprintConfig: normalizeFingerprintConfig({
      ...createFingerprint(),
      ...input.fingerprintConfig,
    }),
    workspaceTemplate: input.workspaceTemplate ?? null,
  }
}

export function cloneName(name: string): string {
  return `${name} Copy`
}

export function cloneProfileRecordForNewId(existing: ProfileRecord, nextId: string): UpdateProfileInput {
  const fingerprintConfig = existing.fingerprintConfig
  return {
    id: nextId,
    name: cloneName(existing.name),
    proxyId: existing.proxyId,
    groupName: existing.groupName,
    tags: existing.tags,
    notes: existing.notes,
    environmentPurpose: existing.environmentPurpose ?? DEFAULT_ENVIRONMENT_PURPOSE,
    deviceProfile: {
      ...existing.deviceProfile,
      viewport: { ...existing.deviceProfile.viewport },
      locale: { ...existing.deviceProfile.locale },
      hardware: { ...existing.deviceProfile.hardware },
      mediaProfile: { ...existing.deviceProfile.mediaProfile },
      support: { ...existing.deviceProfile.support },
      updatedAt: new Date().toISOString(),
    },
    fingerprintConfig,
    workspace: normalizeWorkspaceDescriptor(existing.workspace, nextId, fingerprintConfig),
  }
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
    proxyRefMode: input.proxyRefMode,
    proxyId: input.proxyId ?? null,
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
