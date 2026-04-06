export type ProfileStatus = 'queued' | 'starting' | 'running' | 'idle' | 'stopped' | 'error'

export type ProxyType = 'http' | 'https' | 'socks5'
export type CloudPhoneProxyRefMode = 'saved' | 'custom'

export type LogLevel = 'info' | 'warn' | 'error'

export type LogCategory = 'profile' | 'proxy' | 'runtime' | 'system' | 'cloud-phone'

export type WebRtcMode = 'default' | 'disabled'

export type ProxyMode = 'direct' | 'custom' | 'manager' | 'api'
export type BrowserPageMode = 'local' | 'hidden'
export type ToggleMode = 'enabled' | 'disabled'
export type PermissionMode = 'ask' | 'allow' | 'block'
export type DeviceMode = 'desktop' | 'android' | 'ios'
export type BrowserKernel = 'chrome' | 'system-default'
export type CanvasMode = 'random' | 'off' | 'custom'
export type WebglMode = 'random' | 'off' | 'custom'
export type SimpleFingerprintMode = 'random' | 'off' | 'custom'
export type CpuMode = 'system' | 'custom'
export type ResolutionMode = 'system' | 'custom' | 'random'
export type FontMode = 'system' | 'random'
export type EnvironmentPurpose = 'register' | 'nurture' | 'operation'
export type PlatformKind = 'tiktok' | 'linkedin' | 'facebook' | ''
export type RuntimeMode = 'local' | 'strong-local' | 'vm' | 'container'
export type ProxyBindingMode = 'dedicated' | 'reusable'
export type FingerprintSupportStatus = 'active' | 'partial' | 'placeholder'
export type IpUsageKind = 'launch' | 'register-launch'
export type WorkspaceAllowedOverrideKey =
  | 'timezone'
  | 'browserLanguage'
  | 'resolution'
  | 'downloadsDirAlias'
  | 'nonCriticalLaunchArgs'
export type WorkspaceBlockedOverrideKey =
  | 'browserFamily'
  | 'profileDir'
  | 'extensionsDirRoot'
  | 'webrtcHardPolicy'
  | 'ipv6HardPolicy'
  | 'browserMajorVersionRange'
export type WorkspaceMigrationState =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'failed_retriable'
  | 'failed_manual'
export type WorkspaceMigrationCheckpointName =
  | 'legacy_profile_detected'
  | 'workspace_meta_initialized'
  | 'directory_layout_prepared'
  | 'path_mapping_persisted'
  | 'template_binding_resolved'
  | 'consistency_baseline_written'
  | 'migration_completed'

export interface WorkspaceMigrationCheckpoint {
  name: WorkspaceMigrationCheckpointName
  completedAt: string
}

export interface WorkspaceTemplateBinding {
  templateId: string
  templateRevision: string
  // Runtime consistency validation must prefer templateFingerprintHash over templateRevision.
  templateFingerprintHash: string
}

export interface WorkspacePaths {
  profileDir: string
  cacheDir: string
  downloadsDir: string
  extensionsDir: string
  metaDir: string
}

export interface WorkspaceEnvironment {
  browserFamily: BrowserKernel
  browserMajorVersionRange: string
  systemLanguage: string
  browserLanguage: string
  timezone: string
  resolution: string
  fontStrategy: FontMode
  webrtcPolicy: WebRtcMode
  ipv6Policy: ProfileProxySettings['ipProtocol']
  downloadsDir: string
  launchArgs: string[]
}

export interface WorkspaceHealthReport {
  status: 'unknown' | 'healthy' | 'warning' | 'broken'
  messages: string[]
  checkedAt: string
}

export interface WorkspaceConsistencyReport {
  status: 'unknown' | 'pass' | 'warn' | 'block'
  messages: string[]
  checkedAt: string
  templateFingerprintHash: string
  templateRevision: string
}

export interface WorkspaceSnapshotSummary {
  lastSnapshotId: string
  lastSnapshotAt: string
  lastKnownGoodSnapshotId: string
  lastKnownGoodSnapshotAt: string
  lastKnownGoodStatus: 'unknown' | 'valid' | 'invalid'
  lastKnownGoodInvalidatedAt: string
  lastKnownGoodInvalidationReason: string
}

export interface WorkspaceDescriptor {
  identityProfileId: string
  version: number
  migrationState: WorkspaceMigrationState
  migrationCheckpoints: WorkspaceMigrationCheckpoint[]
  templateBinding: WorkspaceTemplateBinding
  allowedOverrides: WorkspaceAllowedOverrideKey[]
  blockedOverrides: WorkspaceBlockedOverrideKey[]
  declaredOverrides: Partial<Record<WorkspaceAllowedOverrideKey, string | string[]>>
  // Runtime source of truth. Legacy profile fields are compatibility mirrors only.
  resolvedEnvironment: WorkspaceEnvironment
  paths: WorkspacePaths
  healthSummary: WorkspaceHealthReport
  consistencySummary: WorkspaceConsistencyReport
  trustSummary: {
    lastQuickIsolationCheckAt: string
    lastQuickIsolationCheckSuccess: boolean | null
    lastQuickIsolationCheckMessage: string
    trustedSnapshotStatus: 'unknown' | 'trusted' | 'stale' | 'invalid'
    trustedLaunchVerifiedAt: string
    activeRuntimeLock: {
      state: 'unlocked' | 'locked' | 'stale-lock'
      ownerDeviceId: string
      ownerPid: number | null
      updatedAt: string
    }
  }
  snapshotSummary: WorkspaceSnapshotSummary
  recovery: {
    lastRecoveryAt: string
    lastRecoveryReason: string
  }
}

export interface WorkspaceSnapshotStorageStateMetadata {
  version: number
  stateHash: string
  updatedAt: string
  deviceId: string
  source: string
  fileRef?: string
  checksum?: string
  size?: number
  contentType?: string
  stateJson?: BrowserStorageState | null
}

export interface BrowserStorageState {
  cookies?: Array<Record<string, unknown>>
  origins?: Array<{
    origin: string
    localStorage?: Array<{ name: string; value: string }>
  }>
}

export interface WorkspaceSnapshotDirectoryEntry {
  key: keyof WorkspacePaths
  path: string
  exists: boolean
  entryCount: number
  fileCount: number
  directoryCount: number
  totalBytes: number
  latestModifiedAt: string
}

export interface WorkspaceSnapshotRecord {
  snapshotId: string
  profileId: string
  templateRevision: string
  templateFingerprintHash: string
  manifest: Record<string, unknown>
  workspaceManifestRef?: string
  storageStateRef?: string
  workspaceMetadata: WorkspaceDescriptor
  storageState: WorkspaceSnapshotStorageStateMetadata
  directoryManifest: WorkspaceSnapshotDirectoryEntry[]
  healthSummary: WorkspaceHealthReport
  consistencySummary: WorkspaceConsistencyReport
  validatedStartAt?: string
  fileRef?: string
  checksum?: string
  size?: number
  contentType?: string
  retentionPolicy?: string
  createdAt: string
  updatedAt: string
}

export interface ResolvedWorkspaceLaunchConfig {
  // profileDir is the only persistent browser user data root.
  userDataDir: string
  cacheDir: string
  downloadsDir: string
  extensionsDir: string
  metaDir: string
  canonicalRoot: string
  locale: string
  timezoneId: string
  viewport: {
    width: number
    height: number
  }
  webrtcPolicy: WebRtcMode
  launchArgs: string[]
}

export interface WorkspaceGateResult {
  status: 'pass' | 'warn' | 'block'
  messages: string[]
  workspace: WorkspaceDescriptor
}

export interface ProfileBasicSettings {
  platform: string
  customPlatformName: string
  customPlatformUrl: string
  platformUsername: string
  platformPassword: string
  validateByUsername: boolean
  multiOpenMode: 'allow' | 'deny'
  twoFactorSecret: string
  cookieSeed: string
}

export interface ProfileProxySettings {
  proxyMode: ProxyMode
  ipLookupChannel: string
  proxyType: ProxyType
  ipProtocol: 'ipv4' | 'ipv6'
  host: string
  port: number
  username: string
  password: string
  udpEnabled: boolean
}

export interface ProfileCommonSettings {
  pageMode: BrowserPageMode
  blockImages: boolean
  blockImagesAboveKb: number
  syncTabs: boolean
  syncCookies: boolean
  clearCacheOnLaunch: boolean
  randomizeFingerprintOnLaunch: boolean
  allowChromeLogin: boolean
  hardwareAcceleration: boolean
  memorySaver: boolean
}

export interface ProfileAdvancedFingerprintSettings {
  browserKernel: BrowserKernel
  browserKernelVersion: string
  deviceMode: DeviceMode
  operatingSystem: string
  operatingSystemVersion: string
  browserVersion: string
  autoLanguageFromIp: boolean
  autoInterfaceLanguageFromIp: boolean
  interfaceLanguage: string
  autoTimezoneFromIp: boolean
  autoGeolocationFromIp: boolean
  geolocationPermission: PermissionMode
  geolocation: string
  windowWidth: number
  windowHeight: number
  resolutionMode: ResolutionMode
  fontMode: FontMode
  canvasMode: CanvasMode
  webglImageMode: WebglMode
  webglMetadataMode: WebglMode
  webglVendor: string
  webglRenderer: string
  audioContextMode: SimpleFingerprintMode
  mediaDevicesMode: SimpleFingerprintMode
  speechVoicesMode: SimpleFingerprintMode
  doNotTrackEnabled: boolean
  clientRectsMode: SimpleFingerprintMode
  deviceInfoMode: 'custom' | 'off'
  deviceName: string
  hostIp: string
  macAddress: string
  portScanProtection: boolean
  portScanAllowlist: string
  sslFingerprintMode: ToggleMode
  customPluginFingerprint: ToggleMode
  cpuMode: CpuMode
  cpuCores: number
  memoryGb: number
  launchArgs: string
}

export interface ProfileRuntimeMetadata {
  lastResolvedIp: string
  lastResolvedCountry: string
  lastResolvedRegion: string
  lastResolvedCity: string
  lastResolvedTimezone: string
  lastResolvedLanguage: string
  lastResolvedGeolocation: string
  lastResolvedAt: string
  lastProxyCheckAt: string
  lastProxyCheckSuccess: boolean | null
  lastProxyCheckMessage: string
  lastValidationLevel: 'unknown' | 'pass' | 'warn' | 'block'
  lastValidationMessages: string[]
  lastRegistrationRiskScore: number
  lastRegistrationRiskLevel: 'unknown' | 'low' | 'medium' | 'high'
  lastRegistrationRiskFactors: string[]
  lastRegisterLaunchAt: string
  lastPurposeTransitionAt: string
  lastPurposeTransitionFrom: EnvironmentPurpose | ''
  lastPurposeTransitionTo: EnvironmentPurpose | ''
  lastNurtureTransitionAt: string
  lastOperationTransitionAt: string
  lastQuickCheckAt: string
  lastQuickCheckSuccess: boolean | null
  lastQuickCheckMessage: string
  lastEffectiveProxyTransport: string
  trustedSnapshotStatus: 'unknown' | 'trusted' | 'stale' | 'invalid'
  configFingerprintHash: string
  proxyFingerprintHash: string
  launchValidationStage: 'idle' | 'full-check' | 'quick-check' | 'browser-launch'
  lastQuickIsolationCheck: TrustedIsolationCheck | null
  trustedLaunchSnapshot: TrustedLaunchSnapshot | null
  launchRetryCount: number
  injectedFeatures: string[]
  lastStorageStateVersion: number
  lastStorageStateSyncedAt: string
  lastStorageStateDeviceId: string
  lastStorageStateSyncStatus: 'idle' | 'synced' | 'pending' | 'conflict' | 'error'
  lastStorageStateSyncMessage: string
}

export interface DeviceProfileSupportMatrix {
  fonts: FingerprintSupportStatus
  mediaDevices: FingerprintSupportStatus
  speechVoices: FingerprintSupportStatus
  canvas: FingerprintSupportStatus
  webgl: FingerprintSupportStatus
  audio: FingerprintSupportStatus
  clientRects: FingerprintSupportStatus
  geolocation: FingerprintSupportStatus
  deviceInfo: FingerprintSupportStatus
  sslFingerprint: FingerprintSupportStatus
  pluginFingerprint: FingerprintSupportStatus
}

export interface DeviceProfile {
  version: number
  deviceClass: 'desktop' | 'mobile'
  operatingSystem: string
  platform: string
  browserKernel: BrowserKernel
  browserVersion: string
  userAgent: string
  viewport: {
    width: number
    height: number
  }
  locale: {
    language: string
    interfaceLanguage: string
    timezone: string
    geolocation: string
  }
  hardware: {
    cpuCores: number
    memoryGb: number
    webglVendor: string
    webglRenderer: string
  }
  mediaProfile: {
    fontMode: FontMode
    mediaDevicesMode: SimpleFingerprintMode
    speechVoicesMode: SimpleFingerprintMode
    canvasMode: CanvasMode
    webglImageMode: WebglMode
    webglMetadataMode: WebglMode
    audioContextMode: SimpleFingerprintMode
    clientRectsMode: SimpleFingerprintMode
  }
  support: DeviceProfileSupportMatrix
  createdAt: string
  updatedAt: string
}

export interface TrustedIsolationCheck {
  mode: 'preflight' | 'quick-network'
  checkedAt: string
  success: boolean
  message: string
  egressIp: string
  country: string
  region: string
  timezone: string
  language: string
  geolocation: string
  effectiveProxyTransport: string
  workspaceConsistencyStatus: WorkspaceConsistencyReport['status']
  workspaceHealthStatus: WorkspaceHealthReport['status']
  runtimeLockStatus: 'unlocked' | 'locked' | 'stale-lock'
  canonicalRoot: string
}

export interface TrustedLaunchSnapshot {
  configFingerprintHash: string
  proxyFingerprintHash: string
  snapshotVersion: number
  verificationLevel: 'full' | 'quick'
  verifiedAt: string
  effectiveProxyTransport: string
  verifiedEgressIp: string
  verifiedCountry: string
  verifiedRegion: string
  verifiedTimezone: string
  verifiedLanguage: string
  verifiedGeolocation: string
  verifiedHostEnvironment: string
  verifiedChromiumMajor: string
  verifiedDesktopAppVersion: string
  httpsCheckPassed: boolean
  leakCheckPassed: boolean
  startupNavigationPassed: boolean
  status: 'trusted' | 'stale' | 'invalid'
}

export interface FingerprintConfig {
  userAgent: string
  language: string
  timezone: string
  resolution: string
  webrtcMode: WebRtcMode
  basicSettings: ProfileBasicSettings
  proxySettings: ProfileProxySettings
  commonSettings: ProfileCommonSettings
  advanced: ProfileAdvancedFingerprintSettings
  runtimeMetadata: ProfileRuntimeMetadata
}

export interface ProfileRecord {
  id: string
  name: string
  platform?: PlatformKind
  purpose?: EnvironmentPurpose
  runtimeMode?: RuntimeMode
  proxyBindingMode?: ProxyBindingMode
  lifecycleState?: string
  riskFlags?: string[]
  cooldownSummary?: {
    active: boolean
    reason: string
    until: string
  }
  fingerprintPresetRef?: string
  workspaceManifestRef?: string
  ownerLabel?: string
  proxyId: string | null
  groupName: string
  tags: string[]
  notes: string
  environmentPurpose: EnvironmentPurpose
  deviceProfile: DeviceProfile
  fingerprintConfig: FingerprintConfig
  // Runtime behavior must resolve from workspace.resolvedEnvironment.
  // fingerprintConfig and other legacy fields remain compatibility mirrors only.
  workspace?: WorkspaceDescriptor | null
  status: ProfileStatus
  lastStartedAt: string | null
  lastLaunchAt?: string
  lastSuccessAt?: string
  lastRestoreAt?: string
  createdAt: string
  updatedAt: string
}

export interface TemplateRecord {
  id: string
  name: string
  proxyId: string | null
  groupName: string
  tags: string[]
  notes: string
  environmentPurpose: EnvironmentPurpose
  fingerprintConfig: FingerprintConfig
  workspaceTemplate?: Partial<WorkspaceEnvironment> | null
  createdAt: string
  updatedAt: string
}

export interface ProxyRecord {
  id: string
  name: string
  type: ProxyType
  host: string
  port: number
  username: string
  password: string
  status: 'unknown' | 'online' | 'offline'
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LogEntry {
  id: string
  level: LogLevel
  category: LogCategory
  message: string
  profileId: string | null
  createdAt: string
}

export interface IpUsageRecord {
  id: string
  profileId: string
  proxyId: string | null
  environmentPurpose: EnvironmentPurpose
  platform: string
  usageKind: IpUsageKind
  egressIp: string
  country: string
  region: string
  city: string
  timezone: string
  language: string
  geolocation: string
  success: boolean
  message: string
  createdAt: string
}

export interface AppSetting {
  key: string
  value: string
}

export interface DashboardSummary {
  totalProfiles: number
  runningProfiles: number
  totalProxies: number
  onlineProxies: number
  totalCloudPhones: number
  runningCloudPhones: number
  cloudPhoneErrors: number
  logCount: number
}

export interface RuntimeStatus {
  runningProfileIds: string[]
  queuedProfileIds: string[]
  startingProfileIds: string[]
  launchStages: Record<string, ProfileRuntimeMetadata['launchValidationStage']>
  retryCounts: Record<string, number>
}

export interface RuntimeHostInfo {
  kind: 'local' | 'container' | 'vm' | 'cloud-phone'
  label: string
  available: boolean
  reason: string
  activeHosts: number
  effectiveRuntimeMode?: RuntimeMode
  supportedRuntimeModes?: RuntimeMode[]
  degraded?: boolean
  degradeReason?: string
  lockState?: 'unlocked' | 'locked' | 'stale-lock'
}

export interface ProxyTestResult {
  success: boolean
  message: string
  checkedAt: string
}

export type CloudPhoneStatus =
  | 'draft'
  | 'provisioned'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error'

export type CloudPhoneComputeType = 'basic' | 'standard' | 'pro'

export type CloudPhoneProxyType = 'http' | 'https' | 'socks5'

export type CloudPhoneIpProtocol = 'ipv4' | 'ipv6'

export type CloudPhoneProviderKind =
  | 'self-hosted'
  | 'third-party'
  | 'local-emulator'
  | 'mock'

export type CloudPhoneProviderCapability =
  | 'proxyTest'
  | 'startStop'
  | 'remoteUrl'
  | 'adbBridge'

export interface CloudPhoneFingerprintSettings {
  autoLanguage: boolean
  language: string | null
  autoTimezone: boolean
  timezone: string | null
  autoGeolocation: boolean
  geolocation: string | null
}

export interface CloudPhoneRecord {
  id: string
  name: string
  groupName: string
  tags: string[]
  notes: string
  platform: 'android'
  providerKey: string
  providerKind: CloudPhoneProviderKind
  providerConfig: CloudPhoneProviderConfig
  providerInstanceId: string | null
  computeType: CloudPhoneComputeType
  status: CloudPhoneStatus
  lastSyncedAt: string | null
  ipLookupChannel: string
  proxyRefMode: CloudPhoneProxyRefMode
  proxyId: string | null
  proxyType: CloudPhoneProxyType
  ipProtocol: CloudPhoneIpProtocol
  proxyHost: string
  proxyPort: number
  proxyUsername: string
  proxyPassword: string
  udpEnabled: boolean
  fingerprintSettings: CloudPhoneFingerprintSettings
  createdAt: string
  updatedAt: string
}

export interface CloudPhoneProxyTestResult {
  success: boolean
  message: string
  checkedAt: string
}

export interface CloudPhoneDetails {
  providerKey: string
  providerKind: CloudPhoneProviderKind
  providerInstanceId: string | null
  platform: 'android'
  status: CloudPhoneStatus
  computeType: CloudPhoneComputeType
  endpointUrl: string | null
  message: string
  lastSyncedAt: string | null
  providerLabel?: string
  connectionLabel?: string
}

export interface CloudPhoneProviderConfig {
  baseUrl?: string
  apiKey?: string
  clusterId?: string
  poolId?: string
  vendorKey?: string
  token?: string
  projectId?: string
  adbSerial?: string
  emulatorName?: string
  adbPath?: string
}

export interface CloudPhoneProviderSummary {
  key: string
  label: string
  kind: CloudPhoneProviderKind
  capabilities: CloudPhoneProviderCapability[]
}

export interface CloudPhoneProviderHealth {
  key: string
  label: string
  kind: CloudPhoneProviderKind
  available: boolean
  message: string
  checkedAt: string
}

export interface DetectedLocalEmulator {
  serial: string
  name: string
  state: string
  source: 'adb'
}

export interface CreateProfileInput {
  name: string
  platform?: PlatformKind
  purpose?: EnvironmentPurpose
  runtimeMode?: RuntimeMode
  proxyBindingMode?: ProxyBindingMode
  lifecycleState?: string
  riskFlags?: string[]
  cooldownSummary?: {
    active: boolean
    reason: string
    until: string
  }
  fingerprintPresetRef?: string
  workspaceManifestRef?: string
  ownerLabel?: string
  proxyId: string | null
  groupName: string
  tags: string[]
  notes: string
  environmentPurpose?: EnvironmentPurpose
  deviceProfile?: DeviceProfile
  fingerprintConfig: FingerprintConfig
  workspace?: WorkspaceDescriptor | null
}

export interface UpdateProfileInput extends CreateProfileInput {
  id: string
}

export interface CreateTemplateInput {
  name: string
  proxyId: string | null
  groupName: string
  tags: string[]
  notes: string
  environmentPurpose?: EnvironmentPurpose
  fingerprintConfig: FingerprintConfig
  workspaceTemplate?: Partial<WorkspaceEnvironment> | null
}

export interface UpdateTemplateInput extends CreateTemplateInput {
  id: string
}

export interface CreateProxyInput {
  name: string
  type: ProxyType
  host: string
  port: number
  username: string
  password: string
}

export interface UpdateProxyInput extends CreateProxyInput {
  id: string
}

export interface CreateCloudPhoneInput {
  name: string
  groupName: string
  tags: string[]
  notes: string
  platform: 'android'
  providerKey: string
  providerKind: CloudPhoneProviderKind
  providerConfig: CloudPhoneProviderConfig
  providerInstanceId?: string | null
  computeType: CloudPhoneComputeType
  ipLookupChannel: string
  proxyRefMode: CloudPhoneProxyRefMode
  proxyId: string | null
  proxyType: CloudPhoneProxyType
  ipProtocol: CloudPhoneIpProtocol
  proxyHost: string
  proxyPort: number
  proxyUsername: string
  proxyPassword: string
  udpEnabled: boolean
  fingerprintSettings: CloudPhoneFingerprintSettings
}

export interface UpdateCloudPhoneInput extends CreateCloudPhoneInput {
  id: string
}

export interface ProfileBulkActionPayload {
  profileIds: string[]
  groupName?: string
}

export interface CloudPhoneBulkActionPayload {
  cloudPhoneIds: string[]
  groupName?: string
}

export interface SettingsPayload {
  [key: string]: string
}

export interface AuthUser {
  id: string
  email: string
  username: string
  name: string
  avatarUrl?: string
  bio?: string
  role: string
  status: string
  devices?: Array<{
    deviceId: string
    deviceName: string
    platform: string
    source: string
    isCurrent?: boolean
    revokedAt?: string | null
    lastSeenAt: string | null
    lastLoginAt: string | null
  }>
  subscription?: {
    plan: string
    status: string
    expiresAt: string | null
  }
  createdAt?: string
  updatedAt?: string
}

export interface DesktopAuthState {
  apiBase: string
  authenticated: boolean
  currentDeviceId: string
  user: AuthUser | null
}

export interface ProfileDirectoryInfo {
  appDataDir: string
  profilesDir: string
  workspacesDir: string
  chromiumExecutable?: string
}

export interface ExportBundle {
  version: number
  exportedAt: string
  profiles: ProfileRecord[]
  proxies: ProxyRecord[]
  templates: TemplateRecord[]
  cloudPhones: CloudPhoneRecord[]
  settings?: SettingsPayload
  workspaceSnapshots?: WorkspaceSnapshotRecord[]
  workspaceManifest?: {
    schemaVersion: number
    pathRewriteStrategy: 'workspace-resolver-v1'
    entries: Array<{
      profileId: string
      identityProfileId: string
      templateFingerprintHash: string
      snapshotCount: number
      exportedPaths: WorkspacePaths
      lastSnapshotId: string
      lastKnownGoodSnapshotId: string
    }>
  }
}

export interface RemoteConfigSnapshot {
  syncVersion: number
  profiles: ProfileRecord[]
  proxies: ProxyRecord[]
  templates: TemplateRecord[]
  cloudPhones: CloudPhoneRecord[]
  settings: SettingsPayload
}

export interface ImportResult {
  profilesImported: number
  proxiesImported: number
  templatesImported: number
  cloudPhonesImported: number
  workspaceSnapshotsImported?: number
  warnings: string[]
  profileIdMap?: Record<string, string>
}

export interface DesktopRuntimeInfo {
  mode: 'development' | 'production'
  appVersion: string
  mainVersion: string
  preloadVersion: string
  rendererVersion: string
  capabilities: string[]
}

export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

export interface DesktopUpdateState {
  supported: boolean
  status: DesktopUpdateStatus
  currentVersion: string
  latestVersion: string | null
  releaseName: string
  publishedAt: string | null
  releaseUrl: string
  assetName: string
  downloadedFile: string
  progressPercent: number
  message: string
  checkedAt: string | null
}
