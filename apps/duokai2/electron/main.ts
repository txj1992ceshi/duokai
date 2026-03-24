import { appendFileSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} from 'electron'
import { chromium } from 'playwright'
import type { BrowserContext } from 'playwright'
import { DatabaseService } from './services/database'
import {
  createCloudPhonePayload,
  createDefaultFingerprint,
  createProfilePayload,
  createProxyPayload,
  createTemplatePayload,
} from './services/factories'
import {
  CloudPhoneProviderRegistry,
  LocalEmulatorCloudPhoneProvider,
  MockCloudPhoneProvider,
  SelfHostedCloudPhoneProvider,
  ThirdPartyCloudPhoneProvider,
} from './services/cloudPhones'
import {
  ensureProfileDirectory,
  getProfileDirectoryInfo,
  getProfilePath,
} from './services/paths'
import {
  buildProxyServer,
  buildRuntimeArgs,
  normalizeResolution,
  parseLocale,
  proxyToPlaywrightConfig,
  resolveChromiumExecutable,
} from './services/runtime'
import { buildFingerprintInitScript } from './services/fingerprint'
import { applyNetworkDerivedFingerprint } from './services/networkProfileResolver'
import { RuntimeScheduler } from './services/runtimeScheduler'
import { AgentService } from './services/agentService'
import { validateProfileForLaunch } from './services/profileValidator'
import { ContainerManager } from './services/containerManager'
import {
  isRuntimeHostSupported,
  resolveRequestedRuntimeKind,
} from './services/runtimeIsolation'
import { checkNetworkHealth, type NetworkHealthResult } from './services/networkCheck'
import { buildNetworkDiagnosticsSummary } from './services/networkDiagnostics'
import type {
  AuthUser,
  CloudPhoneBulkActionPayload,
  CloudPhoneRecord,
  CreateCloudPhoneInput,
  CreateProfileInput,
  CreateProxyInput,
  CreateTemplateInput,
  DesktopRuntimeInfo,
  DesktopAuthState,
  ExportBundle,
  FingerprintConfig,
  LogLevel,
  ProfileBulkActionPayload,
  ProfileRecord,
  ProxyRecord,
  RemoteConfigSnapshot,
  SettingsPayload,
  TrustedIsolationCheck,
  TrustedLaunchSnapshot,
  UpdateCloudPhoneInput,
  UpdateTemplateInput,
  UpdateProfileInput,
  UpdateProxyInput,
} from '../src/shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_TIMEZONE_FALLBACK = 'America/Los_Angeles'
const DEFAULT_CONCURRENT_STARTS = 2
const DEFAULT_ACTIVE_LIMIT = 6
const DEFAULT_LAUNCH_RETRIES = 2
const DEFAULT_CONTROL_PLANE_API_BASE = (
  String(process.env.DUOKAI_API_BASE || '').trim() || 'http://duokai.duckdns.org'
).replace(/\/$/, '')
const TRUSTED_SNAPSHOT_VERSION = 1
const PROFILE_STORAGE_SYNC_INTERVAL_MS = 5 * 60 * 1000
const CONTROL_PLANE_API_BASE_KEY = 'controlPlaneApiBase'
const CONTROL_PLANE_DEVICE_ID_KEY = 'controlPlaneDeviceId'
const CONTROL_PLANE_AUTH_TOKEN_KEY = 'controlPlaneAuthToken'
const CONTROL_PLANE_AUTH_USER_KEY = 'controlPlaneAuthUser'

let mainWindow: BrowserWindow | null = null
let db: DatabaseService | null = null
let agentService: AgentService | null = null

const runtimeContexts = new Map<string, BrowserContext>()
const runtimeStorageSyncTimers = new Map<string, NodeJS.Timeout>()
const MAX_QUEUE = Number(process.env.MAX_QUEUE_LENGTH || 200)

type ControlPlaneStorageState = {
  id: string
  userId: string
  profileId: string
  stateJson: unknown
  version: number
  encrypted: boolean
  deviceId: string
  updatedBy: string
  source: string
  stateHash: string
  createdAt: string
  updatedAt: string
}

type BrowserStorageState = {
  cookies?: Array<Record<string, unknown>>
  origins?: Array<{
    origin: string
    localStorage?: Array<{ name: string; value: string }>
  }>
}

function resolveAuditLogPath(): string {
  try {
    return path.join(app.getPath('userData'), process.env.RUNTIME_AUDIT_FILE || 'runtime-audit.log')
  } catch {
    return path.join(process.cwd(), process.env.RUNTIME_AUDIT_FILE || 'runtime-audit.log')
  }
}

function getAgentRuntimeState() {
  const launchStages = Object.fromEntries(
    requireDatabase()
      .listProfiles()
      .map((profile) => [profile.id, profile.fingerprintConfig.runtimeMetadata.launchValidationStage]),
  )
  return {
    runningProfileIds: [...runtimeContexts.keys()],
    queuedProfileIds: scheduler.getQueuedIds(),
    startingProfileIds: scheduler.getStartingIds(),
    launchStages,
    retryCounts: scheduler.getRetryCounts(),
  }
}

function getAgentStateSnapshot() {
  return (
    agentService?.getState() || {
      enabled: false,
      writable: true,
      connected: false,
      agentId: '',
      protocolVersion: '1' as const,
      lastHeartbeatAt: null,
      lastError: '',
      consecutiveFailures: 0,
      lastTaskId: null,
      lastTaskStatus: null,
      lastTaskFinishedAt: null,
    }
  )
}

function ensureWritable(action: string): void {
  const state = getAgentStateSnapshot()
  if (state.enabled && !state.writable) {
    throw new Error(`Agent offline, write blocked: ${action}`)
  }
}

async function syncConfigFromControlPlane(): Promise<void> {
  if (!agentService || !agentService.getState().enabled) {
    return
  }
  const snapshot = await agentService.pullConfigSnapshot()
  if (!snapshot) {
    return
  }
  requireDatabase().applyRemoteConfigSnapshot(snapshot as RemoteConfigSnapshot)
}

async function syncConfigToControlPlaneOrThrow(mode: 'replace' | 'merge' = 'replace'): Promise<void> {
  if (!agentService || !agentService.getState().enabled) {
    return
  }
  const snapshot = requireDatabase().exportRemoteConfigSnapshot(agentService.getSyncVersion())
  try {
    await agentService.pushConfigSnapshot({
      profiles: snapshot.profiles,
      proxies: snapshot.proxies,
      templates: snapshot.templates,
      cloudPhones: snapshot.cloudPhones,
      settings: snapshot.settings,
    }, { mode })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/sync version mismatch/i.test(message)) {
      await syncConfigFromControlPlane()
      throw new Error('配置版本冲突，已拉取后台最新数据，请重试操作')
    }
    throw error
  }
}

const AUDIT_LOG_PATH = resolveAuditLogPath()
let gracefulShutdownInFlight = false
let beforeQuitHandled = false

function audit(action: string, payload: Record<string, unknown> = {}) {
  try {
    const rec = { ts: new Date().toISOString(), pid: process.pid, action, ...payload }
    appendFileSync(AUDIT_LOG_PATH, `${JSON.stringify(rec)}\n`)
  } catch (error) {
    console.error('audit write failed', error)
  }
}

function getProfileStorageStatePath(profileId: string): string {
  return path.join(getProfilePath(app, profileId), 'storageState.json')
}

function normalizeStorageState(stateJson: unknown): BrowserStorageState | null {
  if (!stateJson || typeof stateJson !== 'object') {
    return null
  }
  return stateJson as BrowserStorageState
}

function hashStorageState(stateJson: unknown): string {
  return createHash('sha256').update(JSON.stringify(stateJson)).digest('hex')
}

async function readProfileStorageStateFromDisk(profileId: string): Promise<BrowserStorageState | null> {
  try {
    const content = await readFile(getProfileStorageStatePath(profileId), 'utf8')
    return normalizeStorageState(JSON.parse(content))
  } catch {
    return null
  }
}

async function writeProfileStorageStateToDisk(profileId: string, stateJson: unknown): Promise<void> {
  const profilePath = getProfilePath(app, profileId)
  mkdirSync(profilePath, { recursive: true })
  await writeFile(getProfileStorageStatePath(profileId), JSON.stringify(stateJson, null, 2), 'utf8')
}

async function saveProfileStorageStateToDisk(
  profileId: string,
  context: BrowserContext,
): Promise<BrowserStorageState> {
  const stateJson = (await context.storageState()) as BrowserStorageState
  await writeProfileStorageStateToDisk(profileId, stateJson)
  return stateJson
}

async function saveProfileStorageStateToDiskSafely(
  profileId: string,
  context: BrowserContext,
): Promise<void> {
  try {
    await saveProfileStorageStateToDisk(profileId, context)
  } catch (error) {
    audit('storage_state_save_failed', {
      profileId,
      err: String(error),
    })
  }
}

async function fetchRemoteProfileStorageState(profileId: string): Promise<ControlPlaneStorageState | null> {
  if (!getDesktopAuthState().authenticated) {
    return null
  }
  const payload = await requestControlPlane(`/api/profile-storage-state/${encodeURIComponent(profileId)}`)
  return (payload.storageState || null) as ControlPlaneStorageState | null
}

async function saveAllElectronSessions(): Promise<void> {
  audit('save_all_begin', { count: runtimeContexts.size })
  for (const [profileId, context] of runtimeContexts.entries()) {
    try {
      const storagePath = getProfileStorageStatePath(profileId)
      await saveProfileStorageStateToDisk(profileId, context)
      await uploadProfileStorageStateToControlPlane(profileId, {
        context,
        reason: 'graceful-shutdown',
      })
      audit('save_ok', { profileId, storagePath })
    } catch (error) {
      audit('save_err', { profileId, err: String(error) })
      console.error('Failed saving storageState for', profileId, error)
    }
  }
  audit('save_all_end', { count: runtimeContexts.size })
}

async function gracefulShutdownHandler(signalOrErr?: unknown) {
  if (gracefulShutdownInFlight) {
    return
  }
  gracefulShutdownInFlight = true
  try {
    audit('process_shutdown_begin', { info: String(signalOrErr || '') })
    console.log('Graceful shutdown: saving sessions...')
    await saveAllElectronSessions()
  } catch (error) {
    console.error('graceful shutdown save failed', error)
  } finally {
    audit('process_shutdown_end', { info: String(signalOrErr || '') })
    setTimeout(() => process.exit(signalOrErr ? 1 : 0), 300)
  }
}

process.on('SIGINT', () => {
  console.log('SIGINT')
  void gracefulShutdownHandler('SIGINT')
})
process.on('SIGTERM', () => {
  console.log('SIGTERM')
  void gracefulShutdownHandler('SIGTERM')
})
process.on('uncaughtException', (error) => {
  console.error('uncaughtException', error)
  void gracefulShutdownHandler(error)
})

console.log('Runtime audit log:', AUDIT_LOG_PATH)

const cloudPhoneProviderRegistry = new CloudPhoneProviderRegistry()
cloudPhoneProviderRegistry.register(new SelfHostedCloudPhoneProvider())
cloudPhoneProviderRegistry.register(new ThirdPartyCloudPhoneProvider())
cloudPhoneProviderRegistry.register(new LocalEmulatorCloudPhoneProvider())
cloudPhoneProviderRegistry.register(new MockCloudPhoneProvider())
const runtimeHostManager = new ContainerManager()

const isDev = !app.isPackaged
const rendererUrl = process.env.VITE_DEV_SERVER_URL
const rendererFile = path.join(__dirname, '../dist/index.html')
const PRELOAD_VERSION = 'bridge-2026-03-15'
const CAPABILITIES: DesktopRuntimeInfo['capabilities'] = [
  'dashboard.summary',
  'cloudPhones.list',
  'cloudPhones.listProviders',
  'cloudPhones.getProviderHealth',
  'cloudPhones.detectLocalDevices',
  'cloudPhones.create',
  'cloudPhones.update',
  'cloudPhones.delete',
  'cloudPhones.start',
  'cloudPhones.stop',
  'cloudPhones.getStatus',
  'cloudPhones.getDetails',
  'cloudPhones.testProxy',
  'cloudPhones.refreshStatuses',
  'cloudPhones.bulkStart',
  'cloudPhones.bulkStop',
  'cloudPhones.bulkDelete',
  'cloudPhones.bulkAssignGroup',
  'profiles.list',
  'profiles.create',
  'profiles.update',
  'profiles.delete',
  'profiles.clone',
  'profiles.revealDirectory',
  'profiles.getDirectoryInfo',
  'profiles.bulkStart',
  'profiles.bulkStop',
  'profiles.bulkDelete',
  'profiles.bulkAssignGroup',
  'templates.list',
  'templates.create',
  'templates.update',
  'templates.delete',
  'templates.createFromProfile',
  'proxies.list',
  'proxies.create',
  'proxies.update',
  'proxies.delete',
  'proxies.test',
  'runtime.launch',
  'runtime.stop',
  'runtime.getStatus',
  'logs.list',
  'logs.clear',
  'settings.get',
  'settings.set',
  'data.previewBundle',
  'data.exportBundle',
  'data.importBundle',
]

function requireDatabase(): DatabaseService {
  if (!db) {
    throw new Error('Database is not initialized')
  }
  return db
}

function getSettingValue(key: string, fallback = ''): string {
  return requireDatabase().getSettings()[key] || fallback
}

function getControlPlaneApiBase(): string {
  return (
    getSettingValue(CONTROL_PLANE_API_BASE_KEY) ||
    DEFAULT_CONTROL_PLANE_API_BASE
  ).replace(/\/$/, '')
}

function getStoredAuthToken(): string {
  return getSettingValue(CONTROL_PLANE_AUTH_TOKEN_KEY).trim()
}

function getControlPlaneDeviceId(): string {
  const value = getSettingValue(CONTROL_PLANE_DEVICE_ID_KEY).trim()
  if (value) {
    return value
  }
  const generated = randomUUID()
  requireDatabase().setSettings({
    ...getSettings(),
    [CONTROL_PLANE_DEVICE_ID_KEY]: generated,
  })
  return generated
}

function getStoredAuthUser(): AuthUser | null {
  const raw = getSettingValue(CONTROL_PLANE_AUTH_USER_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

function getDesktopAuthState(): DesktopAuthState {
  const user = getStoredAuthUser()
  const currentDeviceId = getControlPlaneDeviceId()
  return {
    apiBase: getControlPlaneApiBase(),
    authenticated: Boolean(getStoredAuthToken() && user),
    currentDeviceId,
    user: user
      ? {
          ...user,
          devices: Array.isArray(user.devices)
            ? user.devices.map((device) => ({
                ...device,
                isCurrent: device.deviceId === currentDeviceId,
              }))
            : [],
        }
      : null,
  }
}

function saveDesktopAuth(apiBase: string, token: string, user: AuthUser): DesktopAuthState {
  requireDatabase().setSettings({
    ...getSettings(),
    [CONTROL_PLANE_API_BASE_KEY]: apiBase.replace(/\/$/, ''),
    [CONTROL_PLANE_AUTH_TOKEN_KEY]: token,
    [CONTROL_PLANE_AUTH_USER_KEY]: JSON.stringify(user),
  })
  return getDesktopAuthState()
}

function clearDesktopAuth(): DesktopAuthState {
  requireDatabase().setSettings({
    ...getSettings(),
    [CONTROL_PLANE_AUTH_TOKEN_KEY]: '',
    [CONTROL_PLANE_AUTH_USER_KEY]: '',
  })
  return getDesktopAuthState()
}

async function requestControlPlane(
  pathName: string,
  init: RequestInit = {},
  includeAuth = true,
): Promise<Record<string, unknown>> {
  const headers = new Headers(init.headers || {})
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (includeAuth) {
    const token = getStoredAuthToken()
    if (!token) {
      throw new Error('请先登录桌面端')
    }
    headers.set('Authorization', `Bearer ${token}`)
  }
  const response = await fetch(`${getControlPlaneApiBase()}${pathName}`, {
    ...init,
    headers,
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok || payload.success === false) {
    const message = String(payload.error || `${response.status} ${response.statusText}` || 'Control plane request failed')
    if (response.status === 401) {
      clearDesktopAuth()
    }
    throw new Error(message)
  }
  return payload
}

function getSettings(): SettingsPayload {
  return requireDatabase().getSettings()
}

type ControlPlaneProfile = {
  id: string
  name: string
  status?: string
  tags?: string[]
  proxyType?: string
  proxyHost?: string
  proxyPort?: string
  proxyUsername?: string
  proxyPassword?: string
  ua?: string
  seed?: string
  isMobile?: boolean
  groupId?: string
  startupPlatform?: string
  startupUrl?: string
  lastResolvedProxyTransport?: string
  configFingerprintHash?: string
  proxyFingerprintHash?: string
  lastQuickIsolationCheck?: TrustedIsolationCheck | null
  trustedLaunchSnapshot?: TrustedLaunchSnapshot | null
}

type ProxyEntryTransport = 'https-entry' | 'http-entry' | 'socks5-entry' | 'direct'

function findMatchingSavedProxyForRemoteProfile(
  remoteProfile: Pick<
    ControlPlaneProfile,
    'proxyType' | 'proxyHost' | 'proxyPort' | 'proxyUsername' | 'proxyPassword'
  >,
  existing?: ProfileRecord | null,
): ProxyRecord | null {
  if (!remoteProfile.proxyHost || !remoteProfile.proxyPort) {
    return null
  }

  const normalizedPort = Number(remoteProfile.proxyPort || 0)
  const savedProxies = requireDatabase()
    .listProxies()
    .filter(
      (proxy) =>
        proxy.host === remoteProfile.proxyHost &&
        proxy.port === normalizedPort &&
        proxy.username === (remoteProfile.proxyUsername || '') &&
        proxy.password === (remoteProfile.proxyPassword || ''),
    )

  if (savedProxies.length === 0) {
    return null
  }

  if (existing?.proxyId) {
    const preferred = savedProxies.find((proxy) => proxy.id === existing.proxyId)
    if (preferred) {
      return preferred
    }
  }

  const exactType = savedProxies.find((proxy) => proxy.type === remoteProfile.proxyType)
  if (exactType) {
    return exactType
  }

  return savedProxies.length === 1 ? savedProxies[0] : null
}

function mapControlPlaneStatus(status: string | undefined): ProfileRecord['status'] {
  if (status === 'Running') {
    return 'running'
  }
  if (status === 'Error') {
    return 'error'
  }
  return 'stopped'
}

function getBuiltInStartupUrl(platform: string): string {
  const normalized = platform.trim().toLowerCase()
  if (normalized === 'amazon') return 'https://www.amazon.com/'
  if (normalized === 'tiktok') return 'https://www.tiktok.com/'
  if (normalized === 'google') return 'https://www.google.com/'
  if (normalized === 'facebook') return 'https://www.facebook.com/'
  if (normalized === 'linkedin') return 'https://www.linkedin.com/'
  if (normalized === 'instagram') return 'https://www.instagram.com/'
  if (normalized === 'x') return 'https://x.com/'
  if (normalized === 'youtube') return 'https://www.youtube.com/'
  return ''
}

function resolveProfileStartupUrl(profile: Pick<ProfileRecord, 'fingerprintConfig'>): string {
  const basicSettings = profile.fingerprintConfig.basicSettings
  if (basicSettings.platform === 'custom') {
    return basicSettings.customPlatformUrl.trim()
  }
  return (
    basicSettings.customPlatformUrl.trim() ||
    getBuiltInStartupUrl(basicSettings.platform) ||
    ''
  )
}

function mapLocalStatusToControlPlaneStatus(
  status: ProfileRecord['status'] | 'queued' | 'starting' | 'idle',
): 'Ready' | 'Running' | 'Error' {
  if (status === 'error') {
    return 'Error'
  }
  if (status === 'running' || status === 'queued' || status === 'starting') {
    return 'Running'
  }
  return 'Ready'
}

function hashStructuredPayload(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function detectDesktopHostEnvironment(): string {
  if (process.platform === 'darwin') {
    return 'macOS'
  }
  if (process.platform === 'linux') {
    return 'Linux'
  }
  return 'Windows'
}

function resolveChromiumMajorForProfile(profile: ProfileRecord): string {
  const browserVersion = String(profile.fingerprintConfig.advanced.browserVersion || '').trim()
  if (browserVersion) {
    return browserVersion.split('.')[0] || browserVersion
  }
  const matched = profile.fingerprintConfig.userAgent.match(/Chrome\/(\d+)/i)
  return matched?.[1] || ''
}

function buildConfigFingerprintHash(profile: ProfileRecord): string {
  return hashStructuredPayload({
    userAgent: profile.fingerprintConfig.userAgent,
    operatingSystem: profile.fingerprintConfig.advanced.operatingSystem,
    browserVersion: profile.fingerprintConfig.advanced.browserVersion,
    language: profile.fingerprintConfig.language,
    timezone: profile.fingerprintConfig.timezone,
    geolocation: profile.fingerprintConfig.advanced.geolocation,
    webrtcMode: profile.fingerprintConfig.webrtcMode,
    deviceMode: profile.fingerprintConfig.advanced.deviceMode,
    startupPlatform: profile.fingerprintConfig.basicSettings.platform,
    startupUrl: resolveProfileStartupUrl(profile),
  })
}

function buildProxyFingerprintHash(profile: ProfileRecord, proxy: ProxyRecord | null): string {
  return hashStructuredPayload({
    proxyMode: profile.fingerprintConfig.proxySettings.proxyMode,
    proxyType: proxy?.type || 'direct',
    host: proxy?.host || '',
    port: proxy?.port || 0,
    username: proxy?.username || '',
    expectedIp: profile.fingerprintConfig.runtimeMetadata.lastResolvedIp,
    expectedCountry: profile.fingerprintConfig.runtimeMetadata.lastResolvedCountry,
    expectedRegion: profile.fingerprintConfig.runtimeMetadata.lastResolvedRegion,
    preferredTransport: profile.fingerprintConfig.runtimeMetadata.lastEffectiveProxyTransport,
  })
}

function buildTrustedLaunchSnapshot(
  profile: ProfileRecord,
  check: NetworkHealthResult,
  configFingerprintHash: string,
  proxyFingerprintHash: string,
  effectiveProxyTransport: string,
): TrustedLaunchSnapshot {
  return {
    configFingerprintHash,
    proxyFingerprintHash,
    snapshotVersion: TRUSTED_SNAPSHOT_VERSION,
    verificationLevel: 'full',
    verifiedAt: new Date().toISOString(),
    effectiveProxyTransport,
    verifiedEgressIp: check.ip,
    verifiedCountry: check.country,
    verifiedRegion: check.region,
    verifiedTimezone: check.timezone,
    verifiedLanguage: check.languageHint,
    verifiedGeolocation: check.geolocation,
    verifiedHostEnvironment: detectDesktopHostEnvironment(),
    verifiedChromiumMajor: resolveChromiumMajorForProfile(profile),
    verifiedDesktopAppVersion: app.getVersion(),
    httpsCheckPassed: check.ok,
    leakCheckPassed: check.ok,
    startupNavigationPassed: true,
    status: 'trusted',
  }
}

function buildQuickIsolationCheck(
  check: NetworkHealthResult,
  effectiveProxyTransport: string,
  success: boolean,
  message: string,
): TrustedIsolationCheck {
  return {
    checkedAt: new Date().toISOString(),
    success,
    message,
    egressIp: check.ip,
    country: check.country,
    region: check.region,
    timezone: check.timezone,
    language: check.languageHint,
    geolocation: check.geolocation,
    effectiveProxyTransport,
  }
}

function compareSnapshotWithCheck(
  snapshot: TrustedLaunchSnapshot,
  check: NetworkHealthResult,
  effectiveProxyTransport: string,
): { ok: boolean; message: string } {
  if (!check.ok) {
    return { ok: false, message: check.message || '快速隔离校验失败' }
  }
  if (snapshot.effectiveProxyTransport && snapshot.effectiveProxyTransport !== effectiveProxyTransport) {
    return { ok: false, message: '当前代理入口与可信快照不一致' }
  }
  if (snapshot.verifiedEgressIp && snapshot.verifiedEgressIp !== check.ip) {
    return { ok: false, message: '当前出口 IP 与可信快照不一致' }
  }
  if (snapshot.verifiedCountry && snapshot.verifiedCountry !== check.country) {
    return { ok: false, message: '当前出口国家与可信快照不一致' }
  }
  if (snapshot.verifiedRegion && snapshot.verifiedRegion !== check.region) {
    return { ok: false, message: '当前出口地区与可信快照不一致' }
  }
  if (snapshot.verifiedTimezone && check.timezone && snapshot.verifiedTimezone !== check.timezone) {
    return { ok: false, message: '当前时区与可信快照不一致' }
  }
  if (snapshot.verifiedLanguage && check.languageHint && snapshot.verifiedLanguage !== check.languageHint) {
    return { ok: false, message: '当前语言与可信快照不一致' }
  }
  if (snapshot.verifiedGeolocation && check.geolocation && snapshot.verifiedGeolocation !== check.geolocation) {
    return { ok: false, message: '当前地理位置与可信快照不一致' }
  }
  return { ok: true, message: '快速隔离校验通过' }
}

function shouldUseTrustedSnapshot(
  profile: ProfileRecord,
  snapshot: TrustedLaunchSnapshot | null,
  configFingerprintHash: string,
  proxyFingerprintHash: string,
): boolean {
  if (!snapshot || snapshot.status !== 'trusted') {
    return false
  }
  if (snapshot.snapshotVersion !== TRUSTED_SNAPSHOT_VERSION) {
    return false
  }
  if (snapshot.configFingerprintHash !== configFingerprintHash) {
    return false
  }
  if (snapshot.proxyFingerprintHash !== proxyFingerprintHash) {
    return false
  }
  if (snapshot.verifiedDesktopAppVersion !== app.getVersion()) {
    return false
  }
  if (snapshot.verifiedChromiumMajor !== resolveChromiumMajorForProfile(profile)) {
    return false
  }
  if (snapshot.verifiedHostEnvironment !== detectDesktopHostEnvironment()) {
    return false
  }
  return true
}

function buildFingerprintFromRemoteProfile(
  remoteProfile: ControlPlaneProfile,
  existing?: ProfileRecord | null,
): FingerprintConfig {
  const fingerprint = existing
    ? createDefaultFingerprint()
    : createDefaultFingerprint()
  const next = existing?.fingerprintConfig
    ? {
        ...existing.fingerprintConfig,
        basicSettings: { ...existing.fingerprintConfig.basicSettings },
        proxySettings: { ...existing.fingerprintConfig.proxySettings },
        commonSettings: { ...existing.fingerprintConfig.commonSettings },
        advanced: { ...existing.fingerprintConfig.advanced },
        runtimeMetadata: { ...existing.fingerprintConfig.runtimeMetadata },
      }
    : fingerprint

  next.userAgent = remoteProfile.ua || next.userAgent
  next.basicSettings.platform = remoteProfile.startupPlatform || next.basicSettings.platform
  next.basicSettings.customPlatformUrl = remoteProfile.startupUrl || next.basicSettings.customPlatformUrl
  const matchedSavedProxy = findMatchingSavedProxyForRemoteProfile(remoteProfile, existing)
  if (remoteProfile.proxyType === 'direct' || !remoteProfile.proxyHost) {
    next.proxySettings.proxyMode = 'direct'
    next.proxySettings.host = ''
    next.proxySettings.port = 0
    next.proxySettings.username = ''
    next.proxySettings.password = ''
  } else if (matchedSavedProxy) {
    next.proxySettings.proxyMode = 'manager'
    next.proxySettings.proxyType = matchedSavedProxy.type
    next.proxySettings.host = matchedSavedProxy.host
    next.proxySettings.port = matchedSavedProxy.port
    next.proxySettings.username = matchedSavedProxy.username
    next.proxySettings.password = matchedSavedProxy.password
  } else {
    next.proxySettings.proxyMode = 'custom'
    next.proxySettings.proxyType =
      remoteProfile.proxyType === 'http' ||
      remoteProfile.proxyType === 'https' ||
      remoteProfile.proxyType === 'socks5'
        ? remoteProfile.proxyType
        : next.proxySettings.proxyType
    next.proxySettings.host = remoteProfile.proxyHost || ''
    next.proxySettings.port = Number(remoteProfile.proxyPort || 0)
    next.proxySettings.username = remoteProfile.proxyUsername || ''
    next.proxySettings.password = remoteProfile.proxyPassword || ''
  }
  next.advanced.deviceMode = remoteProfile.isMobile ? 'android' : 'desktop'
  next.runtimeMetadata.lastEffectiveProxyTransport =
    remoteProfile.lastResolvedProxyTransport ||
    remoteProfile.trustedLaunchSnapshot?.effectiveProxyTransport ||
    next.runtimeMetadata.lastEffectiveProxyTransport
  next.runtimeMetadata.trustedSnapshotStatus =
    remoteProfile.trustedLaunchSnapshot?.status || next.runtimeMetadata.trustedSnapshotStatus
  next.runtimeMetadata.configFingerprintHash =
    remoteProfile.configFingerprintHash ||
    remoteProfile.trustedLaunchSnapshot?.configFingerprintHash ||
    next.runtimeMetadata.configFingerprintHash
  next.runtimeMetadata.proxyFingerprintHash =
    remoteProfile.proxyFingerprintHash ||
    remoteProfile.trustedLaunchSnapshot?.proxyFingerprintHash ||
    next.runtimeMetadata.proxyFingerprintHash
  next.runtimeMetadata.lastQuickIsolationCheck =
    remoteProfile.lastQuickIsolationCheck || next.runtimeMetadata.lastQuickIsolationCheck
  next.runtimeMetadata.trustedLaunchSnapshot =
    remoteProfile.trustedLaunchSnapshot || next.runtimeMetadata.trustedLaunchSnapshot
  return next
}

function mapRemoteProfileToLocalInput(remoteProfile: ControlPlaneProfile): UpdateProfileInput {
  const existing = requireDatabase().getProfileById(remoteProfile.id)
  const matchedSavedProxy = findMatchingSavedProxyForRemoteProfile(remoteProfile, existing)
  return {
    id: remoteProfile.id,
    name: remoteProfile.name || 'Remote Profile',
    proxyId: matchedSavedProxy?.id || null,
    groupName: remoteProfile.groupId || existing?.groupName || '',
    tags: Array.isArray(remoteProfile.tags) ? remoteProfile.tags : existing?.tags || [],
    notes: existing?.notes || '',
    fingerprintConfig: buildFingerprintFromRemoteProfile(remoteProfile, existing),
  }
}

function mapLocalProfileToRemotePayload(profile: UpdateProfileInput | ProfileRecord) {
  const proxySettings = profile.fingerprintConfig.proxySettings
  const resolvedProxy = resolveProfileProxy(profile, requireDatabase())
  const startupUrl = resolveProfileStartupUrl(profile)
  return {
    name: profile.name,
    tags: profile.tags,
    status: 'Ready',
    proxyType: resolvedProxy ? resolvedProxy.type : proxySettings.proxyMode === 'direct' ? 'direct' : proxySettings.proxyType,
    proxyHost: resolvedProxy?.host || proxySettings.host,
    proxyPort: resolvedProxy ? String(resolvedProxy.port) : proxySettings.port > 0 ? String(proxySettings.port) : '',
    proxyUsername: resolvedProxy?.username || proxySettings.username,
    proxyPassword: resolvedProxy?.password || proxySettings.password,
    ua: profile.fingerprintConfig.userAgent,
    seed: profile.fingerprintConfig.basicSettings.cookieSeed,
    isMobile: profile.fingerprintConfig.advanced.deviceMode !== 'desktop',
    groupId: profile.groupName,
    startupPlatform: profile.fingerprintConfig.basicSettings.platform,
    startupUrl: startupUrl || getSettings().defaultHomePage || '',
    configFingerprintHash: profile.fingerprintConfig.runtimeMetadata.configFingerprintHash,
    proxyFingerprintHash: profile.fingerprintConfig.runtimeMetadata.proxyFingerprintHash,
    lastQuickIsolationCheck: profile.fingerprintConfig.runtimeMetadata.lastQuickIsolationCheck,
    trustedLaunchSnapshot: profile.fingerprintConfig.runtimeMetadata.trustedLaunchSnapshot,
  }
}

function syncRemoteProfileIntoLocal(remoteProfile: ControlPlaneProfile): ProfileRecord {
  const database = requireDatabase()
  const localInput = mapRemoteProfileToLocalInput(remoteProfile)
  const profile = database.updateProfile(localInput)
  database.setProfileStatus(profile.id, mapControlPlaneStatus(remoteProfile.status))
  return database.getProfileById(profile.id) || profile
}

async function syncProfilesFromControlPlane(): Promise<number> {
  const payload = await requestControlPlane('/api/profiles')
  const remoteProfiles = Array.isArray(payload.profiles)
    ? (payload.profiles as ControlPlaneProfile[])
    : []
  const database = requireDatabase()
  const remoteIds = new Set(remoteProfiles.map((item) => item.id))
  const remoteNames = new Set(remoteProfiles.map((item) => item.name))

  for (const localProfile of database.listProfiles()) {
    if (remoteIds.has(localProfile.id) || remoteNames.has(localProfile.name)) {
      continue
    }
    const createdPayload = await requestControlPlane('/api/profiles', {
      method: 'POST',
      body: JSON.stringify(mapLocalProfileToRemotePayload(localProfile)),
    })
    const createdRemote = (createdPayload.profile || {}) as ControlPlaneProfile
    remoteProfiles.push(createdRemote)
    remoteIds.add(createdRemote.id)
    remoteNames.add(createdRemote.name)
    if (createdRemote.id && createdRemote.id !== localProfile.id) {
      database.deleteProfile(localProfile.id)
    }
  }

  for (const remoteProfile of remoteProfiles) {
    syncRemoteProfileIntoLocal(remoteProfile)
  }
  return remoteProfiles.length
}

async function syncProfileStatusToControlPlane(
  profileId: string,
  status: ProfileRecord['status'] | 'queued' | 'starting' | 'idle',
): Promise<void> {
  if (!getDesktopAuthState().authenticated) {
    return
  }
  try {
    await requestControlPlane(`/api/profiles/${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: mapLocalStatusToControlPlaneStatus(status),
        lastActive: status === 'running' ? new Date().toISOString() : '',
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logEvent('warn', 'runtime', `Failed syncing runtime status for ${profileId}: ${message}`, profileId)
  }
}

async function syncProfileLaunchTrustToControlPlane(profile: ProfileRecord): Promise<void> {
  if (!getDesktopAuthState().authenticated) {
    return
  }
  try {
    await requestControlPlane(`/api/profiles/${encodeURIComponent(profile.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        configFingerprintHash: profile.fingerprintConfig.runtimeMetadata.configFingerprintHash,
        proxyFingerprintHash: profile.fingerprintConfig.runtimeMetadata.proxyFingerprintHash,
        lastQuickIsolationCheck: profile.fingerprintConfig.runtimeMetadata.lastQuickIsolationCheck,
        trustedLaunchSnapshot: profile.fingerprintConfig.runtimeMetadata.trustedLaunchSnapshot,
        lastResolvedProxyTransport: profile.fingerprintConfig.runtimeMetadata.lastEffectiveProxyTransport,
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logEvent('warn', 'runtime', `Failed syncing launch trust for ${profile.id}: ${message}`, profile.id)
  }
}

async function applyStorageStateToContext(
  context: BrowserContext,
  stateJson: BrowserStorageState | null,
): Promise<void> {
  if (!stateJson) {
    return
  }
  await context.clearCookies()
  if (Array.isArray(stateJson.cookies) && stateJson.cookies.length > 0) {
    await context.addCookies(stateJson.cookies as unknown as Parameters<BrowserContext['addCookies']>[0])
  }
  if (!Array.isArray(stateJson.origins) || stateJson.origins.length === 0) {
    return
  }

  const page = context.pages()[0] ?? (await context.newPage())
  for (const originState of stateJson.origins) {
    if (!originState?.origin || !Array.isArray(originState.localStorage) || originState.localStorage.length === 0) {
      continue
    }
    try {
      await page.goto(originState.origin, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.evaluate((entries: Array<{ name: string; value: string }>) => {
        const storage = (globalThis as unknown as {
          localStorage: {
            clear(): void
            setItem(name: string, value: string): void
          }
        }).localStorage
        storage.clear()
        for (const entry of entries) {
          storage.setItem(entry.name, entry.value)
        }
      }, originState.localStorage)
    } catch (error) {
      logEvent(
        'warn',
        'runtime',
        `Failed applying localStorage for ${originState.origin}: ${error instanceof Error ? error.message : String(error)}`,
        null,
      )
    }
  }
}

function clearProfileStorageSyncTimer(profileId: string): void {
  const existing = runtimeStorageSyncTimers.get(profileId)
  if (existing) {
    clearInterval(existing)
    runtimeStorageSyncTimers.delete(profileId)
  }
}

type StorageStateUploadReason = 'periodic' | 'stop' | 'graceful-shutdown' | 'context-close'

async function uploadProfileStorageStateToControlPlane(
  profileId: string,
  options: {
    context?: BrowserContext | null
    reason: StorageStateUploadReason
  },
): Promise<void> {
  if (!getDesktopAuthState().authenticated) {
    return
  }
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    return
  }

  let stateJson: BrowserStorageState | null = null
  if (options.context) {
    stateJson = await saveProfileStorageStateToDisk(profileId, options.context)
  } else {
    stateJson = await readProfileStorageStateFromDisk(profileId)
  }
  if (!stateJson) {
    return
  }

  const stateHash = hashStorageState(stateJson)
  const pendingProfile = updateRuntimeMetadata(profile, {
    lastStorageStateSyncStatus: 'pending',
    lastStorageStateSyncMessage: '正在同步云端登录态',
  })

  try {
    const remoteState = await fetchRemoteProfileStorageState(profileId)
    const localVersion = Math.max(
      0,
      Number(pendingProfile.fingerprintConfig.runtimeMetadata.lastStorageStateVersion || 0),
    )
    const baseVersion = remoteState ? localVersion : 0
    if (remoteState && remoteState.stateHash && remoteState.stateHash === stateHash) {
      updateRuntimeMetadata(pendingProfile, {
        lastStorageStateVersion: remoteState.version,
        lastStorageStateSyncedAt: remoteState.updatedAt || new Date().toISOString(),
        lastStorageStateDeviceId: remoteState.deviceId || '',
        lastStorageStateSyncStatus: 'synced',
        lastStorageStateSyncMessage: '云端登录态已同步',
      })
      return
    }
    if (remoteState && remoteState.version > localVersion) {
      updateRuntimeMetadata(pendingProfile, {
        lastStorageStateVersion: remoteState.version,
        lastStorageStateSyncedAt: remoteState.updatedAt || new Date().toISOString(),
        lastStorageStateDeviceId: remoteState.deviceId || '',
        lastStorageStateSyncStatus: 'conflict',
        lastStorageStateSyncMessage: '云端登录态已更新，请重新启动环境以同步最新状态',
      })
      audit('storage_state_conflict', {
        profileId,
        reason: options.reason,
        localVersion,
        remoteVersion: remoteState.version,
      })
      return
    }
    if (remoteState && remoteState.version === localVersion && remoteState.stateHash && remoteState.stateHash === stateHash) {
      updateRuntimeMetadata(pendingProfile, {
        lastStorageStateSyncStatus: 'synced',
        lastStorageStateSyncMessage: '云端登录态已同步',
      })
      return
    }

    const token = getStoredAuthToken()
    if (!token) {
      return
    }
    const response = await fetch(
      `${getControlPlaneApiBase()}/api/profile-storage-state/${encodeURIComponent(profileId)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          stateJson,
          encrypted: false,
          baseVersion,
          deviceId: getControlPlaneDeviceId(),
          source: 'desktop',
          stateHash,
        }),
      },
    )
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (response.status === 409) {
      const conflict = (payload.conflict || {}) as Record<string, unknown>
      updateRuntimeMetadata(pendingProfile, {
        lastStorageStateVersion: Number(conflict.currentVersion || localVersion),
        lastStorageStateSyncedAt: String(conflict.updatedAt || ''),
        lastStorageStateDeviceId: String(conflict.deviceId || ''),
        lastStorageStateSyncStatus: 'conflict',
        lastStorageStateSyncMessage: '云端登录态已更新，请重新启动环境以同步最新状态',
      })
      audit('storage_state_conflict', {
        profileId,
        reason: options.reason,
        localVersion,
        remoteVersion: Number(conflict.currentVersion || 0),
      })
      return
    }
    if (!response.ok || payload.success === false) {
      throw new Error(String(payload.error || `${response.status} ${response.statusText}`))
    }

    const storageState = (payload.storageState || {}) as Record<string, unknown>
    updateRuntimeMetadata(pendingProfile, {
      lastStorageStateVersion: Number(storageState.version || localVersion),
      lastStorageStateSyncedAt: String(storageState.updatedAt || new Date().toISOString()),
      lastStorageStateDeviceId: String(storageState.deviceId || getControlPlaneDeviceId()),
      lastStorageStateSyncStatus: 'synced',
      lastStorageStateSyncMessage: '云端登录态已同步',
    })
    audit('storage_state_uploaded', {
      profileId,
      reason: options.reason,
      version: Number(storageState.version || 0),
    })
  } catch (error) {
    updateRuntimeMetadata(pendingProfile, {
      lastStorageStateSyncStatus: 'error',
      lastStorageStateSyncMessage: error instanceof Error ? error.message : String(error),
    })
    audit('storage_state_upload_failed', {
      profileId,
      reason: options.reason,
      err: String(error),
    })
    logEvent(
      'warn',
      'runtime',
      `Failed syncing storage state for ${profile.name}: ${error instanceof Error ? error.message : String(error)}`,
      profileId,
    )
  }
}

function startProfileStorageSyncTimer(profileId: string, context: BrowserContext): void {
  clearProfileStorageSyncTimer(profileId)
  const timer = setInterval(() => {
    void uploadProfileStorageStateToControlPlane(profileId, {
      context,
      reason: 'periodic',
    })
  }, PROFILE_STORAGE_SYNC_INTERVAL_MS)
  runtimeStorageSyncTimers.set(profileId, timer)
}

async function downloadProfileStorageStateFromControlPlane(profileId: string): Promise<boolean> {
  if (!getDesktopAuthState().authenticated) {
    return false
  }
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    return false
  }
  try {
    const remoteState = await fetchRemoteProfileStorageState(profileId)
    if (!remoteState) {
      return false
    }
    const localVersion = Math.max(
      0,
      Number(profile.fingerprintConfig.runtimeMetadata.lastStorageStateVersion || 0),
    )
    if (remoteState.version <= localVersion) {
      return false
    }
    const normalizedState = normalizeStorageState(remoteState.stateJson)
    if (!normalizedState) {
      return false
    }
    await writeProfileStorageStateToDisk(profileId, normalizedState)
    updateRuntimeMetadata(profile, {
      lastStorageStateVersion: remoteState.version,
      lastStorageStateSyncedAt: remoteState.updatedAt || new Date().toISOString(),
      lastStorageStateDeviceId: remoteState.deviceId || '',
      lastStorageStateSyncStatus: 'synced',
      lastStorageStateSyncMessage: '已下载云端登录态',
    })
    audit('storage_state_downloaded', {
      profileId,
      version: remoteState.version,
      deviceId: remoteState.deviceId,
    })
    return true
  } catch (error) {
    updateRuntimeMetadata(profile, {
      lastStorageStateSyncStatus: 'error',
      lastStorageStateSyncMessage: error instanceof Error ? error.message : String(error),
    })
    audit('storage_state_download_failed', {
      profileId,
      err: String(error),
    })
    logEvent(
      'warn',
      'runtime',
      `Failed downloading cloud storage state for ${profile.name}: ${error instanceof Error ? error.message : String(error)}`,
      profileId,
    )
    return false
  }
}

function resolveDefaultCloudPhoneProviderKey(): string {
  return getSettings().defaultCloudPhoneProvider?.trim() || 'self-hosted'
}

function resolveCloudPhoneProvider(record: { providerKey: string }) {
  return cloudPhoneProviderRegistry.getProvider(record.providerKey || resolveDefaultCloudPhoneProviderKey())
}

function logEvent(
  level: LogLevel,
  category: 'profile' | 'proxy' | 'runtime' | 'system' | 'cloud-phone',
  message: string,
  profileId: string | null = null,
): void {
  requireDatabase().createLog({ level, category, message, profileId })
}

function syncTheme(): void {
  nativeTheme.themeSource = 'light'
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#071425',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWindow.loadFile(rendererFile)
  }
}

async function updateProfileStatus(
  profileId: string,
  status: ProfileRecord['status'],
): Promise<void> {
  requireDatabase().setProfileStatus(profileId, status)
  await syncProfileStatusToControlPlane(profileId, status)
}

function toCandidateProxy(
  proxy: ProxyRecord | null,
  candidateTransport?: ProxyEntryTransport,
): ProxyRecord | null {
  if (!proxy || !candidateTransport || candidateTransport === 'direct') {
    return proxy
  }
  if (candidateTransport === 'https-entry') {
    return { ...proxy, type: 'https' }
  }
  if (candidateTransport === 'http-entry') {
    return { ...proxy, type: 'http' }
  }
  if (candidateTransport === 'socks5-entry') {
    return { ...proxy, type: 'socks5' }
  }
  return proxy
}

function toEntryTransport(proxy: ProxyRecord | null): ProxyEntryTransport {
  if (!proxy) {
    return 'direct'
  }
  if (proxy.type === 'https') {
    return 'https-entry'
  }
  if (proxy.type === 'socks5') {
    return 'socks5-entry'
  }
  return 'http-entry'
}

async function stopRuntime(profileId: string): Promise<void> {
  scheduler.cancel(profileId)
  const context = runtimeContexts.get(profileId)
  if (!context) {
    clearProfileStorageSyncTimer(profileId)
    await runtimeHostManager.stopEnvironment(profileId)
    await updateProfileStatus(profileId, 'stopped')
    return
  }

  clearProfileStorageSyncTimer(profileId)
  await uploadProfileStorageStateToControlPlane(profileId, {
    context,
    reason: 'stop',
  })
  runtimeContexts.delete(profileId)
  await context.close()
  await runtimeHostManager.stopEnvironment(profileId)
  scheduler.markStopped(profileId)
}

async function launchMany(profileIds: string[]): Promise<void> {
  for (const profileId of profileIds) {
    await enqueueLaunch(profileId)
  }
}

async function stopMany(profileIds: string[]): Promise<void> {
  for (const profileId of profileIds) {
    await stopRuntime(profileId)
  }
}

async function performProxyConnectivityTest(
  proxy: ProxyRecord,
  options: {
    label: string
    syncStoredProxyId?: string
    category?: 'proxy' | 'cloud-phone'
  },
) {
  const category = options.category ?? 'proxy'
  try {
    const browser = await chromium.launch({
      headless: true,
      executablePath: resolveChromiumExecutable(),
      proxy: proxyToPlaywrightConfig(proxy) ?? undefined,
    })
    const page = await browser.newPage()
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 20000 })
    await browser.close()

    const checkedAt = new Date().toISOString()
    if (options.syncStoredProxyId) {
      requireDatabase().setProxyStatus(options.syncStoredProxyId, 'online')
    }
    logEvent('info', category, `Proxy "${options.label}" verified locally`, null)
    return {
      success: true,
      message: 'Proxy verified locally',
      checkedAt,
    }
  } catch (error) {
    if (getDesktopAuthState().authenticated) {
      logEvent(
        'warn',
        category,
        `Local proxy check failed for "${options.label}", attempting control plane fallback`,
        null,
      )
      try {
        const result = await requestControlPlane('/api/proxy/browser-check', {
          method: 'POST',
          body: JSON.stringify({
            proxyType: proxy.type,
            proxyHost: proxy.host,
            proxyPort: String(proxy.port),
            proxyUsername: proxy.username,
            proxyPassword: proxy.password,
          }),
        })
        const success = Boolean(result.status === 'verified' || result.browserVerified === true)
        const checkedAt = String(result.checkedAt || new Date().toISOString())
        if (options.syncStoredProxyId) {
          requireDatabase().setProxyStatus(options.syncStoredProxyId, success ? 'online' : 'offline')
        }
        logEvent(
          success ? 'info' : 'warn',
          category,
          success
            ? `Proxy "${options.label}" verified via control plane fallback`
            : `Proxy "${options.label}" failed local and control plane verification`,
          null,
        )
        return {
          success,
          message: String(
            result.detail ||
              result.error ||
              (success
                ? 'Proxy verified successfully via control plane fallback'
                : 'Proxy verification failed')
          ),
          checkedAt,
        }
      } catch (remoteError) {
        logEvent(
          'warn',
          category,
          `Control plane proxy check also failed for "${options.label}": ${remoteError instanceof Error ? remoteError.message : String(remoteError)}`,
          null,
        )
      }
    }

    const checkedAt = new Date().toISOString()
    if (options.syncStoredProxyId) {
      requireDatabase().setProxyStatus(options.syncStoredProxyId, 'offline')
    }
    logEvent('error', category, `Proxy "${options.label}" test failed locally`, null)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown proxy error',
      checkedAt,
    }
  }
}

async function testProxyById(proxyId: string) {
  const proxy = requireDatabase().getProxyById(proxyId)
  if (!proxy) {
    throw new Error('Proxy not found')
  }
  return performProxyConnectivityTest(proxy, {
    label: proxy.name,
    syncStoredProxyId: proxyId,
    category: 'proxy',
  })
}

function resolveCloudPhoneProxyConfig(
  input: CreateCloudPhoneInput | UpdateCloudPhoneInput,
): Pick<
  CreateCloudPhoneInput,
  'proxyRefMode' | 'proxyId' | 'proxyType' | 'ipProtocol' | 'proxyHost' | 'proxyPort' | 'proxyUsername' | 'proxyPassword' | 'udpEnabled'
> {
  if (input.proxyRefMode === 'saved') {
    if (!input.proxyId) {
      throw new Error('请选择已保存代理')
    }
    const proxy = requireDatabase().getProxyById(input.proxyId)
    if (!proxy) {
      throw new Error('所选代理不存在，请重新选择')
    }
    return {
      proxyRefMode: 'saved',
      proxyId: proxy.id,
      proxyType: proxy.type,
      ipProtocol: input.ipProtocol,
      proxyHost: proxy.host,
      proxyPort: proxy.port,
      proxyUsername: proxy.username,
      proxyPassword: proxy.password,
      udpEnabled: input.udpEnabled,
    }
  }

  return {
    proxyRefMode: 'custom',
    proxyId: null,
    proxyType: input.proxyType,
    ipProtocol: input.ipProtocol,
    proxyHost: input.proxyHost.trim(),
    proxyPort: Number(input.proxyPort),
    proxyUsername: input.proxyUsername.trim(),
    proxyPassword: input.proxyPassword,
    udpEnabled: input.udpEnabled,
  }
}

function parseBundle(content: string): ExportBundle {
  const parsed = JSON.parse(content) as Partial<ExportBundle>
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray(parsed.profiles) ||
    !Array.isArray(parsed.proxies) ||
    !Array.isArray(parsed.templates)
  ) {
    throw new Error('Invalid import bundle')
  }
  return {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    profiles: parsed.profiles,
    proxies: parsed.proxies,
    templates: parsed.templates,
    cloudPhones: Array.isArray(parsed.cloudPhones) ? parsed.cloudPhones : [],
  }
}

async function syncCloudPhoneStatus(id: string, status: CloudPhoneRecord['status']): Promise<void> {
  requireDatabase().setCloudPhoneStatus(id, status)
}

async function startCloudPhone(id: string): Promise<void> {
  const record = requireDatabase().getCloudPhoneById(id)
  if (!record) {
    throw new Error('Cloud phone environment not found')
  }
  await syncCloudPhoneStatus(id, 'starting')
  const provider = resolveCloudPhoneProvider(record)
  const status = await provider.startEnvironment(record, getSettings())
  await syncCloudPhoneStatus(id, status)
  logEvent('info', 'cloud-phone', `Started cloud phone "${record.name}" via ${provider.label}`, null)
}

async function stopCloudPhone(id: string): Promise<void> {
  const record = requireDatabase().getCloudPhoneById(id)
  if (!record) {
    return
  }
  await syncCloudPhoneStatus(id, 'stopping')
  const provider = resolveCloudPhoneProvider(record)
  const status = await provider.stopEnvironment(record, getSettings())
  await syncCloudPhoneStatus(id, status)
  logEvent('info', 'cloud-phone', `Stopped cloud phone "${record.name}" via ${provider.label}`, null)
}

async function refreshCloudPhoneStatuses(): Promise<CloudPhoneRecord[]> {
  const database = requireDatabase()
  for (const cloudPhone of database.listCloudPhones()) {
    const provider = resolveCloudPhoneProvider(cloudPhone)
    const status = await provider.getEnvironmentStatus(cloudPhone, getSettings())
    database.setCloudPhoneStatus(cloudPhone.id, status)
  }
  return database.listCloudPhones()
}

function getRuntimeNumberSetting(key: string, fallback: number): number {
  const value = Number(getSettings()[key])
  if (!Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.floor(value)
}

function getMaxConcurrentStarts(): number {
  return getRuntimeNumberSetting('runtimeMaxConcurrentStarts', DEFAULT_CONCURRENT_STARTS)
}

function getMaxActiveProfiles(): number {
  return getRuntimeNumberSetting('runtimeMaxActiveProfiles', DEFAULT_ACTIVE_LIMIT)
}

function getMaxLaunchRetries(): number {
  return getRuntimeNumberSetting('runtimeMaxLaunchRetries', DEFAULT_LAUNCH_RETRIES)
}

function getRuntimeHostInfo() {
  const settings = getSettings()
  const kind = resolveRequestedRuntimeKind(settings)
  const available = isRuntimeHostSupported(kind)
  return {
    kind,
    label: available ? kind : `local fallback for ${kind}`,
    available,
    reason: available
      ? 'runtime host ready'
      : `runtime host "${kind}" is unavailable on this platform; falling back to local`,
    activeHosts: runtimeHostManager.listEnvironments().length,
  }
}

function persistProfile(profile: ProfileRecord): ProfileRecord {
  return requireDatabase().updateProfile({
    id: profile.id,
    name: profile.name,
    proxyId: profile.proxyId,
    groupName: profile.groupName,
    tags: profile.tags,
    notes: profile.notes,
    fingerprintConfig: profile.fingerprintConfig,
  })
}

function updateRuntimeMetadata(
  profile: ProfileRecord,
  metadataPatch: Partial<ProfileRecord['fingerprintConfig']['runtimeMetadata']>,
): ProfileRecord {
  return persistProfile({
    ...profile,
    fingerprintConfig: {
      ...profile.fingerprintConfig,
      runtimeMetadata: {
        ...profile.fingerprintConfig.runtimeMetadata,
        ...metadataPatch,
      },
    },
  })
}

function resolveProfileProxy(
  profile: Pick<ProfileRecord, 'id' | 'proxyId' | 'fingerprintConfig'> | UpdateProfileInput,
  database: DatabaseService,
): ProxyRecord | null {
  const proxySettings = profile.fingerprintConfig.proxySettings
  if (proxySettings.proxyMode === 'manager' && profile.proxyId) {
    return database.getProxyById(profile.proxyId)
  }
  if (proxySettings.proxyMode === 'custom' && proxySettings.host && proxySettings.port > 0) {
    return {
      id: 'id' in profile && profile.id ? `${profile.id}-custom-proxy` : 'custom',
      name: 'Custom profile proxy',
      type: proxySettings.proxyType,
      host: proxySettings.host,
      port: proxySettings.port,
      username: proxySettings.username,
      password: proxySettings.password,
      status: 'unknown',
      lastCheckedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies ProxyRecord
  }
  return null
}

async function applyResolvedNetworkProfileToPayload(
  payload: UpdateProfileInput,
  database: DatabaseService,
): Promise<UpdateProfileInput> {
  if (
    !payload.fingerprintConfig.advanced.autoTimezoneFromIp &&
    !payload.fingerprintConfig.advanced.autoLanguageFromIp &&
    !payload.fingerprintConfig.advanced.autoGeolocationFromIp
  ) {
    return payload
  }
  const proxy = resolveProfileProxy(payload, database)
  const check = await checkNetworkHealth(
    {
      ...payload,
      status: 'stopped',
      lastStartedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    proxy,
  )
  if (!check.ok) {
    logEvent(
      'warn',
      'profile',
      `Unable to resolve IP-linked fingerprint data for "${payload.name}" during save`,
      payload.id,
    )
    return payload
  }
  const resolved = applyNetworkDerivedFingerprint(
    {
      ...payload,
      status: 'stopped',
      lastStartedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    check,
  )
  return {
    ...payload,
    fingerprintConfig: {
      ...resolved.fingerprintConfig,
      runtimeMetadata: {
        ...resolved.fingerprintConfig.runtimeMetadata,
        lastResolvedIp: check.ip,
        lastResolvedCountry: check.country,
        lastResolvedRegion: check.region,
        lastResolvedCity: check.city,
        lastResolvedTimezone: check.timezone,
        lastResolvedLanguage: check.languageHint,
        lastResolvedGeolocation: check.geolocation,
        lastResolvedAt: new Date().toISOString(),
        lastProxyCheckAt: new Date().toISOString(),
        lastProxyCheckSuccess: check.ok,
        lastProxyCheckMessage: check.message,
      },
    },
  }
}

async function runProxyPreflight(
  profile: ProfileRecord,
  database: DatabaseService,
): Promise<{ proxy: ProxyRecord | null; check: NetworkHealthResult }> {
  const originalProxy = resolveProfileProxy(profile, database)
  const check = await checkNetworkHealth(profile, originalProxy)
  const proxy = toCandidateProxy(originalProxy, toEntryTransport(originalProxy))
  updateRuntimeMetadata(profile, {
    lastResolvedIp: check.ip,
    lastResolvedCountry: check.country,
    lastResolvedRegion: check.region,
    lastResolvedCity: check.city,
    lastResolvedTimezone: check.timezone,
    lastResolvedLanguage: check.languageHint,
    lastResolvedGeolocation: check.geolocation,
    lastResolvedAt: new Date().toISOString(),
    lastProxyCheckAt: new Date().toISOString(),
    lastProxyCheckSuccess: check.ok,
    lastProxyCheckMessage: check.message,
  })
  if (profile.proxyId && profile.fingerprintConfig.proxySettings.proxyMode === 'manager') {
    database.setProxyStatus(profile.proxyId, check.ok ? 'online' : 'offline')
  }
  if (!check.ok && proxy) {
    throw new Error(`Proxy preflight failed for "${profile.name}"`)
  }
  return { proxy, check }
}

function buildInjectedFeatures(profile: ProfileRecord): string[] {
  const features: string[] = []
  const advanced = profile.fingerprintConfig.advanced
  if (advanced.canvasMode !== 'off') features.push('canvas')
  if (advanced.webglImageMode !== 'off' || advanced.webglMetadataMode !== 'off') features.push('webgl')
  if (advanced.audioContextMode !== 'off') features.push('audio')
  if (advanced.clientRectsMode !== 'off') features.push('clientRects')
  if (advanced.mediaDevicesMode !== 'off') features.push('mediaDevices')
  if (advanced.speechVoicesMode !== 'off') features.push('speechVoices')
  return features
}

function parseGeolocation(value: string): { latitude: number; longitude: number } | undefined {
  const [latitudeText, longitudeText] = value.split(',').map((item) => Number(item.trim()))
  if (!Number.isFinite(latitudeText) || !Number.isFinite(longitudeText)) {
    return undefined
  }
  return { latitude: latitudeText, longitude: longitudeText }
}

async function launchRuntimeNow(profileId: string): Promise<void> {
  const database = requireDatabase()
  const storedProfile = database.getProfileById(profileId)
  if (!storedProfile) {
    throw new Error('Profile not found')
  }
  let profile = storedProfile

  if (runtimeContexts.has(profileId)) {
    return
  }
  const proxy = resolveProfileProxy(profile, database)
  const validation = validateProfileForLaunch(profile, proxy)
  const configFingerprintHash = buildConfigFingerprintHash(profile)
  const proxyFingerprintHash = buildProxyFingerprintHash(profile, proxy)
  const existingSnapshot = profile.fingerprintConfig.runtimeMetadata.trustedLaunchSnapshot
  profile = updateRuntimeMetadata(profile, {
    lastValidationLevel: validation.level,
    lastValidationMessages: validation.messages,
    configFingerprintHash,
    proxyFingerprintHash,
    launchValidationStage: 'idle',
    launchRetryCount: scheduler.getRetryCounts()[profileId] ?? 0,
  })
  if (validation.level === 'block') {
    throw new Error(validation.messages.join(' '))
  }

  let resolvedProxy: ProxyRecord | null = proxy
  let check: NetworkHealthResult
  let effectiveProxyTransport = toEntryTransport(proxy)
  let usedTrustedSnapshot = false

  if (shouldUseTrustedSnapshot(profile, existingSnapshot, configFingerprintHash, proxyFingerprintHash)) {
    usedTrustedSnapshot = true
    audit('quick_check_start', { profileId })
    profile = updateRuntimeMetadata(profile, {
      launchValidationStage: 'quick-check',
      trustedSnapshotStatus: 'trusted',
    })
    check = await checkNetworkHealth(profile, proxy)
    effectiveProxyTransport = toEntryTransport(proxy)
    const comparison = compareSnapshotWithCheck(existingSnapshot!, check, effectiveProxyTransport)
    const quickCheck = buildQuickIsolationCheck(
      check,
      effectiveProxyTransport,
      comparison.ok,
      comparison.message,
    )
    profile = updateRuntimeMetadata(profile, {
      lastQuickCheckAt: quickCheck.checkedAt,
      lastQuickCheckSuccess: quickCheck.success,
      lastQuickCheckMessage: quickCheck.message,
      lastQuickIsolationCheck: quickCheck,
      lastEffectiveProxyTransport: effectiveProxyTransport,
      trustedSnapshotStatus: comparison.ok ? 'trusted' : 'invalid',
      trustedLaunchSnapshot: comparison.ok
        ? existingSnapshot
        : existingSnapshot
          ? { ...existingSnapshot, status: 'invalid', verificationLevel: 'quick' }
          : null,
    })
    void syncProfileLaunchTrustToControlPlane(profile)
    if (!comparison.ok) {
      audit('quick_check_failed', { profileId, reason: comparison.message })
      throw new Error(comparison.message)
    }
  } else {
    audit('full_check_start', { profileId })
    profile = updateRuntimeMetadata(profile, {
      launchValidationStage: 'full-check',
      trustedSnapshotStatus: existingSnapshot ? 'stale' : 'unknown',
      trustedLaunchSnapshot: existingSnapshot
        ? { ...existingSnapshot, status: 'stale' }
        : existingSnapshot,
    })
    const preflightResult = await runProxyPreflight(profile, database)
    resolvedProxy = preflightResult.proxy
    check = preflightResult.check
    effectiveProxyTransport = toEntryTransport(resolvedProxy)
    profile = updateRuntimeMetadata(profile, {
      lastQuickCheckAt: '',
      lastQuickCheckSuccess: null,
      lastQuickCheckMessage: '',
      lastQuickIsolationCheck: null,
      lastEffectiveProxyTransport: effectiveProxyTransport,
      trustedSnapshotStatus: 'stale',
    })
  }

  if (scheduler.isCancelled(profileId)) {
    throw new Error('Launch cancelled')
  }
  profile = database.getProfileById(profileId) ?? profile
  profile = persistProfile(applyNetworkDerivedFingerprint(profile, check))
  profile = persistProfile({
    ...profile,
    fingerprintConfig: {
      ...profile.fingerprintConfig,
      timezone: profile.fingerprintConfig.timezone || DEFAULT_TIMEZONE_FALLBACK,
      runtimeMetadata: {
        ...profile.fingerprintConfig.runtimeMetadata,
        launchValidationStage: 'browser-launch',
      },
    },
  })

  const finalConfigFingerprintHash = buildConfigFingerprintHash(profile)
  const finalProxyFingerprintHash = buildProxyFingerprintHash(profile, resolvedProxy)
  if (!usedTrustedSnapshot) {
    const refreshedSnapshot = buildTrustedLaunchSnapshot(
      profile,
      check,
      finalConfigFingerprintHash,
      finalProxyFingerprintHash,
      effectiveProxyTransport,
    )
    profile = updateRuntimeMetadata(profile, {
      configFingerprintHash: finalConfigFingerprintHash,
      proxyFingerprintHash: finalProxyFingerprintHash,
      trustedSnapshotStatus: 'trusted',
      trustedLaunchSnapshot: refreshedSnapshot,
      lastEffectiveProxyTransport: effectiveProxyTransport,
    })
    void syncProfileLaunchTrustToControlPlane(profile)
  }

  const directoryInfo = getProfileDirectoryInfo(app)
  ensureProfileDirectory(directoryInfo.profilesDir)
  const userDataDir = getProfilePath(app, profileId)
  mkdirSync(userDataDir, { recursive: true })
  await downloadProfileStorageStateFromControlPlane(profileId)
  const runtimeHost = await runtimeHostManager.startEnvironment(profileId, userDataDir, getSettings())
  audit('runtime_host_ready', {
    profileId,
    kind: runtimeHost.kind,
    available: runtimeHost.available,
    reason: runtimeHost.reason,
  })

  const settings = database.getSettings()
  const fingerprint = profile.fingerprintConfig
  const locale = parseLocale(fingerprint.language)
  const viewport = normalizeResolution(
    fingerprint.advanced.windowWidth && fingerprint.advanced.windowHeight
      ? `${fingerprint.advanced.windowWidth}x${fingerprint.advanced.windowHeight}`
      : fingerprint.resolution,
  )
  const executablePath = resolveChromiumExecutable()

  const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless: false,
    executablePath,
    viewport,
    locale,
    timezoneId: fingerprint.timezone || DEFAULT_TIMEZONE_FALLBACK,
    userAgent: fingerprint.userAgent,
    ignoreHTTPSErrors: true,
    geolocation: parseGeolocation(fingerprint.advanced.geolocation),
    permissions:
      fingerprint.advanced.geolocationPermission === 'allow' && parseGeolocation(fingerprint.advanced.geolocation)
        ? ['geolocation']
        : [],
    args: buildRuntimeArgs(
      fingerprint.webrtcMode,
      fingerprint.advanced.launchArgs,
      !fingerprint.commonSettings.hardwareAcceleration,
    ),
  }

  const proxyConfig = proxyToPlaywrightConfig(resolvedProxy)
  if (proxyConfig) {
    launchOptions.proxy = proxyConfig
  }

  const diagnostics = buildNetworkDiagnosticsSummary(runtimeHost, check)
  audit('runtime_network_diagnostics', {
    profileId,
    level: diagnostics.level,
    messages: diagnostics.messages,
  })

  const context = await chromium.launchPersistentContext(userDataDir, launchOptions)
  if (scheduler.isCancelled(profileId)) {
    await context.close()
    throw new Error('Launch cancelled')
  }
  runtimeContexts.set(profileId, context)
  startProfileStorageSyncTimer(profileId, context)
  database.touchProfileLastStarted(profileId)
  const injectedFeatures = buildInjectedFeatures(profile)
  profile = updateRuntimeMetadata(profile, {
    launchRetryCount: scheduler.getRetryCounts()[profileId] ?? 0,
    injectedFeatures,
  })
  logEvent(
    'info',
    'runtime',
    `Launched profile "${profile.name}"${resolvedProxy ? ` via ${buildProxyServer(resolvedProxy)}` : ''}`,
    profileId,
  )
  await context.addInitScript(buildFingerprintInitScript(profile.id, profile.fingerprintConfig))

  const persistStateOnLastPageClose = (pageToWatch: import('playwright').Page) => {
    pageToWatch.on('close', () => {
      if (context.pages().length > 1) {
        return
      }
      void saveProfileStorageStateToDiskSafely(profileId, context)
    })
  }

  persistStateOnLastPageClose(page)
  context.on('page', (newPage) => {
    persistStateOnLastPageClose(newPage)
  })

  context.on('close', () => {
    clearProfileStorageSyncTimer(profileId)
    runtimeContexts.delete(profileId)
    void uploadProfileStorageStateToControlPlane(profileId, {
      reason: 'context-close',
    })
    scheduler.markStopped(profileId)
    void syncProfileStatusToControlPlane(profileId, 'stopped')
    logEvent('info', 'runtime', `Closed profile "${profile.name}"`, profileId)
  })

  const pages = context.pages()
  const page = pages[0] ?? (await context.newPage())
  if (fingerprint.commonSettings.blockImages) {
    await page.route('**/*', async (route) => {
      const request = route.request()
      if (request.resourceType() === 'image') {
        await route.abort()
        return
      }
      await route.continue()
    })
  }
  const startupUrl = resolveProfileStartupUrl(profile) || settings.defaultHomePage || 'https://example.com'
  await applyStorageStateToContext(context, await readProfileStorageStateFromDisk(profileId))
  let startupNavigationPassed = false
  try {
    await page.goto(startupUrl, {
      waitUntil: 'domcontentloaded',
    })
    startupNavigationPassed = true
  } finally {
    const latestProfile = database.getProfileById(profileId) ?? profile
    const latestSnapshot = latestProfile.fingerprintConfig.runtimeMetadata.trustedLaunchSnapshot
    const nextSnapshot = latestSnapshot
      ? {
          ...latestSnapshot,
          startupNavigationPassed,
          verificationLevel:
            latestProfile.fingerprintConfig.runtimeMetadata.lastQuickCheckAt ? 'quick' : latestSnapshot.verificationLevel,
          verifiedAt: new Date().toISOString(),
        }
      : latestSnapshot
    const persisted = updateRuntimeMetadata(latestProfile, {
      launchValidationStage: 'idle',
      trustedSnapshotStatus: nextSnapshot?.status || latestProfile.fingerprintConfig.runtimeMetadata.trustedSnapshotStatus,
      trustedLaunchSnapshot: nextSnapshot,
    })
    void syncProfileLaunchTrustToControlPlane(persisted)
  }
}

const scheduler = new RuntimeScheduler({
  getMaxConcurrentStarts,
  getMaxActiveProfiles,
  getLaunchRetries: getMaxLaunchRetries,
  getRunningCount: () => runtimeContexts.size,
  onStart: launchRuntimeNow,
  onStatusChange: updateProfileStatus,
  onError: async (profileId, error) => {
    audit('start_profile_err', { profileId, err: String(error) })
    logEvent(
      'error',
      'runtime',
      error instanceof Error ? error.message : 'Unknown runtime error',
      profileId,
    )
  },
})

async function enqueueLaunch(profileId: string): Promise<void> {
  if (runtimeContexts.has(profileId)) {
    audit('enqueue_skip_existing', { profileId })
    return
  }
  if (scheduler.getQueuedIds().length > MAX_QUEUE) {
    audit('enqueue_rejected_queue_full', { profileId, queueLen: scheduler.getQueuedIds().length })
    throw new Error('launch queue is full')
  }
  const accepted = scheduler.enqueue(profileId)
  if (!accepted) {
    audit('enqueue_skip_existing', { profileId })
    return
  }
  audit('enqueue', { profileId, queueLen: scheduler.getQueuedIds().length })
}

async function registerIpcHandlers(): Promise<void> {
  ipcMain.handle('auth.getState', async () => getDesktopAuthState())
  ipcMain.handle(
    'auth.login',
    async (_event, payload: { identifier: string; password: string; apiBase?: string }) => {
      const identifier = String(payload.identifier || '').trim()
      const password = String(payload.password || '')
      const apiBase = String(payload.apiBase || '').trim() || getControlPlaneApiBase()
      if (!identifier || !password) {
        throw new Error('请输入账号和密码')
      }
      const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier,
          password,
          device: {
            deviceId: getControlPlaneDeviceId(),
            deviceName: `${os.hostname()} (${process.platform})`,
            platform: process.platform,
            source: 'desktop',
          },
        }),
      })
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
      if (!response.ok || data.success === false) {
        throw new Error(String(data.error || '登录失败'))
      }
      const user = (data.user || null) as AuthUser | null
      const token = String(data.token || '')
      if (!user || !token) {
        throw new Error('登录响应缺少用户或令牌')
      }
      const nextAuthState = saveDesktopAuth(apiBase, token, user)
      await syncProfilesFromControlPlane()
      return nextAuthState
    },
  )
  ipcMain.handle(
    'auth.updateProfile',
    async (
      _event,
      payload: { name: string; email: string; username: string; avatarUrl: string; bio: string },
    ) => {
      const response = await requestControlPlane('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: String(payload.name || '').trim(),
          email: String(payload.email || '').trim(),
          username: String(payload.username || '').trim(),
          avatarUrl: String(payload.avatarUrl || '').trim(),
          bio: String(payload.bio || '').trim(),
        }),
      })
      const user = (response.user || null) as AuthUser | null
      if (!user) {
        throw new Error('更新资料失败：缺少用户信息')
      }
      return saveDesktopAuth(getControlPlaneApiBase(), getStoredAuthToken(), user)
    },
  )
  ipcMain.handle('auth.uploadAvatar', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const selected = win
      ? await dialog.showOpenDialog(win, {
          title: 'Select avatar image',
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        })
      : await dialog.showOpenDialog({
          title: 'Select avatar image',
          properties: ['openFile'],
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        })
    if (selected.canceled || selected.filePaths.length === 0) {
      return getDesktopAuthState()
    }

    const filePath = selected.filePaths[0]
    const fileBuffer = await readFile(filePath)
    if (fileBuffer.byteLength > 1024 * 1024 * 2) {
      throw new Error('头像图片不能超过 2MB')
    }
    const ext = path.extname(filePath).toLowerCase()
    const mimeType =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg'
    const dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`
    const response = await requestControlPlane('/api/auth/avatar', {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    })
    const user = (response.user || null) as AuthUser | null
    if (!user) {
      throw new Error('头像上传失败：缺少用户信息')
    }
    return saveDesktopAuth(getControlPlaneApiBase(), getStoredAuthToken(), user)
  })
  ipcMain.handle(
    'auth.changePassword',
    async (
      _event,
      payload: { currentPassword: string; nextPassword: string },
    ) => {
      await requestControlPlane('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: String(payload.currentPassword || ''),
          nextPassword: String(payload.nextPassword || ''),
        }),
      })
      return { success: true }
    },
  )
  ipcMain.handle('auth.revokeDevice', async (_event, deviceId: string) => {
    const normalizedDeviceId = String(deviceId || '').trim()
    if (!normalizedDeviceId) {
      throw new Error('Missing deviceId')
    }
    const response = await requestControlPlane(
      `/api/auth/devices/${encodeURIComponent(normalizedDeviceId)}/revoke`,
      { method: 'POST' },
    )
    if (normalizedDeviceId === getControlPlaneDeviceId()) {
      return clearDesktopAuth()
    }
    const user = (response.user || null) as AuthUser | null
    if (!user) {
      throw new Error('更新设备失败：缺少用户信息')
    }
    return saveDesktopAuth(getControlPlaneApiBase(), getStoredAuthToken(), user)
  })
  ipcMain.handle('auth.deleteDevice', async (_event, deviceId: string) => {
    const normalizedDeviceId = String(deviceId || '').trim()
    if (!normalizedDeviceId) {
      throw new Error('Missing deviceId')
    }
    const response = await requestControlPlane(`/api/auth/devices/${encodeURIComponent(normalizedDeviceId)}`, {
      method: 'DELETE',
    })
    if (normalizedDeviceId === getControlPlaneDeviceId()) {
      return clearDesktopAuth()
    }
    const user = (response.user || null) as AuthUser | null
    if (!user) {
      throw new Error('更新设备失败：缺少用户信息')
    }
    return saveDesktopAuth(getControlPlaneApiBase(), getStoredAuthToken(), user)
  })
  ipcMain.handle('auth.logout', async () => clearDesktopAuth())
  ipcMain.handle('auth.syncProfiles', async () => ({ count: await syncProfilesFromControlPlane() }))

  ipcMain.handle('meta.getInfo', async () => ({
    mode: isDev ? 'development' : 'production',
    appVersion: app.getVersion(),
    mainVersion: app.getVersion(),
    preloadVersion: PRELOAD_VERSION,
    rendererVersion: app.getVersion(),
    capabilities: CAPABILITIES,
  }))
  ipcMain.handle('meta.getAgentState', async () => getAgentStateSnapshot())

  ipcMain.handle('dashboard.summary', async () => requireDatabase().getDashboardSummary())

  ipcMain.handle('cloudPhones.list', async () => requireDatabase().listCloudPhones())
  ipcMain.handle('cloudPhones.listProviders', async () => cloudPhoneProviderRegistry.listProviders())
  ipcMain.handle('cloudPhones.getProviderHealth', async () =>
    cloudPhoneProviderRegistry.getProviderHealth(getSettings()),
  )
  ipcMain.handle('cloudPhones.detectLocalDevices', async () =>
    cloudPhoneProviderRegistry.detectLocalDevices(getSettings()),
  )
  ipcMain.handle('cloudPhones.create', async (_event, input: CreateCloudPhoneInput) => {
    ensureWritable('cloudPhones.create')
    const providerKey = input.providerKey || resolveDefaultCloudPhoneProviderKey()
    const resolvedProxy = resolveCloudPhoneProxyConfig(input)
    const payload = createCloudPhonePayload(
      {
        ...input,
        providerKey,
        ...resolvedProxy,
      },
      providerKey,
    )
    const provider = cloudPhoneProviderRegistry.getProvider(providerKey)
    const providerResult = await provider.createEnvironment(payload, getSettings())
    const record = requireDatabase().createCloudPhone({
      ...payload,
      providerInstanceId: providerResult.providerInstanceId,
    })
    requireDatabase().setCloudPhoneProviderInstanceId(record.id, providerResult.providerInstanceId)
    requireDatabase().setCloudPhoneStatus(record.id, providerResult.status)
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'cloud-phone', `Created cloud phone "${record.name}" via ${provider.label}`, null)
    return requireDatabase().getCloudPhoneById(record.id)!
  })
  ipcMain.handle('cloudPhones.update', async (_event, input: UpdateCloudPhoneInput) => {
    ensureWritable('cloudPhones.update')
    const resolvedProxy = resolveCloudPhoneProxyConfig(input)
    const payload = createCloudPhonePayload({ ...input, ...resolvedProxy }, input.providerKey)
    const record = requireDatabase().updateCloudPhone(payload)
    const provider = resolveCloudPhoneProvider(record)
    await provider.updateEnvironment(record, getSettings())
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'cloud-phone', `Updated cloud phone "${record.name}" via ${provider.label}`, null)
    return record
  })
  ipcMain.handle('cloudPhones.delete', async (_event, cloudPhoneId: string) => {
    ensureWritable('cloudPhones.delete')
    const record = requireDatabase().getCloudPhoneById(cloudPhoneId)
    if (record) {
      const provider = resolveCloudPhoneProvider(record)
      await provider.deleteEnvironment(record, getSettings())
    }
    requireDatabase().deleteCloudPhone(cloudPhoneId)
    await syncConfigToControlPlaneOrThrow()
    logEvent('warn', 'cloud-phone', `Deleted cloud phone ${cloudPhoneId}`, null)
  })
  ipcMain.handle('cloudPhones.start', async (_event, cloudPhoneId: string) => {
    ensureWritable('cloudPhones.start')
    await startCloudPhone(cloudPhoneId)
    await syncConfigToControlPlaneOrThrow()
  })
  ipcMain.handle('cloudPhones.stop', async (_event, cloudPhoneId: string) => {
    ensureWritable('cloudPhones.stop')
    await stopCloudPhone(cloudPhoneId)
    await syncConfigToControlPlaneOrThrow()
  })
  ipcMain.handle('cloudPhones.getStatus', async (_event, cloudPhoneId: string) => {
    const record = requireDatabase().getCloudPhoneById(cloudPhoneId)
    if (!record) {
      throw new Error('Cloud phone environment not found')
    }
    const provider = resolveCloudPhoneProvider(record)
    const status = await provider.getEnvironmentStatus(record, getSettings())
    requireDatabase().setCloudPhoneStatus(cloudPhoneId, status)
    return status
  })
  ipcMain.handle('cloudPhones.getDetails', async (_event, cloudPhoneId: string) => {
    const record = requireDatabase().getCloudPhoneById(cloudPhoneId)
    if (!record) {
      throw new Error('Cloud phone environment not found')
    }
    const provider = resolveCloudPhoneProvider(record)
    return provider.getEnvironmentDetails(record, getSettings())
  })
  ipcMain.handle('cloudPhones.testProxy', async (_event, input: CreateCloudPhoneInput) => {
    const providerKey = input.providerKey || resolveDefaultCloudPhoneProviderKey()
    const resolvedProxy = resolveCloudPhoneProxyConfig(input)
    const payload = createCloudPhonePayload(
      {
        ...input,
        providerKey,
        ...resolvedProxy,
      },
      providerKey,
    )
    if (
      !payload.proxyHost.trim() ||
      payload.proxyPort <= 0 ||
      !payload.proxyUsername.trim() ||
      !payload.proxyPassword.trim()
    ) {
      return {
        success: false,
        message: 'Proxy configuration is incomplete.',
        checkedAt: new Date().toISOString(),
      }
    }
    const result = await performProxyConnectivityTest(
      {
        id: `${payload.providerKey}-cloud-proxy-test`,
        name: payload.name || payload.proxyHost,
        type: payload.proxyType,
        host: payload.proxyHost,
        port: payload.proxyPort,
        username: payload.proxyUsername,
        password: payload.proxyPassword,
        status: 'unknown',
        lastCheckedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        label: payload.name || payload.proxyHost,
        category: 'cloud-phone',
      },
    )
    logEvent(
      result.success ? 'info' : 'warn',
      'cloud-phone',
      `Tested cloud phone proxy for "${payload.name || payload.proxyHost}" via real proxy verification`,
      null,
    )
    return result
  })
  ipcMain.handle('cloudPhones.refreshStatuses', async () => refreshCloudPhoneStatuses())
  ipcMain.handle('cloudPhones.bulkStart', async (_event, payload: CloudPhoneBulkActionPayload) => {
    ensureWritable('cloudPhones.bulkStart')
    for (const cloudPhoneId of payload.cloudPhoneIds) {
      await startCloudPhone(cloudPhoneId)
    }
    await syncConfigToControlPlaneOrThrow()
  })
  ipcMain.handle('cloudPhones.bulkStop', async (_event, payload: CloudPhoneBulkActionPayload) => {
    ensureWritable('cloudPhones.bulkStop')
    for (const cloudPhoneId of payload.cloudPhoneIds) {
      await stopCloudPhone(cloudPhoneId)
    }
    await syncConfigToControlPlaneOrThrow()
  })
  ipcMain.handle('cloudPhones.bulkDelete', async (_event, payload: CloudPhoneBulkActionPayload) => {
    ensureWritable('cloudPhones.bulkDelete')
    for (const cloudPhoneId of payload.cloudPhoneIds) {
      const record = requireDatabase().getCloudPhoneById(cloudPhoneId)
      if (record) {
        const provider = resolveCloudPhoneProvider(record)
        await provider.deleteEnvironment(record, getSettings())
      }
    }
    requireDatabase().bulkDeleteCloudPhones(payload.cloudPhoneIds)
    await syncConfigToControlPlaneOrThrow()
    logEvent('warn', 'cloud-phone', `Deleted ${payload.cloudPhoneIds.length} cloud phones`, null)
  })
  ipcMain.handle('cloudPhones.bulkAssignGroup', async (_event, payload: CloudPhoneBulkActionPayload) => {
    ensureWritable('cloudPhones.bulkAssignGroup')
    requireDatabase().bulkAssignCloudPhoneGroup(payload.cloudPhoneIds, payload.groupName ?? '')
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'cloud-phone', `Updated group for ${payload.cloudPhoneIds.length} cloud phones`, null)
  })

  ipcMain.handle('profiles.list', async () => requireDatabase().listProfiles())
  ipcMain.handle('profiles.create', async (_event, input: CreateProfileInput) => {
    ensureWritable('profiles.create')
    const payload = await applyResolvedNetworkProfileToPayload(
      createProfilePayload(input, createDefaultFingerprint),
      requireDatabase(),
    )
    let profile: ProfileRecord
    if (getDesktopAuthState().authenticated) {
      const remotePayload = await requestControlPlane('/api/profiles', {
        method: 'POST',
        body: JSON.stringify(mapLocalProfileToRemotePayload(payload)),
      })
      profile = syncRemoteProfileIntoLocal((remotePayload.profile || {}) as ControlPlaneProfile)
    } else {
      profile = requireDatabase().createProfile(payload)
    }
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'profile', `Created profile "${profile.name}"`, profile.id)
    return profile
  })
  ipcMain.handle('profiles.update', async (_event, input: UpdateProfileInput) => {
    ensureWritable('profiles.update')
    const payload = await applyResolvedNetworkProfileToPayload(
      createProfilePayload(input, createDefaultFingerprint),
      requireDatabase(),
    )
    let profile: ProfileRecord
    if (getDesktopAuthState().authenticated) {
      try {
        const remotePayload = await requestControlPlane(`/api/profiles/${encodeURIComponent(payload.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(mapLocalProfileToRemotePayload(payload)),
        })
        profile = syncRemoteProfileIntoLocal((remotePayload.profile || {}) as ControlPlaneProfile)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/profile not found/i.test(message)) {
          const remotePayload = await requestControlPlane('/api/profiles', {
            method: 'POST',
            body: JSON.stringify(mapLocalProfileToRemotePayload(payload)),
          })
          if (payload.id !== String((remotePayload.profile as ControlPlaneProfile | undefined)?.id || payload.id)) {
            requireDatabase().deleteProfile(payload.id)
          }
          profile = syncRemoteProfileIntoLocal((remotePayload.profile || {}) as ControlPlaneProfile)
        } else {
          throw error
        }
      }
    } else {
      profile = requireDatabase().updateProfile(payload)
    }
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'profile', `Updated profile "${profile.name}"`, profile.id)
    return profile
  })
  ipcMain.handle('profiles.delete', async (_event, profileId: string) => {
    ensureWritable('profiles.delete')
    await stopRuntime(profileId)
    if (getDesktopAuthState().authenticated) {
      try {
        await requestControlPlane(`/api/profiles/${encodeURIComponent(profileId)}`, {
          method: 'DELETE',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!/profile not found/i.test(message)) {
          throw error
        }
      }
    }
    requireDatabase().deleteProfile(profileId)
    await syncConfigToControlPlaneOrThrow()
    logEvent('warn', 'profile', `Deleted profile ${profileId}`, profileId)
  })
  ipcMain.handle('profiles.clone', async (_event, profileId: string) => {
    ensureWritable('profiles.clone')
    const profile = requireDatabase().cloneProfile(profileId)
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'profile', `Cloned profile "${profile.name}"`, profile.id)
    return profile
  })
  ipcMain.handle('profiles.revealDirectory', async (_event, profileId: string) => {
    const profilePath = getProfilePath(app, profileId)
    await shell.openPath(profilePath)
  })
  ipcMain.handle('profiles.getDirectoryInfo', async () => {
    const info = getProfileDirectoryInfo(app)
    return {
      ...info,
      chromiumExecutable: resolveChromiumExecutable(),
    }
  })
  ipcMain.handle('profiles.bulkStart', async (_event, payload: ProfileBulkActionPayload) => {
    ensureWritable('profiles.bulkStart')
    await launchMany(payload.profileIds)
  })
  ipcMain.handle('profiles.bulkStop', async (_event, payload: ProfileBulkActionPayload) => {
    ensureWritable('profiles.bulkStop')
    await stopMany(payload.profileIds)
  })
  ipcMain.handle('profiles.bulkDelete', async (_event, payload: ProfileBulkActionPayload) => {
    ensureWritable('profiles.bulkDelete')
    await stopMany(payload.profileIds)
    requireDatabase().bulkDeleteProfiles(payload.profileIds)
    await syncConfigToControlPlaneOrThrow()
    logEvent('warn', 'profile', `Deleted ${payload.profileIds.length} profiles`, null)
  })
  ipcMain.handle('profiles.bulkAssignGroup', async (_event, payload: ProfileBulkActionPayload) => {
    ensureWritable('profiles.bulkAssignGroup')
    requireDatabase().bulkAssignGroup(payload.profileIds, payload.groupName ?? '')
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'profile', `Updated group for ${payload.profileIds.length} profiles`, null)
  })

  ipcMain.handle('templates.list', async () => requireDatabase().listTemplates())
  ipcMain.handle('templates.create', async (_event, input: CreateTemplateInput) => {
    ensureWritable('templates.create')
    const template = requireDatabase().createTemplate(
      createTemplatePayload(input, createDefaultFingerprint),
    )
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'profile', `Created template "${template.name}"`, null)
    return template
  })
  ipcMain.handle('templates.update', async (_event, input: UpdateTemplateInput) => {
    ensureWritable('templates.update')
    const template = requireDatabase().updateTemplate(
      createTemplatePayload(input, createDefaultFingerprint),
    )
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'profile', `Updated template "${template.name}"`, null)
    return template
  })
  ipcMain.handle('templates.delete', async (_event, templateId: string) => {
    ensureWritable('templates.delete')
    requireDatabase().deleteTemplate(templateId)
    await syncConfigToControlPlaneOrThrow()
    logEvent('warn', 'profile', `Deleted template ${templateId}`, null)
  })
  ipcMain.handle('templates.createFromProfile', async (_event, profileId: string) => {
    ensureWritable('templates.createFromProfile')
    const template = requireDatabase().createTemplateFromProfile(profileId)
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'profile', `Created template from profile "${template.name}"`, null)
    return template
  })

  ipcMain.handle('proxies.list', async () => requireDatabase().listProxies())
  ipcMain.handle('proxies.create', async (_event, input: CreateProxyInput) => {
    ensureWritable('proxies.create')
    const payload = createProxyPayload(input)
    const proxy = requireDatabase().createProxy(payload)
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'proxy', `Created proxy "${proxy.name}"`, null)
    return proxy
  })
  ipcMain.handle('proxies.update', async (_event, input: UpdateProxyInput) => {
    ensureWritable('proxies.update')
    const payload = createProxyPayload(input)
    const proxy = requireDatabase().updateProxy(payload)
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'proxy', `Updated proxy "${proxy.name}"`, null)
    return proxy
  })
  ipcMain.handle('proxies.delete', async (_event, proxyId: string) => {
    ensureWritable('proxies.delete')
    requireDatabase().deleteProxy(proxyId)
    await syncConfigToControlPlaneOrThrow()
    logEvent('warn', 'proxy', `Deleted proxy ${proxyId}`, null)
  })
  ipcMain.handle('proxies.test', async (_event, proxyId: string) => {
    ensureWritable('proxies.test')
    return testProxyById(proxyId)
  })

  ipcMain.handle('runtime.launch', async (_event, profileId: string) => {
    ensureWritable('runtime.launch')
    try {
      await enqueueLaunch(profileId)
    } catch (error) {
      await updateProfileStatus(profileId, 'error')
      logEvent(
        'error',
        'runtime',
        error instanceof Error ? error.message : 'Unknown runtime error',
        profileId,
      )
      throw error
    }
  })
  ipcMain.handle('runtime.stop', async (_event, profileId: string) => {
    ensureWritable('runtime.stop')
    await stopRuntime(profileId)
    await updateProfileStatus(profileId, 'stopped')
  })
  ipcMain.handle('runtime.getStatus', async () => ({
    runningProfileIds: [...runtimeContexts.keys()],
    queuedProfileIds: scheduler.getQueuedIds(),
    startingProfileIds: scheduler.getStartingIds(),
    launchStages: Object.fromEntries(
      requireDatabase()
        .listProfiles()
        .map((profile) => [profile.id, profile.fingerprintConfig.runtimeMetadata.launchValidationStage]),
    ),
    retryCounts: scheduler.getRetryCounts(),
  }))
  ipcMain.handle('runtime.getHostInfo', async () => getRuntimeHostInfo())

  ipcMain.handle('logs.list', async () => requireDatabase().listLogs())
  ipcMain.handle('logs.clear', async () => requireDatabase().clearLogs())

  ipcMain.handle('settings.get', async () => requireDatabase().getSettings())
  ipcMain.handle('settings.set', async (_event, payload: SettingsPayload) => {
    ensureWritable('settings.set')
    const data = requireDatabase().setSettings(payload)
    await syncConfigToControlPlaneOrThrow()
    logEvent('info', 'system', 'Updated application settings', null)
    return data
  })
  ipcMain.handle('data.previewBundle', async () => requireDatabase().exportBundle())
  ipcMain.handle('data.exportBundle', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const selected = win
      ? await dialog.showSaveDialog(win, {
          title: 'Export configuration bundle',
          defaultPath: `browser-studio-export-${Date.now()}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
      : await dialog.showSaveDialog({
          title: 'Export configuration bundle',
          defaultPath: `browser-studio-export-${Date.now()}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
    if (selected.canceled || !selected.filePath) {
      return null
    }
    const bundle = requireDatabase().exportBundle()
    await writeFile(selected.filePath, JSON.stringify(bundle, null, 2), 'utf8')
    logEvent('info', 'system', 'Exported local configuration bundle', null)
    return selected.filePath
  })
  ipcMain.handle('data.importBundle', async () => {
    ensureWritable('data.importBundle')
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const selected = win
      ? await dialog.showOpenDialog(win, {
          title: 'Import configuration bundle',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
      : await dialog.showOpenDialog({
          title: 'Import configuration bundle',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
    if (selected.canceled || selected.filePaths.length === 0) {
      return null
    }
    const content = await readFile(selected.filePaths[0], 'utf8')
    const bundle = parseBundle(content)
    const result = requireDatabase().importBundle(bundle)
    logEvent('info', 'system', 'Imported local configuration bundle', null)
    return result
  })
}

function initAgentService() {
  const apiBase = String(process.env.DUOKAI_AGENT_API_BASE || '').trim()
  const agentId = String(process.env.DUOKAI_AGENT_ID || '').trim()
  const registrationCode = String(process.env.DUOKAI_AGENT_REGISTRATION_CODE || '').trim()

  agentService = new AgentService({
    apiBase,
    agentId,
    registrationCode,
    agentVersion: app.getVersion(),
    capabilities: CAPABILITIES,
    getHostInfo: () => getRuntimeHostInfo(),
    getRuntimeStatus: () => getAgentRuntimeState(),
    onStateChange: (state) => {
      if (state.lastError) {
        logEvent('warn', 'system', `Agent channel warning: ${state.lastError}`, null)
      }
    },
    executeTask: async (task) => {
      const payload = (task.payload || {}) as Record<string, unknown>

      if (task.type === 'PROFILE_START') {
        const profileId = String(payload.profileId || '').trim()
        if (!profileId) {
          return { status: 'FAILED', errorCode: 'INVALID_PAYLOAD', errorMessage: 'profileId is required' }
        }
        await enqueueLaunch(profileId)
        return { status: 'SUCCEEDED' }
      }

      if (task.type === 'PROFILE_STOP') {
        const profileId = String(payload.profileId || '').trim()
        if (!profileId) {
          return { status: 'FAILED', errorCode: 'INVALID_PAYLOAD', errorMessage: 'profileId is required' }
        }
        await stopRuntime(profileId)
        await updateProfileStatus(profileId, 'stopped')
        return { status: 'SUCCEEDED' }
      }

      if (task.type === 'PROXY_TEST') {
        const proxyId = String(payload.proxyId || '').trim()
        if (!proxyId) {
          return { status: 'FAILED', errorCode: 'INVALID_PAYLOAD', errorMessage: 'proxyId is required' }
        }
        const result = await testProxyById(proxyId)
        return result.success
          ? { status: 'SUCCEEDED', outputRef: result.checkedAt }
          : { status: 'FAILED', errorCode: 'PROXY_TEST_FAILED', errorMessage: result.message }
      }

      if (task.type === 'SETTINGS_SYNC') {
        const action = String(payload.action || '').trim().toLowerCase()
        if (action === 'pull_snapshot') {
          await syncConfigFromControlPlane()
          return { status: 'SUCCEEDED' }
        }
        if (action === 'push_snapshot' || action === 'push_snapshot_replace') {
          await syncConfigToControlPlaneOrThrow('replace')
          return { status: 'SUCCEEDED' }
        }
        if (action === 'push_snapshot_merge') {
          await syncConfigToControlPlaneOrThrow('merge')
          return { status: 'SUCCEEDED' }
        }
        const settings = (payload.settings || {}) as SettingsPayload
        requireDatabase().setSettings(settings)
        await syncConfigToControlPlaneOrThrow('merge')
        return { status: 'SUCCEEDED' }
      }

      if (task.type === 'TEMPLATE_APPLY') {
        const profileId = String(payload.profileId || '').trim()
        const templateId = String(payload.templateId || '').trim()
        if (!profileId || !templateId) {
          return {
            status: 'FAILED',
            errorCode: 'INVALID_PAYLOAD',
            errorMessage: 'profileId and templateId are required',
          }
        }
        const template = requireDatabase().listTemplates().find((item) => item.id === templateId)
        const profile = requireDatabase().listProfiles().find((item) => item.id === profileId)
        if (!template || !profile) {
          return { status: 'FAILED', errorCode: 'NOT_FOUND', errorMessage: 'profile or template not found' }
        }
        requireDatabase().updateProfile({
          id: profile.id,
          name: profile.name,
          proxyId: template.proxyId,
          groupName: template.groupName,
          tags: template.tags,
          notes: template.notes,
          fingerprintConfig: template.fingerprintConfig,
        })
        return { status: 'SUCCEEDED' }
      }

      if (task.type === 'LOG_FLUSH') {
        return { status: 'SUCCEEDED' }
      }

      return { status: 'FAILED', errorCode: 'UNSUPPORTED_TASK', errorMessage: `Unsupported task: ${task.type}` }
    },
  })

  agentService.start()
}

async function bootstrap(): Promise<void> {
  await app.whenReady()
  syncTheme()
  db = new DatabaseService(app)
  await registerIpcHandlers()
  initAgentService()
  try {
    await syncConfigFromControlPlane()
  } catch (error) {
    logEvent('warn', 'system', `Initial config sync failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  await createMainWindow()
  logEvent('info', 'system', isDev ? 'Development session started' : 'Application started')
  logEvent(
    'info',
    'system',
    `Runtime info: mode=${isDev ? 'development' : 'production'} preload=${PRELOAD_VERSION} capabilities=${CAPABILITIES.length}`,
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow()
    }
  })

  app.on('before-quit', (event) => {
    if (beforeQuitHandled) {
      return
    }
    beforeQuitHandled = true
    event.preventDefault()
    void (async () => {
      try {
        audit('app_before_quit_begin')
        await saveAllElectronSessions()
      } finally {
        audit('app_before_quit_end')
        setTimeout(() => app.exit(0), 300)
      }
    })()
  })
}

app.on('window-all-closed', async () => {
  if (agentService) {
    await agentService.stop()
  }
  for (const profileId of [...runtimeContexts.keys()]) {
    await stopRuntime(profileId)
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

void bootstrap()
