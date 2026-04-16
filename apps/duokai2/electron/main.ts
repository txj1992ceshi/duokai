import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
} from 'electron'
import type { MenuItemConstructorOptions, TitleBarOverlay } from 'electron'
import { chromium } from 'playwright'
import type { BrowserContext } from 'playwright'
import electronUpdater from 'electron-updater'
import type { ProgressInfo, UpdateDownloadedEvent, UpdateInfo } from 'electron-updater'
import { DatabaseService } from './services/database'
import {
  createDeviceProfileFromFingerprint,
  DEFAULT_ENVIRONMENT_PURPOSE,
} from './services/deviceProfile'
import {
  createPortableWorkspaceDescriptor,
  createCloudPhonePayload,
  createDefaultFingerprint,
  createProfilePayload,
  createProxyPayload,
  createTemplatePayload,
  syncFingerprintConfigWithWorkspaceEnvironment,
} from './services/factories'
import {
  CloudPhoneProviderRegistry,
  LocalEmulatorCloudPhoneProvider,
  MockCloudPhoneProvider,
  SelfHostedCloudPhoneProvider,
  ThirdPartyCloudPhoneProvider,
} from './services/cloudPhones'
import {
  ensureWorkspaceLayoutForProfile,
  ensureProfileDirectory,
  getProfileDirectoryInfo,
  getProfilePath,
  normalizeWorkspacePathsForProfile,
} from './services/paths'
import {
  applyProxyCompatibilityArgs,
  buildChromiumLaunchEnv,
  buildProxyServer,
  resolveChromiumExecutable,
} from './services/runtime'
import { resolveWorkspaceLaunchConfig } from './services/workspaceRuntime'
import { runLocalIsolationPreflight } from './services/localIsolation'
import {
  applyLastKnownGoodAssessment,
  createWorkspaceSnapshot,
  evaluateLastKnownGoodSnapshot,
  getWorkspaceSnapshotById,
  doesWorkspaceSnapshotMatchProfile,
  listWorkspaceSnapshots,
  restoreWorkspaceSnapshot as restoreWorkspaceSnapshotRecord,
  rollbackWorkspaceToLastKnownGood as rollbackWorkspaceToLastKnownGoodRecord,
  updateWorkspaceSnapshotValidation,
} from './services/workspaceSnapshots'
import {
  buildExportBundleV2,
  importWorkspaceSnapshotsFromBundle,
} from './services/importExport'
import { buildFingerprintInitScript } from './services/fingerprint'
import { applyNetworkDerivedFingerprint } from './services/networkProfileResolver'
import { resolveLaunchProxy } from './services/proxyBridge'
import { RuntimeScheduler } from './services/runtimeScheduler'
import { AgentNetworkError, AgentService } from './services/agentService'
import {
  classifyRecoverableGlobalNetworkError,
  isRecoverableNetworkFailure,
  type RecoverableGlobalNetworkErrorClassification,
} from './services/networkErrorRecovery'
import { evaluateTrustedSnapshotReuse } from './services/trustedLaunch'
import {
  assignStableHardwareFingerprint,
  sanitizeTemplateHardwareFingerprint,
  shouldMigrateStableHardwareFingerprint,
} from '../src/shared/hardwareProfiles'
import {
  assessRegistrationRisk,
  validateProfileReadiness,
  validateWorkspaceGate,
} from './services/profileValidator'
import { ContainerManager } from './services/containerManager'
import {
  isRuntimeHostSupported,
  resolveRequestedRuntimeKind,
} from './services/runtimeIsolation'
import { checkNetworkHealth, type NetworkHealthResult } from './services/networkCheck'
import { buildNetworkDiagnosticsSummary } from './services/networkDiagnostics'
import {
  ensureLocalRuntimeRunning,
  getLocalRuntimeInfo,
} from './services/localRuntimeLauncher'
import { checkStandaloneProxyEgress } from './services/proxyCheck'
import type {
  AuthUser,
  CloudPhoneBulkActionPayload,
  CloudPhoneRecord,
  ConfigSyncResult,
  ControlPlaneStatus,
  CreateCloudPhoneInput,
  CreateProfileInput,
  CreateProxyInput,
  CreateTemplateInput,
  DesktopRuntimeInfo,
  DesktopAuthState,
  DesktopWindowFrameMetrics,
  ExportBundle,
  FingerprintConfig,
  GlobalConfigSnapshot,
  LogLevel,
  ProfileBulkActionPayload,
  ProfileRecord,
  ProxyRecord,
  RemoteConfigSnapshot,
  RuntimeHostInfo,
  SettingsPayload,
  StorageStateSyncResult,
  StorageStateSyncStatus,
  PendingSyncKind,
  StartupNavigationReasonCode,
  StartupNavigationResult,
  DesktopUpdateState,
  TrustedIsolationCheck,
  TrustedLaunchSnapshot,
  UpdateCloudPhoneInput,
  UpdateTemplateInput,
  UpdateProfileInput,
  UpdateProxyInput,
  WorkspaceSnapshotRecord,
} from '../src/shared/types'

const { autoUpdater } = electronUpdater

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_TIMEZONE_FALLBACK = 'America/Los_Angeles'
const DEFAULT_CONCURRENT_STARTS = 2
const DEFAULT_ACTIVE_LIMIT = 6
const DEFAULT_LAUNCH_RETRIES = 2
const DEFAULT_REGISTER_IP_COOLDOWN_HOURS = 24
const DEFAULT_REGISTER_IP_MAX_PROFILES = 1
const DEFAULT_LINKEDIN_REGISTER_IP_COOLDOWN_HOURS = 72
const DEFAULT_LINKEDIN_REGISTER_IP_MAX_PROFILES = 1
const DEFAULT_TIKTOK_REGISTER_IP_COOLDOWN_HOURS = 24
const DEFAULT_TIKTOK_REGISTER_IP_MAX_PROFILES = 1
const DEFAULT_NURTURE_MINIMUM_HOURS_AFTER_REGISTER = 24
const DEFAULT_OPERATION_MINIMUM_HOURS_AFTER_NURTURE = 72
const GOOGLE_PROXY_BYPASS_LIST = [
  '*.google.com',
  '*.google.com.*',
  '*.gstatic.com',
  '*.googleusercontent.com',
  '*.googleapis.com',
  '*.ggpht.com',
].join(';')
const DEFAULT_CONTROL_PLANE_API_BASE = (
  String(process.env.DUOKAI_API_BASE || '').trim() || 'http://duokai.duckdns.org'
).replace(/\/$/, '')
const TRUSTED_SNAPSHOT_VERSION = 1
const PROFILE_RUNTIME_LOCK_HEARTBEAT_MS = 30 * 1000
const PROFILE_RUNTIME_LOCK_STALE_MS = 2 * 60 * 1000
const CONTROL_PLANE_API_BASE_KEY = 'controlPlaneApiBase'
const CONTROL_PLANE_DEVICE_ID_KEY = 'controlPlaneDeviceId'
const CONTROL_PLANE_AUTH_TOKEN_KEY = 'controlPlaneAuthToken'
const CONTROL_PLANE_AUTH_USER_KEY = 'controlPlaneAuthUser'
const CONTROL_PLANE_AUTH_REMEMBER_KEY = 'controlPlaneAuthRemember'
const CONTROL_PLANE_REMEMBER_CREDENTIALS_KEY = 'controlPlaneRememberCredentials'
const CONTROL_PLANE_AUTH_IDENTIFIER_KEY = 'controlPlaneAuthIdentifier'
const CONTROL_PLANE_AUTH_PASSWORD_KEY = 'controlPlaneAuthPassword'
const CONTROL_PLANE_SYNC_QUEUE_FILE = 'control-plane-sync-queue.json'
const CONTROL_PLANE_SYNC_RETRY_BASE_MS = 5_000
const CONTROL_PLANE_SYNC_RETRY_MAX_MS = 60_000
const CONTROL_PLANE_SYNC_POLL_INTERVAL_MS = 30_000
const CONTROL_PLANE_OFFLINE_FAILURE_THRESHOLD = 3
const GLOBAL_NETWORK_RECOVERY_MERGE_WINDOW_MS = 8_000
const GLOBAL_NETWORK_RECOVERY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 60_000] as const

type ControlPlaneRequestError = Error & {
  name: 'ControlPlaneRequestError'
  recoverable: boolean
  code: string
  status?: number
  method: string
  input: string
  responseBody?: string
}

type ControlPlaneSyncTask = {
  id: string
  kind: PendingSyncKind
  dedupeKey: string
  profileId: string
  method: string
  pathName: string
  body: string
  createdAt: string
  updatedAt: string
  lastTriedAt: string
  retryCount: number
  lastError: string
}

type ControlPlaneConnectivityState = {
  status: ControlPlaneStatus
  lastError: string
  lastErrorAt: string
  lastSuccessAt: string
  consecutiveFailures: number
}

type GlobalRecoverySource = 'uncaughtException' | 'unhandledRejection' | 'recoveryTimer'

type GlobalNetworkRecoveryState = {
  lastSignature: string
  lastSeenAt: string
  consecutiveFailures: number
  nextRetryDelayMs: number
  nextRetryAt: string
  recoveryState: NonNullable<RuntimeHostInfo['controlPlaneRecoveryState']>
  timer: NodeJS.Timeout | null
}
const SMOKE_TEST_ENABLED = process.env.SMOKE_TEST === '1'
const SMOKE_RESULT_FILE = 'smoke-result.json'
const SMOKE_AUDIT_FILE = 'runtime-audit.log'
const STARTUP_TRACE_FILE = path.join(os.tmpdir(), 'duokai2-startup.log')

let mainWindow: BrowserWindow | null = null
let db: DatabaseService | null = null
let agentService: AgentService | null = null
type ConfigSyncOptions = {
  force?: boolean
  useLocalCacheOnError?: boolean
}

type ConfigPushOptions = {
  onConflict?: 'pull-and-throw' | 'preserve-local-and-throw'
}

let lastEnvironmentSyncResult: ConfigSyncResult | null = null
let lastGlobalConfigSyncResult: ConfigSyncResult | null = null
let lastUserConfigSyncVersion = 0
let localConfigMutationVersion = 0
let sessionAuthApiBase = ''
let sessionAuthToken = ''
let sessionAuthUser: AuthUser | null = null

const runtimeContexts = new Map<string, BrowserContext>()
const runtimeLockHeartbeatTimers = new Map<string, NodeJS.Timeout>()
const runtimeShutdownFinalizing = new Set<string>()
const MAX_QUEUE = Number(process.env.MAX_QUEUE_LENGTH || 200)
const CONTROL_PLANE_FETCH_RETRY_MS = 1200
const DESKTOP_RELEASES_PAGE = 'https://github.com/txj1992ceshi/duokai/releases'
const AUTO_UPDATE_CHECK_DELAY_MS = 12_000
const UPDATE_CHECK_MIN_INTERVAL_MS = 30 * 60 * 1000

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

type RuntimeLockRecord = {
  profileId: string
  ownerPid: number
  ownerDeviceId: string
  status: 'starting' | 'running' | 'stopped'
  createdAt: string
  updatedAt: string
}

type StorageStateDownloadReason = 'startup' | 'manual'

async function syncStorageStateStatusToCanonicalProfile(
  profileId: string,
  payload: {
    status: StorageStateSyncStatus
    message: string
    updatedAt: string
    version?: number
    deviceId?: string
  },
): Promise<void> {
  if (!getDesktopAuthState().authenticated) {
    return
  }
  try {
    await requestControlPlane(`/api/config/profiles/${encodeURIComponent(profileId)}/storage-state-status`, {
      method: 'POST',
      body: JSON.stringify({
        status: payload.status,
        message: payload.message,
        updatedAt: payload.updatedAt,
        ...(payload.version !== undefined ? { version: payload.version } : {}),
        ...(payload.deviceId ? { deviceId: payload.deviceId } : {}),
      }),
    })
  } catch (error) {
    enqueueRecoverableControlPlaneSyncTask(
      {
        kind: 'storage-state-status',
        dedupeKey: `storage-state-status:${profileId}`,
        profileId,
        method: 'POST',
        pathName: `/api/config/profiles/${encodeURIComponent(profileId)}/storage-state-status`,
        body: JSON.stringify({
          status: payload.status,
          message: payload.message,
          updatedAt: payload.updatedAt,
          ...(payload.version !== undefined ? { version: payload.version } : {}),
          ...(payload.deviceId ? { deviceId: payload.deviceId } : {}),
        }),
      },
      error,
    )
    audit('storage_state_status_sync_failed', {
      profileId,
      status: payload.status,
      updatedAt: payload.updatedAt,
      err: error instanceof Error ? error.message : String(error),
    })
  }
}

function resolveAuditLogPath(): string {
  try {
    return path.join(app.getPath('userData'), process.env.RUNTIME_AUDIT_FILE || 'runtime-audit.log')
  } catch {
    return path.join(process.cwd(), process.env.RUNTIME_AUDIT_FILE || 'runtime-audit.log')
  }
}

function traceStartup(step: string, payload: Record<string, unknown> = {}): void {
  try {
    appendFileSync(
      STARTUP_TRACE_FILE,
      `${JSON.stringify({
        at: new Date().toISOString(),
        pid: process.pid,
        step,
        ...payload,
      })}\n`,
    )
  } catch {
    // Best-effort diagnostics only.
  }
}

function resolveSmokeOutputDir(): string {
  const configured = String(process.env.SMOKE_OUTPUT_DIR || '').trim()
  if (configured) {
    return configured
  }
  try {
    return path.join(app.getPath('userData'), 'smoke')
  } catch {
    return path.join(process.cwd(), 'smoke')
  }
}

function getAgentRuntimeState() {
  const profiles = requireDatabase().listProfiles()
  const launchStages = Object.fromEntries(
    profiles.map((profile) => [profile.id, profile.fingerprintConfig.runtimeMetadata.launchValidationStage]),
  )
  const profileIsolationSummaries = profiles.map((profile) => ({
    profileId: profile.id,
    name: profile.name,
    trustedSnapshotStatus: profile.workspace?.trustSummary?.trustedSnapshotStatus || 'unknown',
    lastQuickIsolationCheckSuccess:
      profile.workspace?.trustSummary?.lastQuickIsolationCheckSuccess ??
      profile.fingerprintConfig.runtimeMetadata.lastQuickIsolationCheck?.success ??
      null,
    lastQuickIsolationCheckAt:
      profile.workspace?.trustSummary?.lastQuickIsolationCheckAt ||
      profile.fingerprintConfig.runtimeMetadata.lastQuickIsolationCheck?.checkedAt ||
      '',
    activeRuntimeLockState: profile.workspace?.trustSummary?.activeRuntimeLock.state || 'unlocked',
    workspaceHealthStatus: profile.workspace?.healthSummary.status || 'unknown',
    workspaceConsistencyStatus: profile.workspace?.consistencySummary.status || 'unknown',
    lastValidationLevel: profile.fingerprintConfig.runtimeMetadata.lastValidationLevel || 'unknown',
    lastValidationMessage:
      profile.fingerprintConfig.runtimeMetadata.lastValidationMessages?.[0] || '',
  }))
  const hostInfo = getRuntimeHostInfo()
  const lockSummary = summarizeRuntimeLockStates()
  return {
    runningProfileIds: [...runtimeContexts.keys()],
    queuedProfileIds: scheduler.getQueuedIds(),
    startingProfileIds: scheduler.getStartingIds(),
    launchStages,
    retryCounts: scheduler.getRetryCounts(),
    supportedRuntimeModes: hostInfo.supportedRuntimeModes || [],
    effectiveRuntimeMode: hostInfo.effectiveRuntimeMode || 'local',
    runtimeHostKind: hostInfo.kind,
    degraded: Boolean(hostInfo.degraded),
    degradeReason: hostInfo.degradeReason || '',
    activeRuntimeHosts: runtimeHostManager.listEnvironments().length,
    profileCount: profiles.length,
    lockedProfileIds: lockSummary.lockedProfileIds,
    staleLockProfileIds: lockSummary.staleLockProfileIds,
    profileIsolationSummaries,
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
      lastErrorCode: '',
      lastErrorKind: 'unknown' as const,
      lastRecoverableFailureSource: 'unknown' as const,
      lastRecoverableFailureAt: null,
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

function isRecoverableAgentNetworkError(error: unknown): error is AgentNetworkError {
  return error instanceof AgentNetworkError
}

function getGlobalNetworkRecoveryDelay(consecutiveFailures: number): number {
  const normalizedFailures = Math.max(1, consecutiveFailures)
  return GLOBAL_NETWORK_RECOVERY_DELAYS_MS[Math.min(normalizedFailures - 1, GLOBAL_NETWORK_RECOVERY_DELAYS_MS.length - 1)]
}

function resetGlobalNetworkRecoveryState(): void {
  if (globalNetworkRecoveryState.timer) {
    clearTimeout(globalNetworkRecoveryState.timer)
  }
  globalNetworkRecoveryState = {
    lastSignature: '',
    lastSeenAt: '',
    consecutiveFailures: 0,
    nextRetryDelayMs: 0,
    nextRetryAt: '',
    recoveryState: 'idle',
    timer: null,
  }
  if (controlPlaneRecoveryState !== 'idle' || controlPlaneNextRetryAt) {
    controlPlaneRecoveryState = 'idle'
    controlPlaneNextRetryAt = ''
    emitConfigChanged()
  }
}

function buildGlobalErrorDiagnostics(
  error: unknown,
  classification: RecoverableGlobalNetworkErrorClassification,
): Record<string, unknown> {
  return {
    name: classification.name,
    message: classification.message || String(error),
    code: classification.code,
    causeCode: classification.causeCode,
    stack: classification.stack,
    isRecoverableGlobalNetworkError: classification.recoverable,
    globalNetworkMatchedBy: classification.matchedBy,
    globalNetworkFatalDomainDeniedBy: classification.fatalDomainDeniedBy,
    globalNetworkStackHint: classification.stackHint,
    globalNetworkSignature: classification.signature,
    isRecoverableControlPlaneError: isRecoverableControlPlaneError(error),
    isRecoverableAgentNetworkError: isRecoverableAgentNetworkError(error),
  }
}

function ensureControlPlaneConfigWritable(action: string): void {
  if (!getDesktopAuthState().authenticated) {
    return
  }
  if (controlPlaneConnectivityState.status === 'offline') {
    throw new Error(`Control plane offline, write blocked: ${action}`)
  }
}

function setLastConfigSyncResult(result: ConfigSyncResult | null): ConfigSyncResult | null {
  if (!result) {
    lastEnvironmentSyncResult = null
    lastGlobalConfigSyncResult = null
  } else if (result.scope === 'environment') {
    lastEnvironmentSyncResult = result
  } else {
    lastGlobalConfigSyncResult = result
  }
  emitConfigChanged()
  return result
}

function buildConfigSyncSuccessResult(
  source: ConfigSyncResult['source'],
  snapshot: GlobalConfigSnapshot,
): ConfigSyncResult {
  return {
    scope: 'global-config',
    count:
      (Array.isArray(snapshot.proxies) ? snapshot.proxies.length : 0) +
      (Array.isArray(snapshot.templates) ? snapshot.templates.length : 0) +
      (Array.isArray(snapshot.cloudPhones) ? snapshot.cloudPhones.length : 0),
    source,
    usedLocalCache: false,
    message: '已从云端更新全局配置数据',
    warningMessage: '',
  }
}

function buildConfigSyncFallbackResult(message: string): ConfigSyncResult {
  return {
    scope: 'global-config',
    count:
      requireDatabase().listTemplates().length +
      requireDatabase().listProxies().length +
      requireDatabase().listCloudPhones().length,
    source: 'account',
    usedLocalCache: true,
    message: '',
    warningMessage: `云端全局配置拉取失败，当前显示本地缓存：${message}`,
  }
}

function buildConfigSyncPendingResult(message = '本地全局配置已保存，等待同步到云端'): ConfigSyncResult {
  return {
    scope: 'global-config',
    count:
      requireDatabase().listTemplates().length +
      requireDatabase().listProxies().length +
      requireDatabase().listCloudPhones().length,
    source: agentService?.getState().enabled ? 'agent' : 'account',
    usedLocalCache: true,
    message: '',
    warningMessage: message,
  }
}

function buildConfigSyncInFlightResult(message = '正在同步本地全局配置到云端'): ConfigSyncResult {
  return {
    scope: 'global-config',
    count:
      requireDatabase().listTemplates().length +
      requireDatabase().listProxies().length +
      requireDatabase().listCloudPhones().length,
    source: agentService?.getState().enabled ? 'agent' : 'account',
    usedLocalCache: true,
    message: '',
    warningMessage: message,
  }
}

function buildConfigSyncPushSuccessResult(message = '本地全局配置已同步到云端'): ConfigSyncResult {
  return {
    scope: 'global-config',
    count:
      requireDatabase().listTemplates().length +
      requireDatabase().listProxies().length +
      requireDatabase().listCloudPhones().length,
    source: agentService?.getState().enabled ? 'agent' : 'account',
    usedLocalCache: false,
    message,
    warningMessage: '',
  }
}

function buildConfigSyncPushFailedResult(message: string): ConfigSyncResult {
  return {
    scope: 'global-config',
    count:
      requireDatabase().listTemplates().length +
      requireDatabase().listProxies().length +
      requireDatabase().listCloudPhones().length,
    source: agentService?.getState().enabled ? 'agent' : 'account',
    usedLocalCache: true,
    message: '',
    warningMessage: message,
  }
}

function buildEnvironmentSyncPendingResult(
  message = '本地环境镜像已保存，等待同步到云端',
): ConfigSyncResult {
  return {
    scope: 'environment',
    count: requireDatabase().listProfiles().length,
    source: agentService?.getState().enabled ? 'agent' : 'account',
    usedLocalCache: true,
    message: '',
    warningMessage: message,
    localMirroredProfileCount: requireDatabase().listProfiles().length,
  }
}

function buildEnvironmentSyncInFlightResult(
  message = '正在自动同步环境到云端',
): ConfigSyncResult {
  return {
    scope: 'environment',
    count: requireDatabase().listProfiles().length,
    source: agentService?.getState().enabled ? 'agent' : 'account',
    usedLocalCache: true,
    message: '',
    warningMessage: message,
    localMirroredProfileCount: requireDatabase().listProfiles().length,
  }
}

function buildEnvironmentSyncPushSuccessResult(message: string): ConfigSyncResult {
  return {
    scope: 'environment',
    count: requireDatabase().listProfiles().length,
    source: agentService?.getState().enabled ? 'agent' : 'account',
    usedLocalCache: false,
    message,
    warningMessage: '',
    localMirroredProfileCount: requireDatabase().listProfiles().length,
  }
}

function buildEnvironmentSyncPushFailedResult(message: string): ConfigSyncResult {
  return {
    scope: 'environment',
    count: requireDatabase().listProfiles().length,
    source: agentService?.getState().enabled ? 'agent' : 'account',
    usedLocalCache: true,
    message: '',
    warningMessage: message,
    localMirroredProfileCount: requireDatabase().listProfiles().length,
  }
}

function buildEnvironmentCountFields(
  patch: Partial<
    Pick<
      ConfigSyncResult,
      | 'cloudProfileCount'
      | 'localMirroredProfileCount'
      | 'autoUploadedCount'
      | 'autoPulledCount'
      | 'removedLocalMirrorCount'
      | 'remoteProfileCount'
      | 'localProfileCount'
      | 'localProfileCountAfterPull'
      | 'orphanProfileCount'
      | 'removedLocalOrphanCount'
      | 'deletedRemoteCount'
      | 'upsertedProfileCount'
      | 'updatedProfileCount'
    >
  >,
): Partial<ConfigSyncResult> {
  return patch
}

function markLocalConfigDirty(message?: string): number {
  localConfigMutationVersion += 1
  setLastConfigSyncResult(buildConfigSyncPendingResult(message))
  return localConfigMutationVersion
}

function hasConfigSnapshotData(snapshot: GlobalConfigSnapshot | null | undefined): boolean {
  if (!snapshot) {
    return false
  }
  return (
    (snapshot.proxies?.length || 0) > 0 ||
    (snapshot.templates?.length || 0) > 0 ||
    (snapshot.cloudPhones?.length || 0) > 0 ||
    Object.keys(snapshot.settings || {}).length > 0
  )
}

function hasLocalConfigData(): boolean {
  const database = requireDatabase()
  return hasConfigSnapshotData(database.exportGlobalConfigSnapshot(0))
}

function hasLocalSharedData(): boolean {
  return requireDatabase().listProfiles().length > 0
}

function applyRemoteConfigSnapshot(snapshot: GlobalConfigSnapshot): void {
  requireDatabase().applyGlobalConfigSnapshot(snapshot)
  emitConfigChanged()
}

async function pullConfigSnapshotFromAccount(): Promise<GlobalConfigSnapshot> {
  const payload = await requestControlPlane('/api/config/global')
  const snapshot = (payload.snapshot || null) as GlobalConfigSnapshot | null
  if (!snapshot) {
    return {
      syncVersion: 0,
      proxies: [],
      templates: [],
      cloudPhones: [],
      settings: {},
    }
  }
  return {
    syncVersion: Number(snapshot.syncVersion || 0),
    proxies: Array.isArray(snapshot.proxies) ? snapshot.proxies : [],
    templates: Array.isArray(snapshot.templates) ? snapshot.templates : [],
    cloudPhones: Array.isArray(snapshot.cloudPhones) ? snapshot.cloudPhones : [],
    settings: snapshot.settings && typeof snapshot.settings === 'object' ? snapshot.settings : {},
  }
}

async function pullEnvironmentSnapshotFromAccount(): Promise<RemoteConfigSnapshot> {
  const profilesPayload = await requestControlPlane('/api/config/profiles')
  const profiles = Array.isArray(profilesPayload.profiles)
    ? (profilesPayload.profiles as ProfileRecord[]).filter((profile) => Boolean(profile?.id))
    : []
  return {
    syncVersion: 0,
    profiles,
    proxies: [],
    templates: [],
    cloudPhones: [],
    settings: {},
  }
}

async function syncConfigFromControlPlane(options: ConfigSyncOptions = {}): Promise<ConfigSyncResult> {
  const useLocalCacheOnError = options.useLocalCacheOnError ?? false

  try {
    let snapshot: GlobalConfigSnapshot | null = null
    let source: ConfigSyncResult['source'] = 'account'

    if (agentService && agentService.getState().enabled) {
      snapshot = (await agentService.pullConfigSnapshot()) as RemoteConfigSnapshot | null
      source = 'agent'
    } else if (getDesktopAuthState().authenticated) {
      snapshot = await pullConfigSnapshotFromAccount()
      lastUserConfigSyncVersion = Number(snapshot.syncVersion || 0)
      source = 'account'
    }

    if (!snapshot) {
      const result = setLastConfigSyncResult({
        scope: 'global-config',
        count: requireDatabase().listTemplates().length +
          requireDatabase().listProxies().length +
          requireDatabase().listCloudPhones().length,
        source,
        usedLocalCache: false,
        message: '',
        warningMessage: '',
      })
      return result!
    }

    if (Number(snapshot.syncVersion || 0) === 0 && !hasConfigSnapshotData(snapshot) && hasLocalConfigData()) {
      audit('config_pull_bootstrap_skipped_local_first', {
        source,
        localProfileCount: requireDatabase().listProfiles().length,
        localProxyCount: requireDatabase().listProxies().length,
      })
      return setLastConfigSyncResult({
        scope: 'global-config',
        count:
          requireDatabase().listTemplates().length +
          requireDatabase().listProxies().length +
          requireDatabase().listCloudPhones().length,
        source,
        usedLocalCache: true,
        message: '',
        warningMessage: '云端暂无全局配置，已保留本地模板、代理和设置数据',
      })!
    }

    applyRemoteConfigSnapshot(snapshot)
    const result = setLastConfigSyncResult(buildConfigSyncSuccessResult(source, snapshot))
    audit('config_pull_succeeded', {
      source,
      profileCount: result?.count || 0,
      syncVersion: Number(snapshot.syncVersion || 0),
    })
    return result!
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    audit('config_pull_failed', {
      err: message,
      usedLocalCache: useLocalCacheOnError,
    })
    if (!useLocalCacheOnError) {
      throw error
    }
    logEvent('warn', 'system', `Config pull failed, using local cache: ${message}`, null)
    return setLastConfigSyncResult(buildConfigSyncFallbackResult(message))!
  }
}

async function syncConfigToControlPlaneOrThrow(
  mode: 'replace' | 'merge' = 'replace',
  options: ConfigPushOptions = {},
): Promise<void> {
  if (!agentService?.getState().enabled && !getDesktopAuthState().authenticated) {
    return
  }

  const syncVersion = agentService?.getState().enabled
    ? agentService.getSyncVersion()
    : lastUserConfigSyncVersion
  const snapshot = requireDatabase().exportGlobalConfigSnapshot(syncVersion)

  try {
    if (agentService?.getState().enabled) {
      await agentService.pushConfigSnapshot({
        profiles: [],
        proxies: snapshot.proxies,
        templates: snapshot.templates,
        cloudPhones: snapshot.cloudPhones,
        settings: snapshot.settings,
      }, { mode })
      return
    }

    const payload = await requestControlPlane('/api/config/global', {
      method: 'POST',
      body: JSON.stringify({
        syncVersion,
        proxies: snapshot.proxies,
        templates: snapshot.templates,
        cloudPhones: snapshot.cloudPhones,
        settings: snapshot.settings,
      }),
    })
    lastUserConfigSyncVersion = Number(payload.syncVersion || lastUserConfigSyncVersion)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/sync version mismatch/i.test(message)) {
      if ((options.onConflict ?? 'pull-and-throw') === 'pull-and-throw') {
        await syncConfigFromControlPlane()
        throw new Error('配置版本冲突，已拉取后台最新数据，请重试操作')
      }
      throw new Error('配置版本冲突，云端已存在更新，本地修改仍已保留，请稍后手动同步')
    }
    throw error
  }
}

async function pushEnvironmentProfilesToControlPlaneOrThrow(
  mode: EnvironmentMirrorSyncMode = 'manual-force-upload',
): Promise<{
  cloudProfileCount: number
  localMirroredProfileCount: number
  autoUploadedCount: number
  removedLocalMirrorCount: number
}> {
  const localSnapshot = requireDatabase().exportRemoteConfigSnapshot(0)

  if (agentService?.getState().enabled) {
    await agentService.pushConfigSnapshot({
      profiles: localSnapshot.profiles,
      proxies: [],
      templates: [],
      cloudPhones: [],
      settings: {},
    }, { mode: 'replace' })
    return {
      cloudProfileCount: localSnapshot.profiles.length,
      localMirroredProfileCount: localSnapshot.profiles.length,
      autoUploadedCount: localSnapshot.profiles.length,
      removedLocalMirrorCount: 0,
    }
  }

  if (!getDesktopAuthState().authenticated) {
    throw new Error('请先登录桌面端')
  }

  const remoteProfilesPayload = await requestControlPlane('/api/config/profiles')
  const remoteProfiles = Array.isArray(remoteProfilesPayload.profiles)
    ? (remoteProfilesPayload.profiles as ProfileRecord[]).filter((profile) => Boolean(profile?.id))
    : []
  const remoteProfileIds = new Set(remoteProfiles.map((profile) => String(profile.id)))
  const localProfiles = localSnapshot.profiles.map((profile) => ({
    ...profile,
    workspace: createPortableWorkspaceDescriptor(
      profile.workspace ?? null,
      profile.id,
      profile.fingerprintConfig,
    ),
  }))
  const localProfileIds = new Set(localProfiles.map((profile) => String(profile.id)))

  let deletedRemoteCount = 0
  for (const remoteProfileId of remoteProfileIds) {
    if (localProfileIds.has(remoteProfileId)) {
      continue
    }
    await requestControlPlane(`/api/config/profiles/${encodeURIComponent(remoteProfileId)}`, {
      method: 'DELETE',
    })
    deletedRemoteCount += 1
  }

  let autoUploadedCount = 0
  for (const profile of localProfiles) {
    const payload = await requestControlPlane(`/api/config/profiles/${encodeURIComponent(profile.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        baseVersion: profile.fingerprintConfig.runtimeMetadata.lastEnvironmentSyncVersion || 0,
        force: true,
        profile,
      }),
    })
    autoUploadedCount += 1
    const updatedProfile = requireDatabase().getProfileById(profile.id)
    if (updatedProfile) {
      updateRuntimeMetadata(updatedProfile, {
        lastEnvironmentSyncStatus: 'synced',
        lastEnvironmentSyncMessage:
          mode === 'auto-push' ? '环境共享配置已自动同步到云端' : '环境共享配置已同步到云端',
        lastEnvironmentSyncAt: new Date().toISOString(),
        lastEnvironmentSyncVersion: Number(payload.syncVersion || 0),
      })
    }
  }

  return {
    cloudProfileCount: localProfiles.length,
    localMirroredProfileCount: localProfiles.length,
    autoUploadedCount,
    removedLocalMirrorCount: deletedRemoteCount,
  }
}

function isRuntimeProtectedProfile(profile: ProfileRecord | null): boolean {
  if (!profile) {
    return false
  }
  return (
    profile.status === 'running' ||
    profile.status === 'starting' ||
    profile.status === 'queued' ||
    runtimeContexts.has(profile.id) ||
    isProfileLaunchInFlight(profile.id)
  )
}

async function reconcileEnvironmentMirrorFromSnapshot(
  snapshot: RemoteConfigSnapshot,
  mode: EnvironmentMirrorSyncMode,
): Promise<{
  cloudProfileCount: number
  localMirroredProfileCount: number
  autoPulledCount: number
  removedLocalMirrorCount: number
}> {
  const remoteProfiles = Array.isArray(snapshot.profiles) ? snapshot.profiles : []
  const remoteIds = new Set(remoteProfiles.map((profile) => String(profile.id || '')).filter(Boolean))
  let autoPulledCount = 0
  let removedLocalMirrorCount = 0

  for (const remoteProfile of remoteProfiles) {
    if (!remoteProfile?.id) {
      continue
    }
    const localProfile = requireDatabase().getProfileById(remoteProfile.id)
    if (mode === 'auto-full-reconcile' && isRuntimeProtectedProfile(localProfile)) {
      updateEnvironmentSyncMetadata(remoteProfile.id, {
        status: 'recovery',
        message: '检测到云端环境配置更新，但当前环境正在运行或启动中，已暂缓覆盖本地镜像',
      })
      continue
    }
    const applied = applyPulledProfileToLocalDatabase(
      {
        ...remoteProfile,
        fingerprintConfig: {
          ...remoteProfile.fingerprintConfig,
          runtimeMetadata: {
            ...remoteProfile.fingerprintConfig.runtimeMetadata,
            lastEnvironmentSyncVersion: Number(
              remoteProfile.fingerprintConfig.runtimeMetadata.lastEnvironmentSyncVersion || 0,
            ),
          },
        },
      },
      { preservePendingLocalChanges: false },
    )
    if (applied.changed) {
      autoPulledCount += 1
    }
  }

  for (const localProfile of requireDatabase().listProfiles()) {
    if (remoteIds.has(localProfile.id)) {
      continue
    }
    if (mode === 'auto-full-reconcile' && isRuntimeProtectedProfile(localProfile)) {
      updateEnvironmentSyncMetadata(localProfile.id, {
        status: 'recovery',
        message: '云端已删除当前环境，但本地环境正在运行或启动中，已暂缓移除本地镜像',
      })
      continue
    }
    requireDatabase().deleteProfile(localProfile.id)
    removedLocalMirrorCount += 1
  }

  return {
    cloudProfileCount: remoteProfiles.length,
    localMirroredProfileCount: requireDatabase().listProfiles().length,
    autoPulledCount,
    removedLocalMirrorCount,
  }
}

async function pullEnvironmentProfilesFromControlPlaneOrThrow(
  mode: EnvironmentMirrorSyncMode = 'manual-force-pull',
): Promise<{
  cloudProfileCount: number
  localMirroredProfileCount: number
  autoPulledCount: number
  removedLocalMirrorCount: number
}> {
  let snapshot: RemoteConfigSnapshot | null = null

  if (agentService?.getState().enabled) {
    snapshot = (await agentService.pullConfigSnapshot()) as RemoteConfigSnapshot | null
  } else if (getDesktopAuthState().authenticated) {
    snapshot = await pullEnvironmentSnapshotFromAccount()
  }

  if (!snapshot) {
    throw new Error('当前没有可拉取的云端环境')
  }

  const reconcileResult = await reconcileEnvironmentMirrorFromSnapshot(snapshot, mode)

  for (const profile of requireDatabase().listProfiles()) {
    if (isRuntimeProtectedProfile(profile) && mode === 'auto-full-reconcile') {
      continue
    }
    updateEnvironmentSyncMetadata(profile.id, {
      status: 'synced',
      message:
        mode === 'auto-full-reconcile'
          ? '已自动从云端收敛环境配置'
          : '已从云端拉取环境配置',
    })
  }

  return {
    cloudProfileCount: reconcileResult.cloudProfileCount,
    localMirroredProfileCount: reconcileResult.localMirroredProfileCount,
    autoPulledCount: reconcileResult.autoPulledCount,
    removedLocalMirrorCount: reconcileResult.removedLocalMirrorCount,
  }
}

const AUDIT_LOG_PATH = resolveAuditLogPath()
let gracefulShutdownInFlight = false
let beforeQuitHandled = false
let lastRuntimeNetworkDiagnostics: NonNullable<RuntimeHostInfo['networkDiagnostics']> | null = null
let sharedDataAutoPushTimer: NodeJS.Timeout | null = null
let sharedDataAutoPushRetryTimer: NodeJS.Timeout | null = null
let sharedDataAutoPushInFlight = false
let sharedDataAutoPushQueued = false
let controlPlaneSyncRetryTimer: NodeJS.Timeout | null = null
let controlPlaneSyncPollTimer: NodeJS.Timeout | null = null
let controlPlaneSyncInFlight = false
let controlPlaneSyncTasksLoaded = false
let controlPlaneSyncTasks: ControlPlaneSyncTask[] = []
let lastLoggedAgentRecoverableFailureAt = ''
let controlPlaneConnectivityState: ControlPlaneConnectivityState = {
  status: 'online',
  lastError: '',
  lastErrorAt: '',
  lastSuccessAt: '',
  consecutiveFailures: 0,
}
let controlPlaneRecoveryState: NonNullable<RuntimeHostInfo['controlPlaneRecoveryState']> = 'idle'
let controlPlaneNextRetryAt = ''
let globalNetworkRecoveryState: GlobalNetworkRecoveryState = {
  lastSignature: '',
  lastSeenAt: '',
  consecutiveFailures: 0,
  nextRetryDelayMs: 0,
  nextRetryAt: '',
  recoveryState: 'idle',
  timer: null,
}

type EnvironmentMirrorSyncMode =
  | 'auto-full-reconcile'
  | 'auto-push'
  | 'manual-force-upload'
  | 'manual-force-pull'

function emitConfigChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    window.webContents.send('meta.configChanged')
  }
}

function rememberRuntimeNetworkDiagnostics(
  payload: NonNullable<RuntimeHostInfo['networkDiagnostics']>,
): void {
  lastRuntimeNetworkDiagnostics = payload
}

function readLatestRuntimeNetworkDiagnosticsFromAudit():
  | NonNullable<RuntimeHostInfo['networkDiagnostics']>
  | null {
  if (lastRuntimeNetworkDiagnostics) {
    return lastRuntimeNetworkDiagnostics
  }
  if (!existsSync(AUDIT_LOG_PATH)) {
    return null
  }

  try {
    const lines = readFileSync(AUDIT_LOG_PATH, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const raw = lines[index]
      let record: Record<string, unknown>
      try {
        record = JSON.parse(raw) as Record<string, unknown>
      } catch {
        continue
      }
      if (record.action !== 'runtime_network_diagnostics') {
        continue
      }
      const level =
        record.level === 'ok' || record.level === 'warn' || record.level === 'block'
          ? record.level
          : 'warn'
      const messages = Array.isArray(record.messages)
        ? record.messages.map((item) => String(item)).filter(Boolean)
        : []
      const payload: NonNullable<RuntimeHostInfo['networkDiagnostics']> = {
        level,
        message: String(record.message || messages[0] || ''),
        checkedAt: String(record.checkedAt || record.ts || ''),
        egressIp: String(record.egressIp || ''),
        country: String(record.country || record.region || ''),
        timezone: String(record.timezone || ''),
      }
      rememberRuntimeNetworkDiagnostics(payload)
      return payload
    }
  } catch (error) {
    console.warn(
      '[duokai2] failed to hydrate runtime network diagnostics:',
      error instanceof Error ? error.message : String(error),
    )
  }

  return null
}

async function pushGlobalConfigToControlPlaneManually(reason: string): Promise<ConfigSyncResult> {
  if (!hasLocalConfigData()) {
    const result = buildConfigSyncPushFailedResult('当前没有可上传的本地全局配置')
    return setLastConfigSyncResult(result)!
  }
  setLastConfigSyncResult(buildConfigSyncInFlightResult())
  try {
    await syncConfigToControlPlaneOrThrow('replace', {
      onConflict: 'preserve-local-and-throw',
    })
    const result = buildConfigSyncPushSuccessResult('已将本地全局配置上传到云端')
    result.updatedAt = new Date().toISOString()
    result.syncVersion = lastUserConfigSyncVersion
    audit('global_config_push_manual_succeeded', { reason })
    return setLastConfigSyncResult(result)!
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    audit('global_config_push_manual_failed', { reason, err: message })
    return setLastConfigSyncResult(
      buildConfigSyncPushFailedResult(`本地全局配置已保留，但上传失败：${message}`),
    )!
  }
}

async function pushEnvironmentProfilesToControlPlaneManually(reason: string): Promise<ConfigSyncResult> {
  if (!hasLocalSharedData()) {
    const result = buildEnvironmentSyncPushFailedResult('当前没有可上传的本地环境镜像')
    return setLastConfigSyncResult(result)!
  }
  setLastConfigSyncResult(buildEnvironmentSyncInFlightResult('正在上传环境到云端'))
  try {
    const resultPayload = await pushEnvironmentProfilesToControlPlaneOrThrow('manual-force-upload')
    const result = buildEnvironmentSyncPushSuccessResult(
      `已将本地环境上传到云端：云端 ${resultPayload.cloudProfileCount} 个环境，本地镜像 ${resultPayload.localMirroredProfileCount} 个环境，新增/覆盖 ${resultPayload.autoUploadedCount} 个环境，删除云端旧镜像 ${resultPayload.removedLocalMirrorCount} 个`,
    )
    Object.assign(
      result,
      buildEnvironmentCountFields({
        cloudProfileCount: resultPayload.cloudProfileCount,
        localMirroredProfileCount: resultPayload.localMirroredProfileCount,
        autoUploadedCount: resultPayload.autoUploadedCount,
        removedLocalMirrorCount: resultPayload.removedLocalMirrorCount,
        remoteProfileCount: resultPayload.cloudProfileCount,
        localProfileCount: resultPayload.localMirroredProfileCount,
        deletedRemoteCount: resultPayload.removedLocalMirrorCount,
        upsertedProfileCount: resultPayload.autoUploadedCount,
      }),
    )
    audit('environment_push_manual_succeeded', { reason })
    void reportEnvironmentSyncEvent({
      direction: 'push',
      mode: 'manual',
      status: 'succeeded',
      profileIds: requireDatabase().listProfiles().map((profile) => profile.id),
      reason,
      cloudProfileCount: resultPayload.cloudProfileCount,
      localMirroredProfileCount: resultPayload.localMirroredProfileCount,
    })
    return setLastConfigSyncResult(result)!
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    audit('environment_push_manual_failed', { reason, err: message })
    void reportEnvironmentSyncEvent({
      direction: 'push',
      mode: 'manual',
      status: 'failed-warning',
      profileIds: requireDatabase().listProfiles().map((profile) => profile.id),
      reason,
      errorMessage: message,
    })
    return setLastConfigSyncResult(
      buildEnvironmentSyncPushFailedResult(`本地环境已保留，但上传失败：${message}`),
    )!
  }
}

function scheduleProfileConfigAfterLocalMutation(
  action: 'create' | 'update' | 'clone',
  profile: ProfileRecord,
): void {
  setLastConfigSyncResult(buildEnvironmentSyncPendingResult(
    `${action === 'create' ? '环境已创建' : action === 'update' ? '环境已更新' : '环境已复制'}，等待同步到云端`,
  ))
  updateEnvironmentSyncMetadata(profile.id, {
    status: 'pending',
    message:
      action === 'create'
        ? '环境已在本地创建，等待上传到云端'
        : action === 'update'
          ? '环境改动已保存到本地，等待上传到云端'
          : '环境副本已创建，等待上传到云端',
  })
  scheduleSharedDataAutoPush(
    action === 'create'
      ? 'create-profile'
      : action === 'update'
        ? 'update-profile'
        : 'clone-profile',
    [profile.id],
  )
}

function scheduleGlobalConfigMutation(message: string): void {
  markLocalConfigDirty(message)
}

function clearSharedDataAutoPushRetry(): void {
  if (sharedDataAutoPushRetryTimer) {
    clearTimeout(sharedDataAutoPushRetryTimer)
    sharedDataAutoPushRetryTimer = null
  }
}

function scheduleSharedDataAutoPushRetry(): void {
  clearSharedDataAutoPushRetry()
  sharedDataAutoPushRetryTimer = setTimeout(() => {
    sharedDataAutoPushRetryTimer = null
    void flushSharedDataAutoPush()
  }, 10_000)
}

function scheduleSharedDataAutoPush(reason: string, profileIds: string[] = []): void {
  requireDatabase().enqueueEnvironmentSyncTask(reason, profileIds)
  sharedDataAutoPushQueued = true
  if (sharedDataAutoPushTimer) {
    clearTimeout(sharedDataAutoPushTimer)
  }
  sharedDataAutoPushTimer = setTimeout(() => {
    sharedDataAutoPushTimer = null
    void flushSharedDataAutoPush()
  }, 300)
}

async function flushSharedDataAutoPush(): Promise<void> {
  if (!sharedDataAutoPushQueued || sharedDataAutoPushInFlight) {
    return
  }
  if (!getDesktopAuthState().authenticated) {
    return
  }

  const queuedTask = requireDatabase().getNextEnvironmentSyncTask()
  if (!queuedTask) {
    sharedDataAutoPushQueued = false
    return
  }

  sharedDataAutoPushInFlight = true
  sharedDataAutoPushQueued = false
  clearSharedDataAutoPushRetry()
  const activeTask = requireDatabase().markEnvironmentSyncTaskRetrying(queuedTask.taskId) ?? queuedTask
  const affectedProfileIds = activeTask.profileIds
  setLastConfigSyncResult(buildEnvironmentSyncInFlightResult('正在自动同步环境到云端'))

  try {
    const resultPayload = await pushEnvironmentProfilesToControlPlaneOrThrow('auto-push')
    const result = buildEnvironmentSyncPushSuccessResult(
      `已自动同步环境：云端 ${resultPayload.cloudProfileCount} 个环境，本地镜像 ${resultPayload.localMirroredProfileCount} 个，自动上传 ${resultPayload.autoUploadedCount} 个，移除云端旧镜像 ${resultPayload.removedLocalMirrorCount} 个`,
    )
    Object.assign(
      result,
      buildEnvironmentCountFields({
        cloudProfileCount: resultPayload.cloudProfileCount,
        localMirroredProfileCount: resultPayload.localMirroredProfileCount,
        autoUploadedCount: resultPayload.autoUploadedCount,
        removedLocalMirrorCount: resultPayload.removedLocalMirrorCount,
      }),
    )
    setLastConfigSyncResult(result)
    requireDatabase().markEnvironmentSyncTaskSucceeded(activeTask.taskId)
    audit('environment_auto_push_succeeded', {
      taskId: activeTask.taskId,
      reason: activeTask.reason,
      cloudProfileCount: resultPayload.cloudProfileCount,
      localMirroredProfileCount: resultPayload.localMirroredProfileCount,
      autoUploadedCount: resultPayload.autoUploadedCount,
      removedLocalMirrorCount: resultPayload.removedLocalMirrorCount,
    })
    void reportEnvironmentSyncEvent({
      direction: 'push',
      mode: 'auto',
      status: 'succeeded',
      profileIds: affectedProfileIds,
      reason: activeTask.reason,
      cloudProfileCount: resultPayload.cloudProfileCount,
      localMirroredProfileCount: resultPayload.localMirroredProfileCount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    for (const profileId of affectedProfileIds) {
      updateEnvironmentSyncMetadata(profileId, {
        status: 'recovery',
        message: buildEnvironmentSyncFailureMessage('auto-push', message, 'upload'),
      })
    }
    requireDatabase().markEnvironmentSyncTaskFailed(activeTask.taskId, message)
    setLastConfigSyncResult(
      buildEnvironmentSyncPushFailedResult(`环境自动上传失败：${message}`),
    )
    audit('environment_auto_push_failed', {
      taskId: activeTask.taskId,
      reason: activeTask.reason,
      err: message,
      affectedProfileIds,
    })
    void reportEnvironmentSyncEvent({
      direction: 'push',
      mode: 'auto',
      status: 'failed-warning',
      profileIds: affectedProfileIds,
      reason: activeTask.reason,
      errorMessage: message,
    })
    scheduleSharedDataAutoPushRetry()
  } finally {
    sharedDataAutoPushInFlight = false
    if (sharedDataAutoPushQueued) {
      void flushSharedDataAutoPush()
    }
  }
}

function hasPendingProfileConfigChanges(profileId: string): boolean {
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    return false
  }
  return profile.fingerprintConfig.runtimeMetadata.lastEnvironmentSyncStatus === 'pending'
}

function buildPortableProfileConfig(profile: ProfileRecord): ProfileRecord {
  return {
    ...profile,
    workspace: createPortableWorkspaceDescriptor(
      profile.workspace ?? null,
      profile.id,
      profile.fingerprintConfig,
    ),
    fingerprintConfig: {
      ...profile.fingerprintConfig,
      runtimeMetadata: {
        ...profile.fingerprintConfig.runtimeMetadata,
        lastEnvironmentSyncStatus: 'idle',
        lastEnvironmentSyncMessage: '',
      },
    },
  }
}

type EnvironmentIndexApplyMode = 'index-only' | 'full-replace'

function applyRemoteProfileIndexToLocalProfile(
  localProfile: ProfileRecord,
  remoteProfile: ProfileRecord,
): { profile: ProfileRecord; changed: boolean } {
  const metadata = localProfile.fingerprintConfig.runtimeMetadata
  const hadMissingCloudIndexMarker =
    metadata.lastEnvironmentSyncStatus === 'recovery' &&
    /云端环境清单中已不存在当前环境/.test(metadata.lastEnvironmentSyncMessage || '')
  const changed =
    localProfile.name !== remoteProfile.name ||
    localProfile.groupName !== remoteProfile.groupName ||
    localProfile.notes !== remoteProfile.notes ||
    localProfile.environmentPurpose !== remoteProfile.environmentPurpose ||
    JSON.stringify(localProfile.tags) !== JSON.stringify(remoteProfile.tags) ||
    hadMissingCloudIndexMarker
  if (!changed) {
    return { profile: localProfile, changed: false }
  }
  const persisted = persistProfile({
    ...localProfile,
    name: remoteProfile.name,
    groupName: remoteProfile.groupName,
    tags: Array.isArray(remoteProfile.tags) ? remoteProfile.tags : [],
    notes: remoteProfile.notes,
    environmentPurpose: remoteProfile.environmentPurpose,
  })
  return { profile: persisted, changed: true }
}

function clearMissingCloudIndexMarker(profile: ProfileRecord): void {
  const metadata = profile.fingerprintConfig.runtimeMetadata
  if (
    metadata.lastEnvironmentSyncStatus !== 'recovery' ||
    !/云端环境清单中已不存在当前环境/.test(metadata.lastEnvironmentSyncMessage || '')
  ) {
    return
  }
  updateEnvironmentSyncMetadata(profile.id, {
    status: 'synced',
    message: '环境清单已与云端对齐',
  })
}

function isManualProfileSyncReason(reason: string): boolean {
  return reason.includes('manual')
}

function buildEnvironmentSyncFailureMessage(
  reason: string,
  rawMessage: string,
  mode: 'upload' | 'pull',
): string {
  const suggestion =
    mode === 'upload'
      ? '自动上传失败，请手动上传最新本地环境。'
      : '自动拉取失败，请手动从云端拉取最新环境。'
  if (isManualProfileSyncReason(reason)) {
    return rawMessage
  }
  return `${rawMessage}；${suggestion}`
}

function buildSyncWarningMessage(kind: 'storageState' | 'workspaceSummary' | 'workspaceSnapshot', message: string): string {
  const base =
    kind === 'storageState'
      ? '云端登录态同步失败'
      : kind === 'workspaceSummary'
        ? '环境摘要同步失败'
        : '环境快照同步失败'
  const detail = message.trim() || '未知错误'
  return `${base}：${detail}。不影响本地启动，可稍后手动同步。`
}

async function runNonBlockingSyncSideEffect(
  profileId: string,
  kind: 'storageState' | 'workspaceSummary' | 'workspaceSnapshot',
  action: () => Promise<void>,
): Promise<void> {
  try {
    await action()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const profile = requireDatabase().getProfileById(profileId)
    if (profile) {
      if (kind === 'storageState') {
        updateRuntimeMetadata(profile, {
          lastStorageStateSyncStatus: 'error',
          lastStorageStateSyncMessage: buildSyncWarningMessage(kind, message),
        })
      } else if (kind === 'workspaceSummary') {
        updateRuntimeMetadata(profile, {
          lastWorkspaceSummarySyncStatus: 'error',
          lastWorkspaceSummarySyncMessage: buildSyncWarningMessage(kind, message),
        })
      } else {
        updateRuntimeMetadata(profile, {
          lastWorkspaceSnapshotSyncStatus: 'error',
          lastWorkspaceSnapshotSyncMessage: buildSyncWarningMessage(kind, message),
        })
      }
    }
    audit(`${kind}_sync_warning`, {
      profileId,
      err: message,
    })
    logEvent(
      'warn',
      'runtime',
      buildSyncWarningMessage(kind, message),
      profileId,
    )
  }
}

function isLaunchBlockingFailure(
  profile: ProfileRecord | null,
  error: unknown,
): boolean {
  if (profile?.fingerprintConfig.runtimeMetadata.lastValidationLevel === 'block') {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return (
    /workspace/i.test(message) ||
    /runtime lock/i.test(message) ||
    /proxy preflight failed/i.test(message) ||
    /profile is already running|profile is already starting|profile is already queued/i.test(message) ||
    /launch queue is full|profile launch is already pending/i.test(message)
  )
}

function recordProfileLaunchFailure(profileId: string, error: unknown): void {
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  updateRuntimeMetadata(profile, {
    lastValidationLevel: isLaunchBlockingFailure(profile, error) ? 'block' : 'warn',
    lastValidationMessages: [message],
    launchValidationStage: 'idle',
  })
}

async function pushProfileConfigToControlPlane(profileId: string, reason: string): Promise<ConfigSyncResult> {
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    throw new Error('Profile not found')
  }
  if (!getDesktopAuthState().authenticated) {
    updateEnvironmentSyncMetadata(profileId, {
      status: 'pending',
      message: '本地环境配置已保存，登录后可上传到云端',
    })
    return buildEnvironmentSyncPendingResult('本地环境配置已保存，登录后可上传到云端')
  }

  updateEnvironmentSyncMetadata(profileId, {
    status: 'syncing',
    message: reason.includes('manual') ? '正在上传当前环境到云端' : '正在同步当前环境配置到云端',
  })
  try {
    const payload = await requestControlPlane(`/api/config/profiles/${encodeURIComponent(profileId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        baseVersion: profile.fingerprintConfig.runtimeMetadata.lastEnvironmentSyncVersion || 0,
        force: isManualProfileSyncReason(reason),
        profile: buildPortableProfileConfig(profile),
      }),
    })
    const syncVersion = Number(payload.syncVersion || 0)
    const updatedProfile = requireDatabase().getProfileById(profileId)
    if (updatedProfile) {
      updateRuntimeMetadata(updatedProfile, {
        lastEnvironmentSyncStatus: 'synced',
        lastEnvironmentSyncMessage: '环境配置已同步到云端',
        lastEnvironmentSyncAt: new Date().toISOString(),
        lastEnvironmentSyncVersion: syncVersion,
      })
    }
    return buildEnvironmentSyncPushSuccessResult('当前环境已同步到云端')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isConflict = /profile config sync version mismatch|版本冲突|sync version mismatch/i.test(message)
    const nextMessage = buildEnvironmentSyncFailureMessage(reason, message, 'upload')
    updateEnvironmentSyncMetadata(profileId, {
      status: isManualProfileSyncReason(reason) ? (isConflict ? 'conflict' : 'error') : 'recovery',
      message: nextMessage,
    })
    return buildEnvironmentSyncPushFailedResult(`当前环境同步失败：${nextMessage}`)
  }
}

async function pullProfileConfigFromControlPlane(
  profileId: string,
  options: {
    force?: boolean
  } = {},
): Promise<ConfigSyncResult> {
  const force = options.force === true
  const localProfile = requireDatabase().getProfileById(profileId)
  if (!localProfile) {
    throw new Error('Profile not found')
  }
  if (!force && hasPendingProfileConfigChanges(profileId)) {
    throw new Error('当前环境存在本地待同步改动，请先上传到云端，避免覆盖本地环境')
  }
  if (force && (runtimeContexts.has(profileId) || isProfileLaunchInFlight(profileId) || localProfile.status === 'running')) {
    throw new Error('当前环境正在运行或启动中，请先停止环境后再从云端拉取')
  }

  const payload = await requestControlPlane(`/api/config/profiles/${encodeURIComponent(profileId)}`)
  const remoteProfile = (payload.profile || null) as ProfileRecord | null
  if (!remoteProfile) {
    throw new Error('云端未找到当前环境配置')
  }
  applyPulledProfileToLocalDatabase(
    {
      ...remoteProfile,
      fingerprintConfig: {
        ...remoteProfile.fingerprintConfig,
        runtimeMetadata: {
          ...remoteProfile.fingerprintConfig.runtimeMetadata,
          lastEnvironmentSyncVersion: Number(
            payload.syncVersion || remoteProfile.fingerprintConfig.runtimeMetadata.lastEnvironmentSyncVersion || 0,
          ),
        },
      },
    },
    { preservePendingLocalChanges: !force },
  )
  updateEnvironmentSyncMetadata(profileId, {
    status: 'synced',
    message: force ? '已强制从云端拉取当前环境配置' : '已从云端拉取当前环境配置',
  })
  return buildEnvironmentSyncPushSuccessResult(force ? '已强制从云端拉取当前环境' : '当前环境已从云端拉取')
}

function applyPulledProfileToLocalDatabase(
  remoteProfile: ProfileRecord,
  options: {
    preservePendingLocalChanges?: boolean
    mode?: EnvironmentIndexApplyMode
  } = {},
): { profile: ProfileRecord; changed: boolean } {
  const mode = options.mode ?? 'full-replace'
  const localProfile = requireDatabase().getProfileById(remoteProfile.id)
  if (
    mode === 'full-replace' &&
    options.preservePendingLocalChanges !== false &&
    localProfile &&
    hasPendingProfileConfigChanges(localProfile.id)
  ) {
    return { profile: localProfile, changed: false }
  }

  if (localProfile && mode === 'index-only') {
    const merged = applyRemoteProfileIndexToLocalProfile(localProfile, remoteProfile)
    clearMissingCloudIndexMarker(merged.profile)
    return merged
  }

  const nextProfile = requireDatabase().updateProfile({
    id: remoteProfile.id,
    name: remoteProfile.name,
    proxyId: remoteProfile.proxyId,
    groupName: remoteProfile.groupName,
    tags: remoteProfile.tags,
    notes: remoteProfile.notes,
    environmentPurpose: remoteProfile.environmentPurpose,
    deviceProfile: remoteProfile.deviceProfile,
    fingerprintConfig: {
      ...remoteProfile.fingerprintConfig,
      runtimeMetadata: {
        ...(localProfile?.fingerprintConfig.runtimeMetadata || {}),
        ...remoteProfile.fingerprintConfig.runtimeMetadata,
        lastEnvironmentSyncStatus: 'synced',
        lastEnvironmentSyncMessage: '已从云端拉取环境配置',
        lastEnvironmentSyncAt: new Date().toISOString(),
      },
    },
    workspace: remoteProfile.workspace ?? null,
  })
  const normalizedWorkspace = ensureWorkspaceLayoutForProfile(app, nextProfile, (nextWorkspace) => {
    persistProfile({
      ...nextProfile,
      workspace: nextWorkspace,
    })
  })
  const persisted =
    normalizedWorkspace !== nextProfile.workspace
      ? persistProfile({
          ...nextProfile,
          workspace: normalizedWorkspace,
        })
      : nextProfile

  if (!localProfile) {
    requireDatabase().setProfileStatus(remoteProfile.id, 'stopped')
  }

  return { profile: persisted, changed: true }
}

async function reconcileEnvironmentMirrorFromControlPlane(
  mode: EnvironmentMirrorSyncMode = 'auto-full-reconcile',
): Promise<ConfigSyncResult> {
  if (!getDesktopAuthState().authenticated) {
    return buildEnvironmentSyncPendingResult('请先登录后再同步环境')
  }

  const result = await pullEnvironmentProfilesFromControlPlaneOrThrow(mode)
  const syncResult: ConfigSyncResult = {
    scope: 'environment',
    count: result.localMirroredProfileCount,
    source: agentService?.getState().enabled ? 'agent' : 'account',
    usedLocalCache: false,
    message:
      mode === 'auto-full-reconcile'
        ? `已自动从云端收敛环境：云端 ${result.cloudProfileCount} 个环境 / 本地镜像 ${result.localMirroredProfileCount} 个 / 拉取更新 ${result.autoPulledCount} 个 / 移除旧镜像 ${result.removedLocalMirrorCount} 个`
        : `已从云端拉取环境：云端 ${result.cloudProfileCount} 个环境 / 本地镜像 ${result.localMirroredProfileCount} 个 / 拉取更新 ${result.autoPulledCount} 个 / 移除旧镜像 ${result.removedLocalMirrorCount} 个`,
    warningMessage: '',
    ...buildEnvironmentCountFields({
      cloudProfileCount: result.cloudProfileCount,
      localMirroredProfileCount: result.localMirroredProfileCount,
      autoPulledCount: result.autoPulledCount,
      removedLocalMirrorCount: result.removedLocalMirrorCount,
      remoteProfileCount: result.cloudProfileCount,
      localProfileCountAfterPull: result.localMirroredProfileCount,
      removedLocalOrphanCount: result.removedLocalMirrorCount,
      updatedProfileCount: result.autoPulledCount,
    }),
  }
  void reportEnvironmentSyncEvent({
    direction: 'pull',
    mode: mode === 'auto-full-reconcile' ? 'auto' : 'manual',
    status: 'succeeded',
    profileIds: requireDatabase().listProfiles().map((profile) => profile.id),
    reason: mode,
    cloudProfileCount: result.cloudProfileCount,
    localMirroredProfileCount: result.localMirroredProfileCount,
  })
  return syncResult
}

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

function getProfileRuntimeLockPath(profile: ProfileRecord): string {
  const normalizedPaths = profile.workspace
    ? normalizeWorkspacePathsForProfile(app, profile.id, profile.workspace.paths)
    : null
  const ensured = profile.workspace
    ? {
        ...profile.workspace,
        paths: normalizedPaths!,
        resolvedEnvironment: {
          ...profile.workspace.resolvedEnvironment,
          downloadsDir: normalizedPaths!.downloadsDir,
        },
      }
    : ensureWorkspaceLayoutForProfileId(profile.id).workspace
  if (!ensured) {
    throw new Error('Workspace not ready for runtime lock')
  }
  mkdirSync(ensured.paths.metaDir, { recursive: true })
  return path.join(ensured.paths.metaDir, 'runtime.lock.json')
}

function readRuntimeLockRecord(profile: ProfileRecord): RuntimeLockRecord | null {
  const lockPath = getProfileRuntimeLockPath(profile)
  if (!existsSync(lockPath)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8')) as RuntimeLockRecord
  } catch {
    return null
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function getRuntimeLockStateForProfile(profile: ProfileRecord): 'unlocked' | 'locked' | 'stale-lock' {
  const record = readRuntimeLockRecord(profile)
  if (!record) {
    return 'unlocked'
  }
  const updatedAtMs = Date.parse(record.updatedAt || record.createdAt || '')
  const staleByTime = !Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > PROFILE_RUNTIME_LOCK_STALE_MS
  const staleByPid = record.ownerPid !== process.pid && !isProcessAlive(record.ownerPid)
  return staleByTime || staleByPid ? 'stale-lock' : 'locked'
}

function writeRuntimeLockRecord(profile: ProfileRecord, status: RuntimeLockRecord['status']): RuntimeLockRecord {
  const now = new Date().toISOString()
  const existing = readRuntimeLockRecord(profile)
  const next: RuntimeLockRecord = {
    profileId: profile.id,
    ownerPid: process.pid,
    ownerDeviceId: getControlPlaneDeviceId(),
    status,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
  const lockPath = getProfileRuntimeLockPath(profile)
  writeFileSync(lockPath, JSON.stringify(next, null, 2), 'utf8')
  return next
}

function updateWorkspaceTrustSummary(
  profile: ProfileRecord,
  patch: Partial<NonNullable<ProfileRecord['workspace']>['trustSummary']>,
): ProfileRecord {
  if (!profile.workspace) {
    return profile
  }
  return persistProfile({
    ...profile,
    workspace: {
      ...profile.workspace,
      trustSummary: {
        ...profile.workspace.trustSummary,
        ...patch,
        activeRuntimeLock: {
          ...profile.workspace.trustSummary.activeRuntimeLock,
          ...(patch.activeRuntimeLock ?? {}),
        },
      },
    },
  })
}

function persistQuickIsolationTrust(
  profile: ProfileRecord,
  quickCheck: TrustedIsolationCheck,
): ProfileRecord {
  const withMetadata = updateRuntimeMetadata(profile, {
    lastQuickIsolationCheck: quickCheck,
  })
  return updateWorkspaceTrustSummary(withMetadata, {
    lastQuickIsolationCheckAt: quickCheck.checkedAt,
    lastQuickIsolationCheckSuccess: quickCheck.success,
    lastQuickIsolationCheckMessage: quickCheck.message,
    activeRuntimeLock: {
      state: quickCheck.runtimeLockStatus,
      ownerDeviceId:
        quickCheck.runtimeLockStatus === 'unlocked' ? '' : getControlPlaneDeviceId(),
      ownerPid: quickCheck.runtimeLockStatus === 'unlocked' ? null : process.pid,
      updatedAt: quickCheck.checkedAt,
    },
  })
}

function persistTrustedLaunchSummary(
  profile: ProfileRecord,
  options: {
    trustedSnapshotStatus: NonNullable<ProfileRecord['workspace']>['trustSummary']['trustedSnapshotStatus']
    trustedLaunchVerifiedAt?: string
  },
): ProfileRecord {
  return updateWorkspaceTrustSummary(profile, {
    trustedSnapshotStatus: options.trustedSnapshotStatus,
    trustedLaunchVerifiedAt: options.trustedLaunchVerifiedAt ?? '',
  })
}

function resetTrustAfterWorkspaceRecovery(
  profile: ProfileRecord,
  options: {
    reason: string
  },
): ProfileRecord {
  const withMetadataReset = updateRuntimeMetadata(profile, {
    lastQuickCheckAt: '',
    lastQuickCheckSuccess: null,
    lastQuickCheckMessage: '',
    lastQuickIsolationCheck: null,
    trustedSnapshotStatus: 'stale',
    trustedLaunchSnapshot: null,
    launchValidationStage: 'idle',
    lastValidationMessages: Array.from(
      new Set([
        ...profile.fingerprintConfig.runtimeMetadata.lastValidationMessages,
        options.reason,
      ].filter(Boolean)),
    ),
  })
  const withTrustSummary = updateWorkspaceTrustSummary(withMetadataReset, {
    lastQuickIsolationCheckAt: '',
    lastQuickIsolationCheckSuccess: null,
    lastQuickIsolationCheckMessage: options.reason,
    trustedSnapshotStatus: 'stale',
    trustedLaunchVerifiedAt: '',
    activeRuntimeLock: {
      state: 'unlocked',
      ownerDeviceId: '',
      ownerPid: null,
      updatedAt: new Date().toISOString(),
    },
  })
  return withTrustSummary
}

function isProfileLaunchInFlight(profileId: string): boolean {
  return scheduler.getQueuedIds().includes(profileId) || scheduler.getStartingIds().includes(profileId)
}

async function releaseProfileRuntimeLock(profileId: string): Promise<void> {
  const timer = runtimeLockHeartbeatTimers.get(profileId)
  if (timer) {
    clearInterval(timer)
    runtimeLockHeartbeatTimers.delete(profileId)
  }
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    return
  }
  const lockPath = getProfileRuntimeLockPath(profile)
  if (!existsSync(lockPath)) {
    return
  }
  try {
    unlinkSync(lockPath)
    const updatedProfile = updateWorkspaceTrustSummary(profile, {
      activeRuntimeLock: {
        state: 'unlocked',
        ownerDeviceId: '',
        ownerPid: null,
        updatedAt: new Date().toISOString(),
      },
    })
    void syncWorkspaceSummaryToControlPlane(updatedProfile).catch(() => {})
  } catch (error) {
    audit('runtime_lock_release_failed', {
      profileId,
      err: error instanceof Error ? error.message : String(error),
    })
  }
}

function startRuntimeLockHeartbeat(profileId: string): void {
  const existing = runtimeLockHeartbeatTimers.get(profileId)
  if (existing) {
    clearInterval(existing)
  }
  const timer = setInterval(() => {
    const profile = requireDatabase().getProfileById(profileId)
    if (!profile) {
      return
    }
    try {
      writeRuntimeLockRecord(profile, runtimeContexts.has(profileId) ? 'running' : 'starting')
    } catch (error) {
      audit('runtime_lock_heartbeat_failed', {
        profileId,
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }, PROFILE_RUNTIME_LOCK_HEARTBEAT_MS)
  runtimeLockHeartbeatTimers.set(profileId, timer)
}

function acquireProfileRuntimeLock(profile: ProfileRecord): { record: RuntimeLockRecord; staleReclaimed: boolean } {
  const existing = readRuntimeLockRecord(profile)
  let staleReclaimed = false
  if (existing) {
    const lockState = getRuntimeLockStateForProfile(profile)
    if (lockState === 'locked' && existing.ownerPid !== process.pid) {
      throw new Error(
        `Runtime lock exists for profile ${profile.id} (pid=${existing.ownerPid}, updatedAt=${existing.updatedAt})`,
      )
    }
    if (lockState === 'stale-lock') {
      staleReclaimed = true
      try {
        unlinkSync(getProfileRuntimeLockPath(profile))
      } catch {
        // Ignore best-effort cleanup and rewrite below.
      }
    }
  }
  const record = writeRuntimeLockRecord(profile, 'starting')
  const updatedProfile = updateWorkspaceTrustSummary(profile, {
    activeRuntimeLock: {
      state: 'locked',
      ownerDeviceId: getControlPlaneDeviceId(),
      ownerPid: process.pid,
      updatedAt: record.updatedAt,
    },
  })
  void syncWorkspaceSummaryToControlPlane(updatedProfile).catch(() => {})
  startRuntimeLockHeartbeat(profile.id)
  audit(staleReclaimed ? 'runtime_lock_reclaimed' : 'runtime_lock_acquired', {
    profileId: profile.id,
    ownerPid: record.ownerPid,
    staleReclaimed,
  })
  return { record, staleReclaimed }
}

function markProfileRuntimeLockRunning(profileId: string): void {
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    return
  }
  writeRuntimeLockRecord(profile, 'running')
  const updatedProfile = updateWorkspaceTrustSummary(profile, {
    activeRuntimeLock: {
      state: 'locked',
      ownerDeviceId: getControlPlaneDeviceId(),
      ownerPid: process.pid,
      updatedAt: new Date().toISOString(),
    },
  })
  void syncWorkspaceSummaryToControlPlane(updatedProfile).catch(() => {})
}

function summarizeRuntimeLockStates(): {
  lockedProfileIds: string[]
  staleLockProfileIds: string[]
} {
  const lockedProfileIds: string[] = []
  const staleLockProfileIds: string[] = []
  for (const profile of requireDatabase().listProfiles()) {
    const lockState = getRuntimeLockStateForProfile(profile)
    if (lockState === 'locked') {
      lockedProfileIds.push(profile.id)
    }
    if (lockState === 'stale-lock') {
      staleLockProfileIds.push(profile.id)
    }
  }
  return { lockedProfileIds, staleLockProfileIds }
}

function cleanupRuntimeLocksOnStartup(): void {
  for (const profile of requireDatabase().listProfiles()) {
    if (!profile.workspace) {
      continue
    }
    if (getRuntimeLockStateForProfile(profile) !== 'stale-lock') {
      continue
    }
    try {
      unlinkSync(getProfileRuntimeLockPath(profile))
      const updatedProfile = updateWorkspaceTrustSummary(profile, {
        activeRuntimeLock: {
          state: 'unlocked',
          ownerDeviceId: '',
          ownerPid: null,
          updatedAt: new Date().toISOString(),
        },
      })
      void syncWorkspaceSummaryToControlPlane(updatedProfile).catch(() => {})
      audit('runtime_lock_cleanup_startup', { profileId: profile.id })
    } catch (error) {
      audit('runtime_lock_cleanup_startup_failed', {
        profileId: profile.id,
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

function ensureWorkspaceLayoutForProfileId(profileId: string): ProfileRecord {
  let profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    throw new Error('Profile not found')
  }
  const workspace = ensureWorkspaceLayoutForProfile(app, profile, (nextWorkspace) => {
    profile = persistProfile({
      ...profile!,
      workspace: nextWorkspace,
    })
  })
  profile = requireDatabase().getProfileById(profileId) ?? {
    ...profile,
    workspace,
  }
  return profile
}

function normalizeStorageState(stateJson: unknown): BrowserStorageState | null {
  if (!stateJson || typeof stateJson !== 'object') {
    return null
  }
  return stateJson as BrowserStorageState
}

function isValidStorageStateCookie(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === 'object' && typeof (input as { name?: unknown }).name === 'string'
}

type BrowserStorageStateOrigin = NonNullable<BrowserStorageState['origins']>[number]

function isValidStorageStateOrigin(input: unknown): input is BrowserStorageStateOrigin {
  if (!input || typeof input !== 'object') {
    return false
  }
  const origin = input as {
    origin?: unknown
    localStorage?: unknown
  }
  if (typeof origin.origin !== 'string' || !origin.origin.trim()) {
    return false
  }
  if (origin.localStorage === undefined) {
    return true
  }
  return Array.isArray(origin.localStorage)
}

function hasUsableStorageState(stateJson: unknown): stateJson is BrowserStorageState {
  const normalized = normalizeStorageState(stateJson)
  if (!normalized) {
    return false
  }
  const cookies = Array.isArray(normalized.cookies) ? normalized.cookies.filter(isValidStorageStateCookie) : []
  const origins = Array.isArray(normalized.origins) ? normalized.origins.filter(isValidStorageStateOrigin) : []
  return cookies.length > 0 || origins.length > 0
}

function hashStorageState(stateJson: unknown): string {
  return createHash('sha256').update(JSON.stringify(stateJson)).digest('hex')
}

async function readProfileStorageStateFromDisk(profileId: string): Promise<BrowserStorageState | null> {
  try {
    ensureWorkspaceLayoutForProfileId(profileId)
    const content = await readFile(getProfileStorageStatePath(profileId), 'utf8')
    const normalized = normalizeStorageState(JSON.parse(content))
    return hasUsableStorageState(normalized) ? normalized : null
  } catch {
    return null
  }
}

async function writeProfileStorageStateToDisk(profileId: string, stateJson: unknown): Promise<void> {
  ensureWorkspaceLayoutForProfileId(profileId)
  const profilePath = getProfilePath(app, profileId)
  mkdirSync(profilePath, { recursive: true })
  await writeFile(getProfileStorageStatePath(profileId), JSON.stringify(stateJson, null, 2), 'utf8')
}

async function saveProfileStorageStateToDisk(
  profileId: string,
  context: BrowserContext,
): Promise<BrowserStorageState> {
  const stateJson = (await context.storageState()) as BrowserStorageState
  if (!hasUsableStorageState(stateJson)) {
    throw new Error('当前登录态文件为空或格式无效')
  }
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
    const message = error instanceof Error ? error.message : String(error)
    if (/Target page, context or browser has been closed/i.test(message)) {
      return
    }
    audit('storage_state_save_failed', {
      profileId,
      err: message,
    })
  }
}

async function fetchRemoteProfileStorageState(profileId: string): Promise<ControlPlaneStorageState | null> {
  if (!getDesktopAuthState().authenticated) {
    return null
  }
  const payload = await requestControlPlane(
    `/api/profile-storage-state/${encodeURIComponent(profileId)}?includeContent=1`,
  )
  return (payload.storageState || null) as ControlPlaneStorageState | null
}

async function syncWorkspaceSnapshotToControlPlane(
  snapshot: WorkspaceSnapshotRecord,
): Promise<void> {
  if (!getDesktopAuthState().authenticated) {
    return
  }
  const profile = requireDatabase().getProfileById(snapshot.profileId)
  if (profile) {
    updateRuntimeMetadata(profile, {
      lastWorkspaceSnapshotSyncStatus: 'syncing',
      lastWorkspaceSnapshotSyncMessage: '正在同步环境快照到云端',
    })
  }
  try {
    const pathName = `/api/workspace-snapshots/${encodeURIComponent(snapshot.profileId)}/${encodeURIComponent(snapshot.snapshotId)}`
    const body = JSON.stringify(snapshot)
    await requestControlPlane(pathName, {
      method: 'PUT',
      body,
    })
    const latestProfile = requireDatabase().getProfileById(snapshot.profileId)
    if (latestProfile) {
      updateRuntimeMetadata(latestProfile, {
        lastWorkspaceSnapshotSyncAt: new Date().toISOString(),
        lastWorkspaceSnapshotSyncStatus: 'synced',
        lastWorkspaceSnapshotSyncMessage: '环境快照已同步到云端',
      })
    }
  } catch (error) {
    const latestProfile = requireDatabase().getProfileById(snapshot.profileId)
    if (latestProfile) {
      updateRuntimeMetadata(latestProfile, {
        lastWorkspaceSnapshotSyncStatus: 'error',
        lastWorkspaceSnapshotSyncMessage:
          error instanceof Error ? error.message : String(error),
        lastControlPlaneError: error instanceof Error ? error.message : String(error),
        lastControlPlaneErrorAt: new Date().toISOString(),
      })
    }
    enqueueRecoverableControlPlaneSyncTask(
      {
        kind: 'workspace-snapshot',
        dedupeKey: `workspace-snapshot:${snapshot.profileId}:${snapshot.snapshotId}`,
        profileId: snapshot.profileId,
        method: 'PUT',
        pathName: `/api/workspace-snapshots/${encodeURIComponent(snapshot.profileId)}/${encodeURIComponent(snapshot.snapshotId)}`,
        body: JSON.stringify(snapshot),
      },
      error,
    )
    throw error
  }
}

async function fetchWorkspaceSnapshotFromControlPlane(
  profileId: string,
  snapshotId: string,
): Promise<WorkspaceSnapshotRecord | null> {
  if (!getDesktopAuthState().authenticated) {
    return null
  }
  const payload = await requestControlPlane(
    `/api/workspace-snapshots/${encodeURIComponent(profileId)}/${encodeURIComponent(snapshotId)}?includeContent=1`,
  )
  return (payload.snapshot || null) as WorkspaceSnapshotRecord | null
}

async function syncWorkspaceSummaryToControlPlane(
  profile: ProfileRecord,
): Promise<void> {
  if (!getDesktopAuthState().authenticated || !profile.workspace) {
    return
  }
  updateRuntimeMetadata(profile, {
    lastWorkspaceSummarySyncStatus: 'syncing',
    lastWorkspaceSummarySyncMessage: '正在同步环境摘要到云端',
  })
  try {
    const pathName = `/api/config/profiles/${encodeURIComponent(profile.id)}/workspace-summary`
    const body = JSON.stringify({
      workspace: createPortableWorkspaceDescriptor(
        profile.workspace,
        profile.id,
        profile.fingerprintConfig,
      ),
      status: 'synced',
      message: '环境摘要已同步到云端',
      updatedAt: new Date().toISOString(),
    })
    await requestControlPlane(pathName, {
      method: 'POST',
      body,
    })
    const latestProfile = requireDatabase().getProfileById(profile.id)
    if (latestProfile) {
      updateRuntimeMetadata(latestProfile, {
        lastWorkspaceSummarySyncAt: new Date().toISOString(),
        lastWorkspaceSummarySyncStatus: 'synced',
        lastWorkspaceSummarySyncMessage: '环境摘要已同步到云端',
      })
    }
  } catch (error) {
    const latestProfile = requireDatabase().getProfileById(profile.id)
    if (latestProfile) {
      updateRuntimeMetadata(latestProfile, {
        lastWorkspaceSummarySyncStatus: 'error',
        lastWorkspaceSummarySyncMessage:
          error instanceof Error ? error.message : String(error),
        lastControlPlaneError: error instanceof Error ? error.message : String(error),
        lastControlPlaneErrorAt: new Date().toISOString(),
      })
    }
    enqueueRecoverableControlPlaneSyncTask(
      {
        kind: 'workspace-summary',
        dedupeKey: `workspace-summary:${profile.id}`,
        profileId: profile.id,
        method: 'POST',
        pathName: `/api/config/profiles/${encodeURIComponent(profile.id)}/workspace-summary`,
        body: JSON.stringify({
          workspace: createPortableWorkspaceDescriptor(
            profile.workspace,
            profile.id,
            profile.fingerprintConfig,
          ),
          status: 'synced',
          message: '环境摘要已同步到云端',
          updatedAt: new Date().toISOString(),
        }),
      },
      error,
    )
    throw error
  }
}

async function createWorkspaceSnapshotForProfile(
  profileId: string,
  options: {
    syncToControlPlane?: boolean
  } = {},
): Promise<WorkspaceSnapshotRecord> {
  const syncToControlPlane = options.syncToControlPlane ?? true
  let profile = ensureWorkspaceLayoutForProfileId(profileId)
  const snapshot = await createWorkspaceSnapshot(profile, {
    storageStatePath: getProfileStorageStatePath(profileId),
    storageStateSource: getDesktopAuthState().authenticated ? 'desktop' : 'local-disk',
  })
  profile = persistProfile({
    ...profile,
    workspace: {
      ...profile.workspace!,
      snapshotSummary: {
        ...profile.workspace!.snapshotSummary,
        lastSnapshotId: snapshot.snapshotId,
        lastSnapshotAt: snapshot.createdAt,
      },
    },
  })
  if (syncToControlPlane) {
    void syncWorkspaceSummaryToControlPlane(profile).catch((error) => {
      audit('workspace_summary_sync_failed', {
        profileId,
        snapshotId: snapshot.snapshotId,
        err: error instanceof Error ? error.message : String(error),
      })
    })
    void syncWorkspaceSnapshotToControlPlane(snapshot).catch((error) => {
      audit('workspace_snapshot_sync_failed', {
        profileId,
        snapshotId: snapshot.snapshotId,
        err: error instanceof Error ? error.message : String(error),
      })
    })
  }
  return snapshot
}

async function listWorkspaceSnapshotsForProfile(profileId: string): Promise<WorkspaceSnapshotRecord[]> {
  const profile = ensureWorkspaceLayoutForProfileId(profileId)
  return listWorkspaceSnapshots(profile)
}

async function restoreWorkspaceSnapshotForProfile(
  profileId: string,
  snapshotId: string,
  recoveryReason = `restore:${snapshotId}`,
): Promise<ProfileRecord> {
  if (isProfileLaunchInFlight(profileId)) {
    audit('workspace_restore_blocked', {
      profileId,
      snapshotId,
      reason: 'profile-launch-in-flight',
    })
    throw new Error(`Cannot restore workspace snapshot while profile ${profileId} is queued or starting`)
  }
  await stopRuntime(profileId)
  const profile = ensureWorkspaceLayoutForProfileId(profileId)
  const restoreResult = await restoreWorkspaceSnapshotRecord(profile, snapshotId, {
    storageStatePath: getProfileStorageStatePath(profileId),
    recoveryReason,
    fetchRemoteSnapshot: fetchWorkspaceSnapshotFromControlPlane,
  })
  const persisted = persistProfile({
    ...restoreResult.profile,
    fingerprintConfig: {
      ...restoreResult.profile.fingerprintConfig,
      runtimeMetadata: {
        ...restoreResult.profile.fingerprintConfig.runtimeMetadata,
        lastStorageStateVersion: Number(restoreResult.snapshot.storageState.version || 0),
        lastStorageStateSyncedAt: String(restoreResult.snapshot.storageState.updatedAt || ''),
        lastStorageStateDeviceId: String(restoreResult.snapshot.storageState.deviceId || ''),
        lastStorageStateSyncStatus: 'synced',
        lastStorageStateSyncMessage: '已从 workspace snapshot 恢复登录态',
      },
    },
  })
  const recoveryResetReason = `Workspace recovery requires a fresh isolation preflight before trusted launch can resume.`
  const recoveredProfile = resetTrustAfterWorkspaceRecovery(persisted, {
    reason: recoveryResetReason,
  })
  const gateResult = validateWorkspaceGate(
    recoveredProfile,
    requireDatabase()
      .listProfiles()
      .map((item) => (item.id === recoveredProfile.id ? recoveredProfile : item)),
  )
  let gatedProfile = persistProfile({
    ...recoveredProfile,
    workspace: gateResult.workspace,
  })
  gatedProfile = await refreshLastKnownGoodSnapshotStatus(gatedProfile)
  const restoredSnapshot =
    (await getWorkspaceSnapshotById(gatedProfile, snapshotId)) ?? restoreResult.snapshot
  void syncWorkspaceSummaryToControlPlane(gatedProfile).catch((error) => {
    audit('workspace_restore_summary_sync_failed', {
      profileId,
      snapshotId,
      err: error instanceof Error ? error.message : String(error),
    })
  })
  void syncWorkspaceSnapshotToControlPlane(restoredSnapshot).catch((error) => {
    audit('workspace_restore_snapshot_sync_failed', {
      profileId,
      snapshotId,
      err: error instanceof Error ? error.message : String(error),
    })
  })
  if (gateResult.status === 'block') {
    audit('workspace_restore_validation_failed', {
      profileId,
      snapshotId,
      messages: gateResult.messages,
    })
    throw new Error(
      `Workspace snapshot ${snapshotId} was restored, but post-restore validation failed: ${gateResult.messages.join(' ')}`,
    )
  }
  audit('workspace_restore_succeeded', {
    profileId,
    snapshotId,
    gateStatus: gateResult.status,
  })
  return gatedProfile
}

async function rollbackWorkspaceSnapshotForProfile(profileId: string): Promise<ProfileRecord> {
  if (isProfileLaunchInFlight(profileId)) {
    audit('workspace_rollback_blocked', {
      profileId,
      reason: 'profile-launch-in-flight',
    })
    throw new Error(`Cannot roll back workspace snapshot while profile ${profileId} is queued or starting`)
  }
  await stopRuntime(profileId)
  const profile = ensureWorkspaceLayoutForProfileId(profileId)
  const rollbackResult = await rollbackWorkspaceToLastKnownGoodRecord(profile, {
    storageStatePath: getProfileStorageStatePath(profileId),
    fetchRemoteSnapshot: fetchWorkspaceSnapshotFromControlPlane,
  })
  const snapshotId = rollbackResult.snapshot.snapshotId
  const persisted = persistProfile({
    ...rollbackResult.profile,
    fingerprintConfig: {
      ...rollbackResult.profile.fingerprintConfig,
      runtimeMetadata: {
        ...rollbackResult.profile.fingerprintConfig.runtimeMetadata,
        lastStorageStateVersion: Number(rollbackResult.snapshot.storageState.version || 0),
        lastStorageStateSyncedAt: String(rollbackResult.snapshot.storageState.updatedAt || ''),
        lastStorageStateDeviceId: String(rollbackResult.snapshot.storageState.deviceId || ''),
        lastStorageStateSyncStatus: 'synced',
        lastStorageStateSyncMessage: '已回滚到 last known good snapshot 的登录态',
      },
    },
  })
  const recoveryResetReason = `Workspace rollback requires a fresh isolation preflight before trusted launch can resume.`
  const recoveredProfile = resetTrustAfterWorkspaceRecovery(persisted, {
    reason: recoveryResetReason,
  })
  const gateResult = validateWorkspaceGate(
    recoveredProfile,
    requireDatabase()
      .listProfiles()
      .map((item) => (item.id === recoveredProfile.id ? recoveredProfile : item)),
  )
  let gatedProfile = persistProfile({
    ...recoveredProfile,
    workspace: gateResult.workspace,
  })
  gatedProfile = await refreshLastKnownGoodSnapshotStatus(gatedProfile)
  const restoredSnapshot =
    (await getWorkspaceSnapshotById(gatedProfile, snapshotId)) ?? rollbackResult.snapshot
  void syncWorkspaceSummaryToControlPlane(gatedProfile).catch((error) => {
    audit('workspace_rollback_summary_sync_failed', {
      profileId,
      snapshotId,
      err: error instanceof Error ? error.message : String(error),
    })
  })
  void syncWorkspaceSnapshotToControlPlane(restoredSnapshot).catch((error) => {
    audit('workspace_rollback_snapshot_sync_failed', {
      profileId,
      snapshotId,
      err: error instanceof Error ? error.message : String(error),
    })
  })
  if (gateResult.status === 'block') {
    audit('workspace_rollback_validation_failed', {
      profileId,
      snapshotId,
      messages: gateResult.messages,
    })
    throw new Error(
      `Workspace snapshot ${snapshotId} was rolled back, but post-restore validation failed: ${gateResult.messages.join(' ')}`,
    )
  }
  audit('workspace_rollback_succeeded', {
    profileId,
    snapshotId,
    gateStatus: gateResult.status,
  })
  return gatedProfile
}

async function markWorkspaceSnapshotAsLastKnownGood(
  profileId: string,
  snapshotId: string,
  validatedAt: string,
): Promise<ProfileRecord | null> {
  let profile = requireDatabase().getProfileById(profileId)
  if (!profile?.workspace) {
    return null
  }
  if (
    profile.workspace.healthSummary.status !== 'healthy' ||
    profile.workspace.consistencySummary.status === 'block'
  ) {
    return profile
  }
  const currentStorageStateJson = await readProfileStorageStateFromDisk(profileId)
  const currentStorageState = {
    version: Number(profile.fingerprintConfig.runtimeMetadata.lastStorageStateVersion || 0),
    stateHash: currentStorageStateJson ? hashStorageState(currentStorageStateJson) : '',
    updatedAt: profile.fingerprintConfig.runtimeMetadata.lastStorageStateSyncedAt || '',
    deviceId: profile.fingerprintConfig.runtimeMetadata.lastStorageStateDeviceId || '',
    source: getDesktopAuthState().authenticated ? 'desktop' : 'local-disk',
  }
  const currentSnapshots = await listWorkspaceSnapshots(profile)
  const targetSnapshot = currentSnapshots.find((item) => item.snapshotId === snapshotId)
  if (!targetSnapshot || !doesWorkspaceSnapshotMatchProfile(targetSnapshot, profile, currentStorageState)) {
    return profile
  }
  const updatedSnapshot = await updateWorkspaceSnapshotValidation(profile, snapshotId, validatedAt)
  if (!updatedSnapshot) {
    return profile
  }
  profile = persistProfile({
    ...profile,
    workspace: {
      ...profile.workspace,
      snapshotSummary: {
        ...profile.workspace.snapshotSummary,
        lastSnapshotId: updatedSnapshot.snapshotId,
        lastSnapshotAt: updatedSnapshot.createdAt,
        lastKnownGoodSnapshotId: updatedSnapshot.snapshotId,
        lastKnownGoodSnapshotAt: validatedAt,
        lastKnownGoodStatus: 'valid',
        lastKnownGoodInvalidatedAt: '',
        lastKnownGoodInvalidationReason: '',
      },
    },
  })
  void syncWorkspaceSummaryToControlPlane(profile).catch((error) => {
    audit('workspace_summary_mark_good_sync_failed', {
      profileId,
      snapshotId,
      err: error instanceof Error ? error.message : String(error),
    })
  })
  void syncWorkspaceSnapshotToControlPlane(updatedSnapshot).catch((error) => {
    audit('workspace_snapshot_mark_good_sync_failed', {
      profileId,
      snapshotId,
      err: error instanceof Error ? error.message : String(error),
    })
  })
  return profile
}

async function refreshLastKnownGoodSnapshotStatus(profile: ProfileRecord): Promise<ProfileRecord> {
  if (!profile.workspace) {
    return profile
  }
  const currentStorageStateJson = await readProfileStorageStateFromDisk(profile.id)
  const currentStorageState = {
    version: Number(profile.fingerprintConfig.runtimeMetadata.lastStorageStateVersion || 0),
    stateHash: currentStorageStateJson ? hashStorageState(currentStorageStateJson) : '',
    updatedAt: profile.fingerprintConfig.runtimeMetadata.lastStorageStateSyncedAt || '',
    deviceId: profile.fingerprintConfig.runtimeMetadata.lastStorageStateDeviceId || '',
    source: getDesktopAuthState().authenticated ? 'desktop' : 'local-disk',
  }
  let assessment: Awaited<ReturnType<typeof evaluateLastKnownGoodSnapshot>>
  try {
    assessment = await evaluateLastKnownGoodSnapshot(profile, {
      storageState: currentStorageState,
      fetchRemoteSnapshot: fetchWorkspaceSnapshotFromControlPlane,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    audit('workspace_snapshot_refresh_warning', {
      profileId: profile.id,
      err: message,
    })
    logEvent(
      'warn',
      'runtime',
      buildSyncWarningMessage('workspaceSnapshot', message),
      profile.id,
    )
    return updateRuntimeMetadata(profile, {
      lastWorkspaceSnapshotSyncStatus: 'error',
      lastWorkspaceSnapshotSyncMessage: buildSyncWarningMessage('workspaceSnapshot', message),
    })
  }
  const nextSnapshotSummary =
    assessment.status === 'invalid'
      ? applyLastKnownGoodAssessment(profile.workspace.snapshotSummary, {
          status: 'invalid',
          reason: assessment.reason,
          invalidatedAt: new Date().toISOString(),
        })
      : applyLastKnownGoodAssessment(profile.workspace.snapshotSummary, {
          status: assessment.status,
          reason: assessment.reason,
        })
  const changed =
    nextSnapshotSummary.lastKnownGoodStatus !== profile.workspace.snapshotSummary.lastKnownGoodStatus ||
    nextSnapshotSummary.lastKnownGoodInvalidatedAt !== profile.workspace.snapshotSummary.lastKnownGoodInvalidatedAt ||
    nextSnapshotSummary.lastKnownGoodInvalidationReason !==
      profile.workspace.snapshotSummary.lastKnownGoodInvalidationReason
  if (!changed) {
    return profile
  }
  const persisted = persistProfile({
    ...profile,
    workspace: {
      ...profile.workspace,
      snapshotSummary: nextSnapshotSummary,
    },
  })
  void syncWorkspaceSummaryToControlPlane(persisted).catch((error) => {
    audit('workspace_summary_refresh_good_sync_failed', {
      profileId: profile.id,
      err: error instanceof Error ? error.message : String(error),
    })
  })
  return persisted
}

async function finalizeRuntimeShutdown(
  profileId: string,
  reason: StorageStateUploadReason,
): Promise<void> {
  const context = runtimeContexts.get(profileId)
  clearProfileStorageSyncTimer(profileId)
  if (context) {
    runtimeShutdownFinalizing.add(profileId)
  }

  try {
    if (context) {
      try {
        await saveProfileStorageStateToDisk(profileId, context)
      } catch (error) {
        audit('shutdown_storage_save_failed', {
          profileId,
          reason,
          err: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const latestProfileBeforeConfigSync = requireDatabase().getProfileById(profileId)
    let profileConfigReadyForRuntimeArtifacts = true
    if (latestProfileBeforeConfigSync && hasPendingProfileConfigChanges(profileId)) {
      try {
        const result = await pushProfileConfigToControlPlane(profileId, `runtime-shutdown:${reason}`)
        const latestMetadata =
          requireDatabase().getProfileById(profileId)?.fingerprintConfig.runtimeMetadata ||
          latestProfileBeforeConfigSync.fingerprintConfig.runtimeMetadata
        profileConfigReadyForRuntimeArtifacts =
          latestMetadata.lastEnvironmentSyncStatus === 'synced'
        if (!profileConfigReadyForRuntimeArtifacts) {
          audit('shutdown_runtime_artifacts_skipped', {
            profileId,
            reason,
            message: result.warningMessage || result.message || latestMetadata.lastEnvironmentSyncMessage,
          })
        }
      } catch (error) {
        profileConfigReadyForRuntimeArtifacts = false
        audit('shutdown_config_sync_failed', {
          profileId,
          reason,
          err: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const latestProfile = requireDatabase().getProfileById(profileId)
    if (latestProfile?.workspace && profileConfigReadyForRuntimeArtifacts) {
      try {
        await syncWorkspaceSummaryToControlPlane(latestProfile)
      } catch (error) {
        audit('shutdown_workspace_summary_sync_failed', {
          profileId,
          reason,
          err: error instanceof Error ? error.message : String(error),
        })
      }
      try {
        const snapshot = await createWorkspaceSnapshotForProfile(profileId, {
          syncToControlPlane: false,
        })
        await syncWorkspaceSnapshotToControlPlane(snapshot)
      } catch (error) {
        audit('shutdown_workspace_snapshot_sync_failed', {
          profileId,
          reason,
          err: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (context) {
      try {
        await uploadProfileStorageStateToControlPlane(profileId, {
          context,
          reason,
        })
      } catch (error) {
        audit('shutdown_storage_upload_failed', {
          profileId,
          reason,
          err: error instanceof Error ? error.message : String(error),
        })
      }
    }

    runtimeContexts.delete(profileId)
    try {
      if (context) {
        await context.close()
      }
    } catch (error) {
      audit('shutdown_context_close_failed', {
        profileId,
        reason,
        err: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      await runtimeHostManager.stopEnvironment(profileId)
    } catch (error) {
      audit('shutdown_runtime_host_stop_failed', {
        profileId,
        reason,
        err: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      await releaseProfileRuntimeLock(profileId)
    } catch (error) {
      audit('shutdown_runtime_lock_release_failed', {
        profileId,
        reason,
        err: error instanceof Error ? error.message : String(error),
      })
    }

    scheduler.markStopped(profileId)
    await updateProfileStatus(profileId, 'stopped')
  } finally {
    runtimeShutdownFinalizing.delete(profileId)
  }
}

async function gracefulShutdownHandler(signalOrErr?: unknown) {
  if (gracefulShutdownInFlight) {
    return
  }
  gracefulShutdownInFlight = true
  const exitCode = signalOrErr ? 1 : 0
  const hardExitTimer = setTimeout(() => {
    audit('process_shutdown_forced_exit', { info: String(signalOrErr || ''), exitCode })
    process.exit(exitCode)
  }, 4_000)
  try {
    audit('process_shutdown_begin', { info: String(signalOrErr || '') })
    console.log('Graceful shutdown: saving sessions...')
    for (const profileId of [...runtimeContexts.keys()]) {
      await finalizeRuntimeShutdown(profileId, 'graceful-shutdown')
    }
  } catch (error) {
    console.error('graceful shutdown save failed', error)
  } finally {
    clearTimeout(hardExitTimer)
    audit('process_shutdown_end', { info: String(signalOrErr || '') })
    setTimeout(() => process.exit(exitCode), 150)
  }
}

process.on('SIGINT', () => {
  console.log('SIGINT')
  traceStartup('signal_sigint')
  void gracefulShutdownHandler('SIGINT')
})
process.on('SIGTERM', () => {
  console.log('SIGTERM')
  traceStartup('signal_sigterm')
  void gracefulShutdownHandler('SIGTERM')
})
process.on('uncaughtException', (error) => {
  console.error('uncaughtException', error)
  const classification = classifyRecoverableGlobalNetworkError(error)
  const diagnostics = buildGlobalErrorDiagnostics(error, classification)
  traceStartup('uncaught_exception', diagnostics)
  audit('global_uncaught_exception_detail', diagnostics)
  if (isRecoverableControlPlaneError(error)) {
    audit('global_shutdown_skipped_recoverable_network_error', {
      source: 'uncaughtException',
      code: error.code,
      method: error.method,
      input: error.input,
      err: error.message,
    })
    return
  }
  if (isRecoverableAgentNetworkError(error)) {
    audit('agent_network_global_shutdown_skipped', {
      source: 'uncaughtException',
      code: error.code,
      method: error.method,
      path: error.path,
      err: error.message,
    })
    return
  }
  if (classification.recoverable) {
    handleRecoverableGlobalNetworkError(error, 'uncaughtException', classification)
    return
  }
  void gracefulShutdownHandler(error)
})
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason)
  const classification = classifyRecoverableGlobalNetworkError(reason)
  const diagnostics = buildGlobalErrorDiagnostics(reason, classification)
  traceStartup('unhandled_rejection', diagnostics)
  audit('global_uncaught_exception_detail', {
    source: 'unhandledRejection',
    ...diagnostics,
  })
  if (isRecoverableControlPlaneError(reason)) {
    audit('global_shutdown_skipped_recoverable_network_error', {
      source: 'unhandledRejection',
      code: reason.code,
      method: reason.method,
      input: reason.input,
      err: reason.message,
    })
    return
  }
  if (isRecoverableAgentNetworkError(reason)) {
    audit('agent_network_global_shutdown_skipped', {
      source: 'unhandledRejection',
      code: reason.code,
      method: reason.method,
      path: reason.path,
      err: reason.message,
    })
    return
  }
  if (classification.recoverable) {
    handleRecoverableGlobalNetworkError(reason, 'unhandledRejection', classification)
    return
  }
  void gracefulShutdownHandler(reason)
})

console.log('Runtime audit log:', AUDIT_LOG_PATH)
traceStartup('module_loaded', {
  auditLogPath: AUDIT_LOG_PATH,
  cwd: process.cwd(),
  packaged: app.isPackaged,
})

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
const BUILD_MARKER = (() => {
  try {
    const appPath = app.getAppPath()
    const targetPath = appPath.endsWith('.asar') ? appPath : path.join(appPath, 'package.json')
    const stats = statSync(targetPath)
    return `${path.basename(targetPath)}:${stats.size}:${Math.floor(stats.mtimeMs).toString(36)}`
  } catch {
    return 'build-marker-unavailable'
  }
})()
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
  'runtime.open-platform',
  'runtime.getStatus',
  'profile.verify',
  'workspace.snapshot',
  'workspace.restore',
  'logs.list',
  'logs.clear',
  'settings.get',
  'settings.set',
  'data.previewBundle',
  'data.exportBundle',
  'data.importBundle',
  'updater.getState',
  'updater.check',
  'updater.download',
  'updater.install',
  'updater.openReleasePage',
]

function isAutoUpdateSupportedPlatform(): boolean {
  return process.platform === 'darwin' || process.platform === 'win32'
}

function supportsAutoUpdate(): boolean {
  return app.isPackaged && isAutoUpdateSupportedPlatform()
}

function isPrereleaseVersion(input: string): boolean {
  return String(input || '').trim().includes('-')
}

function normalizeUpdateAssetName(input: string | null | undefined): string {
  const normalized = String(input || '').trim()
  if (!normalized) {
    return ''
  }
  try {
    return path.basename(new URL(normalized).pathname)
  } catch {
    return path.basename(normalized.split('?')[0] || normalized)
  }
}

function resolveUpdateMetadata(info: UpdateInfo | null | undefined): Pick<
  DesktopUpdateState,
  'latestVersion' | 'isPrereleaseCandidate' | 'releaseName' | 'publishedAt' | 'assetName' | 'releaseUrl'
> {
  const latestVersion = String(info?.version || '').trim() || null
  return {
    latestVersion,
    isPrereleaseCandidate: latestVersion ? isPrereleaseVersion(latestVersion) : false,
    releaseName: String(info?.releaseName || latestVersion || ''),
    publishedAt: info?.releaseDate || null,
    assetName: normalizeUpdateAssetName(info?.files?.[0]?.url || info?.path || ''),
    releaseUrl: DESKTOP_RELEASES_PAGE,
  }
}

function buildAutoUpdateFailureMessage(detail: string): string {
  const normalized = String(detail || '').trim()
  return normalized
    ? `自动更新失败，已回退到发布页手动安装：${normalized}`
    : '自动更新失败，已回退到发布页手动安装。'
}

let updaterInitialized = false
let updateState: DesktopUpdateState = {
  supported: supportsAutoUpdate(),
  status: supportsAutoUpdate() ? 'idle' : 'unsupported',
  currentVersion: app.getVersion(),
  latestVersion: null,
  attentionVersion: null,
  attentionRequired: false,
  canAutoInstall: supportsAutoUpdate(),
  fallbackToManual: false,
  isPrereleaseCandidate: false,
  releaseName: '',
  publishedAt: null,
  releaseUrl: DESKTOP_RELEASES_PAGE,
  assetName: '',
  downloadedFile: '',
  progressPercent: 0,
  message: supportsAutoUpdate() ? '' : '仅打包后的桌面端支持自动更新检测',
  checkedAt: null,
}
let updateCheckPromise: Promise<DesktopUpdateState> | null = null
let updateDownloadPromise: Promise<DesktopUpdateState> | null = null

function emitUpdateState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  mainWindow.webContents.send('updater.state', updateState)
}

function setUpdateState(next: Partial<DesktopUpdateState>): DesktopUpdateState {
  updateState = {
    ...updateState,
    currentVersion: app.getVersion(),
    ...next,
  }
  emitUpdateState()
  return updateState
}

function setUpdateInfoState(info: UpdateInfo | null | undefined, next: Partial<DesktopUpdateState>): DesktopUpdateState {
  return setUpdateState({
    ...resolveUpdateMetadata(info),
    ...next,
  })
}

function setAutoUpdateErrorState(detail: string): DesktopUpdateState {
  audit('update_auto_failed', { error: detail })
  return setUpdateState({
    status: 'error',
    attentionRequired: false,
    attentionVersion: null,
    canAutoInstall: false,
    fallbackToManual: true,
    progressPercent: 0,
    checkedAt: new Date().toISOString(),
    message: buildAutoUpdateFailureMessage(detail),
  })
}

function initAutoUpdater(): void {
  if (updaterInitialized || !supportsAutoUpdate()) {
    return
  }
  updaterInitialized = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoRunAppAfterInstall = true
  autoUpdater.allowPrerelease = isPrereleaseVersion(app.getVersion())
  autoUpdater.allowDowngrade = autoUpdater.allowPrerelease
  autoUpdater.on('checking-for-update', () => {
    setUpdateState({
      supported: true,
      status: 'checking',
      attentionRequired: false,
      canAutoInstall: true,
      fallbackToManual: false,
      downloadedFile: '',
      progressPercent: 0,
      message: '正在检查更新',
    })
  })
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    setUpdateInfoState(info, {
      supported: true,
      status: 'not-available',
      attentionVersion: null,
      attentionRequired: false,
      canAutoInstall: true,
      fallbackToManual: false,
      downloadedFile: '',
      progressPercent: 100,
      checkedAt: new Date().toISOString(),
      message: '当前已是最新版本',
    })
  })
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    const metadata = resolveUpdateMetadata(info)
    setUpdateState({
      ...metadata,
      supported: true,
      status: 'available',
      attentionVersion: metadata.latestVersion,
      attentionRequired: true,
      canAutoInstall: true,
      fallbackToManual: false,
      downloadedFile: '',
      progressPercent: 0,
      checkedAt: new Date().toISOString(),
      message: metadata.latestVersion
        ? `发现${metadata.isPrereleaseCandidate ? '测试版' : '新'}版本 ${metadata.latestVersion}`
        : '发现新版本，可立即下载',
    })
  })
  autoUpdater.on('download-progress', (info: ProgressInfo) => {
    const progressPercent = Math.max(1, Math.min(100, Math.round(info.percent || 0)))
    setUpdateState({
      status: 'downloading',
      attentionRequired: false,
      canAutoInstall: true,
      fallbackToManual: false,
      progressPercent,
      message: `正在下载更新 ${progressPercent}%`,
    })
  })
  autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
    setUpdateInfoState(event, {
      supported: true,
      status: 'downloaded',
      attentionRequired: false,
      attentionVersion: event.version,
      canAutoInstall: true,
      fallbackToManual: false,
      downloadedFile: event.downloadedFile,
      progressPercent: 100,
      checkedAt: new Date().toISOString(),
      message: '更新已下载完成，点击下方按钮重启并安装。',
    })
  })
  autoUpdater.on('error', (error: Error, message?: string) => {
    const detail = String(message || error.message || error).trim()
    setAutoUpdateErrorState(detail)
  })
}

async function checkForDesktopUpdates(options: { silent?: boolean } = {}): Promise<DesktopUpdateState> {
  if (!supportsAutoUpdate()) {
    return setUpdateState({
      supported: false,
      status: 'unsupported',
      attentionRequired: false,
      canAutoInstall: false,
      fallbackToManual: false,
      attentionVersion: null,
      isPrereleaseCandidate: false,
      message: '仅打包后的桌面端支持自动更新检测',
    })
  }
  initAutoUpdater()
  if (updateCheckPromise) {
    return updateCheckPromise
  }
  updateCheckPromise = (async () => {
    const now = Date.now()
    const lastChecked = updateState.checkedAt ? new Date(updateState.checkedAt).getTime() : 0
    if (options.silent && lastChecked > 0 && now - lastChecked < UPDATE_CHECK_MIN_INTERVAL_MS) {
      return updateState
    }
    try {
      setUpdateState({
        status: 'checking',
        progressPercent: 0,
        message: options.silent ? '后台检查更新中' : '正在检查更新',
      })
      const result = await autoUpdater.checkForUpdates()
      if (!result) {
        return updateState
      }
      return updateState
    } catch (error) {
      return setAutoUpdateErrorState(error instanceof Error ? error.message : String(error))
    } finally {
      updateCheckPromise = null
    }
  })()
  return updateCheckPromise
}

async function downloadDesktopUpdate(): Promise<DesktopUpdateState> {
  if (!supportsAutoUpdate()) {
    return setUpdateState({
      supported: false,
      status: 'unsupported',
      attentionRequired: false,
      canAutoInstall: false,
      fallbackToManual: false,
      attentionVersion: null,
      isPrereleaseCandidate: false,
      message: '仅打包后的桌面端支持自动更新检测',
    })
  }
  initAutoUpdater()
  if (updateDownloadPromise) {
    return updateDownloadPromise
  }
  updateDownloadPromise = (async () => {
    try {
      if (updateState.status !== 'available' || !updateState.latestVersion) {
        await checkForDesktopUpdates()
      }
      if (updateState.status !== 'available') {
        return updateState
      }
      setUpdateState({
        status: 'downloading',
        attentionRequired: false,
        canAutoInstall: true,
        fallbackToManual: false,
        downloadedFile: '',
        progressPercent: 0,
        message: updateState.assetName ? `正在下载更新 ${updateState.assetName}` : '正在下载更新',
      })
      await autoUpdater.downloadUpdate()
      return updateState
    } catch (error) {
      return setAutoUpdateErrorState(error instanceof Error ? error.message : String(error))
    } finally {
      updateDownloadPromise = null
    }
  })()
  return updateDownloadPromise
}

async function installDownloadedUpdate(): Promise<{ success: boolean; message: string }> {
  if (updateState.fallbackToManual || !updateState.canAutoInstall) {
    await shell.openExternal(updateState.releaseUrl || DESKTOP_RELEASES_PAGE)
    return { success: true, message: '自动安装不可用，已打开发布页，请手动安装最新版本。' }
  }
  if (updateState.status !== 'downloaded') {
    throw new Error('更新尚未下载完成')
  }
  setUpdateState({
    attentionRequired: false,
  })
  audit('update_install_start', { downloadedFile: updateState.downloadedFile, platform: process.platform })
  autoUpdater.quitAndInstall(false, true)
  return {
    success: true,
    message: '应用即将退出并安装更新。',
  }
}

function requireDatabase(): DatabaseService {
  if (!db) {
    throw new Error('Database is not initialized')
  }
  return db
}

function migrateStableHardwareFingerprintsOnStartup(): void {
  const database = requireDatabase()

  for (const profile of database.listProfiles()) {
    if (!shouldMigrateStableHardwareFingerprint(profile.fingerprintConfig)) {
      continue
    }
    const fingerprintConfig = assignStableHardwareFingerprint(profile.fingerprintConfig, profile.id)
    database.updateProfile({
      id: profile.id,
      name: profile.name,
      proxyId: profile.proxyId,
      groupName: profile.groupName,
      tags: profile.tags,
      notes: profile.notes,
      environmentPurpose: profile.environmentPurpose,
      fingerprintConfig,
      workspace: profile.workspace,
    })
  }

  for (const template of database.listTemplates()) {
    const fingerprintConfig = sanitizeTemplateHardwareFingerprint(template.fingerprintConfig)
    if (JSON.stringify(fingerprintConfig) === JSON.stringify(template.fingerprintConfig)) {
      continue
    }
    database.updateTemplate({
      id: template.id,
      name: template.name,
      proxyId: template.proxyId,
      groupName: template.groupName,
      environmentPurpose: template.environmentPurpose,
      tags: template.tags,
      notes: template.notes,
      fingerprintConfig,
      workspaceTemplate: template.workspaceTemplate,
    })
  }
}

function getSettingValue(key: string, fallback = ''): string {
  return requireDatabase().getSettings()[key] || fallback
}

function getControlPlaneApiBase(): string {
  if (sessionAuthApiBase) {
    return sessionAuthApiBase.replace(/\/$/, '')
  }
  return (
    getSettingValue(CONTROL_PLANE_API_BASE_KEY) ||
    DEFAULT_CONTROL_PLANE_API_BASE
  ).replace(/\/$/, '')
}

function shouldRememberCredentials(): boolean {
  return getSettingValue(CONTROL_PLANE_REMEMBER_CREDENTIALS_KEY).trim() === '1'
}

function getRememberedCredentials(): {
  rememberCredentials: boolean
  identifier: string
  password: string
} {
  if (!shouldRememberCredentials()) {
    return {
      rememberCredentials: false,
      identifier: '',
      password: '',
    }
  }
  return {
    rememberCredentials: true,
    identifier: getSettingValue(CONTROL_PLANE_AUTH_IDENTIFIER_KEY).trim(),
    password: getSettingValue(CONTROL_PLANE_AUTH_PASSWORD_KEY),
  }
}

function getStoredAuthToken(): string {
  if (sessionAuthToken) {
    return sessionAuthToken
  }
  return ''
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
  if (sessionAuthUser) {
    return sessionAuthUser
  }
  return null
}

function getDesktopAuthState(): DesktopAuthState {
  const user = getStoredAuthUser()
  const remembered = getRememberedCredentials()
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
    rememberCredentials: remembered.rememberCredentials,
    rememberedIdentifier: remembered.identifier,
    rememberedPassword: remembered.password,
    lastEnvironmentSyncResult,
    lastGlobalConfigSyncResult,
  }
}

function resolveControlPlaneSyncQueuePath(): string {
  return path.join(app.getPath('userData'), CONTROL_PLANE_SYNC_QUEUE_FILE)
}

function isControlPlaneNetworkErrorMessage(message: string): boolean {
  return isRecoverableNetworkFailure({ message })
}

function createControlPlaneRequestError(
  input: string,
  method: string,
  error: unknown,
  status?: number,
  responseBody?: string,
): ControlPlaneRequestError {
  const originalMessage = error instanceof Error ? error.message : String(error)
  const normalizedCode =
    (error instanceof Error && 'code' in error && typeof error.code === 'string' && error.code) ||
    (status && status >= 500 ? `HTTP_${status}` : 'CONTROL_PLANE_REQUEST_FAILED')
  const requestError = new Error(originalMessage) as ControlPlaneRequestError
  requestError.name = 'ControlPlaneRequestError'
  requestError.input = input
  requestError.method = method
  requestError.status = status
  requestError.code = normalizedCode
  requestError.responseBody = responseBody
  requestError.recoverable =
    (typeof status === 'number' && status >= 500) || isControlPlaneNetworkErrorMessage(originalMessage)
  return requestError
}

function isRecoverableControlPlaneError(error: unknown): error is ControlPlaneRequestError {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name?: string }).name === 'ControlPlaneRequestError' &&
      'recoverable' in error &&
      (error as { recoverable?: boolean }).recoverable === true,
  )
}

function refreshProfilesPendingSyncKinds(): void {
  const pendingKindsByProfile = new Map<string, Set<PendingSyncKind>>()
  for (const task of controlPlaneSyncTasks) {
    if (!task.profileId) {
      continue
    }
    const kinds = pendingKindsByProfile.get(task.profileId) ?? new Set<PendingSyncKind>()
    kinds.add(task.kind)
    pendingKindsByProfile.set(task.profileId, kinds)
  }
  for (const profile of requireDatabase().listProfiles()) {
    const nextKinds = [...(pendingKindsByProfile.get(profile.id) ?? new Set<PendingSyncKind>())]
    const currentKinds = profile.fingerprintConfig.runtimeMetadata.pendingSyncKinds ?? []
    if (JSON.stringify(currentKinds) === JSON.stringify(nextKinds)) {
      continue
    }
    updateRuntimeMetadata(profile, {
      pendingSyncKinds: nextKinds,
    })
  }
}

function persistControlPlaneSyncTasks(): void {
  if (!controlPlaneSyncTasksLoaded) {
    return
  }
  try {
    writeFileSync(
      resolveControlPlaneSyncQueuePath(),
      JSON.stringify(controlPlaneSyncTasks, null, 2),
      'utf8',
    )
  } catch (error) {
    audit('control_plane_sync_queue_persist_failed', {
      err: error instanceof Error ? error.message : String(error),
    })
  }
  refreshProfilesPendingSyncKinds()
  emitConfigChanged()
}

function loadControlPlaneSyncTasks(): void {
  if (controlPlaneSyncTasksLoaded) {
    return
  }
  controlPlaneSyncTasksLoaded = true
  try {
    const queuePath = resolveControlPlaneSyncQueuePath()
    if (!existsSync(queuePath)) {
      controlPlaneSyncTasks = []
      refreshProfilesPendingSyncKinds()
      return
    }
    const raw = readFileSync(queuePath, 'utf8')
    const parsed = JSON.parse(raw) as ControlPlaneSyncTask[]
    controlPlaneSyncTasks = Array.isArray(parsed)
      ? parsed.filter((item) =>
          item &&
          typeof item === 'object' &&
          typeof item.kind === 'string' &&
          typeof item.dedupeKey === 'string' &&
          typeof item.method === 'string' &&
          typeof item.pathName === 'string' &&
          typeof item.body === 'string',
        )
      : []
  } catch (error) {
    controlPlaneSyncTasks = []
    audit('control_plane_sync_queue_load_failed', {
      err: error instanceof Error ? error.message : String(error),
    })
  }
  if (controlPlaneSyncTasks.length > 0 && controlPlaneConnectivityState.status === 'online') {
    controlPlaneConnectivityState = {
      ...controlPlaneConnectivityState,
      status: 'degraded',
    }
  }
  refreshProfilesPendingSyncKinds()
}

function getControlPlanePendingSyncCount(): number {
  loadControlPlaneSyncTasks()
  return controlPlaneSyncTasks.length
}

function updateControlPlaneRecoveryUiState(
  recoveryState: NonNullable<RuntimeHostInfo['controlPlaneRecoveryState']>,
  nextRetryAt = '',
): void {
  const changed = controlPlaneRecoveryState !== recoveryState || controlPlaneNextRetryAt !== nextRetryAt
  controlPlaneRecoveryState = recoveryState
  controlPlaneNextRetryAt = nextRetryAt
  if (changed) {
    emitConfigChanged()
  }
}

function markControlPlaneGlobalNetworkDegraded(
  classification: RecoverableGlobalNetworkErrorClassification,
): void {
  const previousStatus = controlPlaneConnectivityState.status
  const nextFailures = controlPlaneConnectivityState.consecutiveFailures + 1
  const now = new Date().toISOString()
  controlPlaneConnectivityState = {
    status: nextFailures >= CONTROL_PLANE_OFFLINE_FAILURE_THRESHOLD ? 'offline' : 'degraded',
    lastError: classification.message,
    lastErrorAt: now,
    lastSuccessAt: controlPlaneConnectivityState.lastSuccessAt,
    consecutiveFailures: nextFailures,
  }
  if (previousStatus !== controlPlaneConnectivityState.status) {
    emitConfigChanged()
  }
}

function markControlPlaneRecoverableFailure(error: ControlPlaneRequestError): void {
  const previousStatus = controlPlaneConnectivityState.status
  const nextFailures = controlPlaneConnectivityState.consecutiveFailures + 1
  const now = new Date().toISOString()
  controlPlaneConnectivityState = {
    status: nextFailures >= CONTROL_PLANE_OFFLINE_FAILURE_THRESHOLD ? 'offline' : 'degraded',
    lastError: error.message,
    lastErrorAt: now,
    lastSuccessAt: controlPlaneConnectivityState.lastSuccessAt,
    consecutiveFailures: nextFailures,
  }
  audit('control_plane_request_recoverable_error', {
    code: error.code,
    method: error.method,
    input: error.input,
    status: error.status ?? 0,
    err: error.message,
    consecutiveFailures: nextFailures,
  })
  if (previousStatus !== controlPlaneConnectivityState.status) {
    emitConfigChanged()
  }
}

function markControlPlaneSuccess(): void {
  loadControlPlaneSyncTasks()
  const wasRecovering = controlPlaneConnectivityState.status !== 'online'
  controlPlaneConnectivityState = {
    status: getControlPlanePendingSyncCount() > 0 ? 'degraded' : 'online',
    lastError: controlPlaneConnectivityState.lastError,
    lastErrorAt: controlPlaneConnectivityState.lastErrorAt,
    lastSuccessAt: new Date().toISOString(),
    consecutiveFailures: 0,
  }
  if (globalNetworkRecoveryState.recoveryState !== 'idle') {
    audit('global_network_recovery_succeeded', {
      target: 'control-plane',
      consecutiveFailures: globalNetworkRecoveryState.consecutiveFailures,
      lastSignature: globalNetworkRecoveryState.lastSignature,
    })
    resetGlobalNetworkRecoveryState()
  }
  if (wasRecovering) {
    audit('control_plane_sync_recovered', {
      pendingSyncCount: getControlPlanePendingSyncCount(),
      lastError: controlPlaneConnectivityState.lastError,
    })
    emitConfigChanged()
  }
}

function scheduleControlPlaneSyncRetry(delayMs = CONTROL_PLANE_SYNC_RETRY_BASE_MS): void {
  if (controlPlaneSyncRetryTimer) {
    clearTimeout(controlPlaneSyncRetryTimer)
  }
  controlPlaneSyncRetryTimer = setTimeout(() => {
    controlPlaneSyncRetryTimer = null
    if (globalNetworkRecoveryState.recoveryState !== 'idle') {
      updateControlPlaneRecoveryUiState('reconnecting')
    }
    void flushPendingControlPlaneSyncTasks()
  }, delayMs)
}

async function probeControlPlaneRecovery(): Promise<void> {
  if (!getDesktopAuthState().authenticated) {
    return
  }
  if (getControlPlanePendingSyncCount() > 0) {
    await flushPendingControlPlaneSyncTasks()
    return
  }
  await requestControlPlane('/api/auth/me', {
    method: 'GET',
  })
}

function scheduleGlobalNetworkRecovery(
  classification: RecoverableGlobalNetworkErrorClassification,
  source: GlobalRecoverySource,
): void {
  const nowMs = Date.now()
  const lastSeenMs = globalNetworkRecoveryState.lastSeenAt
    ? new Date(globalNetworkRecoveryState.lastSeenAt).getTime()
    : 0
  const isDuplicateWithinWindow =
    globalNetworkRecoveryState.lastSignature === classification.signature &&
    lastSeenMs > 0 &&
    nowMs - lastSeenMs <= GLOBAL_NETWORK_RECOVERY_MERGE_WINDOW_MS
  const nextFailures =
    globalNetworkRecoveryState.lastSignature === classification.signature
      ? globalNetworkRecoveryState.consecutiveFailures + 1
      : 1
  if (isDuplicateWithinWindow) {
    globalNetworkRecoveryState = {
      ...globalNetworkRecoveryState,
      lastSeenAt: new Date(nowMs).toISOString(),
      consecutiveFailures: nextFailures,
    }
    audit('global_network_recovery_suppressed', {
      source,
      signature: classification.signature,
      code: classification.code,
      causeCode: classification.causeCode,
      message: classification.message,
      consecutiveFailures: nextFailures,
      nextRetryAt: globalNetworkRecoveryState.nextRetryAt,
    })
    return
  }

  const delayMs = getGlobalNetworkRecoveryDelay(nextFailures)
  const nextRetryAt = new Date(nowMs + delayMs).toISOString()
  const existingNextRetryMs = globalNetworkRecoveryState.nextRetryAt
    ? new Date(globalNetworkRecoveryState.nextRetryAt).getTime()
    : Number.POSITIVE_INFINITY
  const keepExistingEarlierTimer =
    globalNetworkRecoveryState.timer !== null && existingNextRetryMs <= nowMs + delayMs

  globalNetworkRecoveryState = {
    ...globalNetworkRecoveryState,
    lastSignature: classification.signature,
    lastSeenAt: new Date(nowMs).toISOString(),
    consecutiveFailures: nextFailures,
    nextRetryDelayMs: keepExistingEarlierTimer
      ? globalNetworkRecoveryState.nextRetryDelayMs
      : delayMs,
    nextRetryAt: keepExistingEarlierTimer ? globalNetworkRecoveryState.nextRetryAt : nextRetryAt,
    recoveryState: 'scheduled',
  }
  updateControlPlaneRecoveryUiState(
    'scheduled',
    keepExistingEarlierTimer ? globalNetworkRecoveryState.nextRetryAt : nextRetryAt,
  )
  if (keepExistingEarlierTimer) {
    audit('global_network_recovery_suppressed', {
      source,
      signature: classification.signature,
      code: classification.code,
      causeCode: classification.causeCode,
      message: classification.message,
      consecutiveFailures: nextFailures,
      nextRetryAt: globalNetworkRecoveryState.nextRetryAt,
      reason: 'existing-earlier-timer',
    })
    return
  }

  if (globalNetworkRecoveryState.timer) {
    clearTimeout(globalNetworkRecoveryState.timer)
  }
  globalNetworkRecoveryState.timer = setTimeout(() => {
    globalNetworkRecoveryState = {
      ...globalNetworkRecoveryState,
      timer: null,
      recoveryState: 'reconnecting',
    }
    updateControlPlaneRecoveryUiState('reconnecting')
    void (async () => {
      try {
        await probeControlPlaneRecovery()
        if (!getDesktopAuthState().authenticated) {
          audit('global_network_recovery_succeeded', {
            target: 'agent-only',
            consecutiveFailures: globalNetworkRecoveryState.consecutiveFailures,
            lastSignature: globalNetworkRecoveryState.lastSignature,
          })
          resetGlobalNetworkRecoveryState()
        }
      } catch (error) {
        if (isRecoverableControlPlaneError(error)) {
          scheduleGlobalNetworkRecovery(
            classifyRecoverableGlobalNetworkError(error),
            'recoveryTimer',
          )
          return
        }
        audit('global_network_recovery_suppressed', {
          source: 'recoveryTimer',
          signature: classification.signature,
          code:
            error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
              ? error.code
              : '',
          message: error instanceof Error ? error.message : String(error),
          consecutiveFailures: globalNetworkRecoveryState.consecutiveFailures,
          reason: 'nonrecoverable-probe-error',
        })
        resetGlobalNetworkRecoveryState()
      }
    })()
  }, delayMs)
  audit('global_network_reconnect_scheduled', {
    source,
    signature: classification.signature,
    code: classification.code,
    causeCode: classification.causeCode,
    message: classification.message,
    matchedBy: classification.matchedBy,
    stackHint: classification.stackHint,
    consecutiveFailures: nextFailures,
    delayMs,
    nextRetryAt,
  })
}

function handleRecoverableGlobalNetworkError(
  error: unknown,
  source: GlobalRecoverySource,
  classification: RecoverableGlobalNetworkErrorClassification,
): void {
  const agentState = agentService?.getState()
  audit('global_network_error_classified', {
    source,
    code: classification.code,
    causeCode: classification.causeCode,
    message: classification.message,
    matchedBy: classification.matchedBy,
    fatalDomainDeniedBy: classification.fatalDomainDeniedBy,
    stackHint: classification.stackHint,
    recoverable: classification.recoverable,
    controlPlaneStatus: controlPlaneConnectivityState.status,
    agentEnabled: Boolean(agentState?.enabled),
    agentConnected: Boolean(agentState?.connected),
  })
  if (getDesktopAuthState().authenticated) {
    markControlPlaneGlobalNetworkDegraded(classification)
  }
  if (agentState?.enabled) {
    agentService?.handleGlobalRecoverableNetworkError({
      message: classification.message,
      code: classification.code || classification.causeCode,
    })
  }
  emitConfigChanged()
  audit('global_network_error_recovered', {
    source,
    code: classification.code,
    causeCode: classification.causeCode,
    message: classification.message,
    matchedBy: classification.matchedBy,
    stackHint: classification.stackHint,
    controlPlaneStatus: controlPlaneConnectivityState.status,
    agentEnabled: Boolean(agentState?.enabled),
    agentConnected: Boolean(agentState?.connected),
    consecutiveFailures: getDesktopAuthState().authenticated
      ? controlPlaneConnectivityState.consecutiveFailures
      : (agentService?.getState().consecutiveFailures ?? 0),
    rawError:
      error instanceof Error
        ? error.stack || error.message
        : String(error),
  })
  if (getDesktopAuthState().authenticated) {
    scheduleGlobalNetworkRecovery(classification, source)
  }
}

function upsertControlPlaneSyncTask(
  task: Omit<ControlPlaneSyncTask, 'id' | 'createdAt' | 'updatedAt' | 'lastTriedAt' | 'retryCount' | 'lastError'>,
  error: ControlPlaneRequestError,
): void {
  loadControlPlaneSyncTasks()
  const now = new Date().toISOString()
  const existingIndex = controlPlaneSyncTasks.findIndex((item) => item.dedupeKey === task.dedupeKey)
  const nextTask: ControlPlaneSyncTask = {
    id: existingIndex >= 0 ? controlPlaneSyncTasks[existingIndex].id : randomUUID(),
    createdAt: existingIndex >= 0 ? controlPlaneSyncTasks[existingIndex].createdAt : now,
    updatedAt: now,
    lastTriedAt: '',
    retryCount: existingIndex >= 0 ? controlPlaneSyncTasks[existingIndex].retryCount : 0,
    lastError: error.message,
    ...task,
  }
  if (existingIndex >= 0) {
    controlPlaneSyncTasks.splice(existingIndex, 1, nextTask)
  } else {
    controlPlaneSyncTasks.push(nextTask)
  }
  audit('control_plane_sync_enqueued', {
    kind: task.kind,
    profileId: task.profileId,
    pathName: task.pathName,
    dedupeKey: task.dedupeKey,
    err: error.message,
    pendingSyncCount: controlPlaneSyncTasks.length,
  })
  persistControlPlaneSyncTasks()
  scheduleControlPlaneSyncRetry()
}

function enqueueRecoverableControlPlaneSyncTask(
  task: Omit<ControlPlaneSyncTask, 'id' | 'createdAt' | 'updatedAt' | 'lastTriedAt' | 'retryCount' | 'lastError'>,
  error: unknown,
): boolean {
  if (!isRecoverableControlPlaneError(error)) {
    return false
  }
  upsertControlPlaneSyncTask(task, error)
  const profile = task.profileId ? requireDatabase().getProfileById(task.profileId) : null
  if (profile) {
    updateRuntimeMetadata(profile, {
      lastControlPlaneError: error.message,
      lastControlPlaneErrorAt: new Date().toISOString(),
    })
  }
  return true
}

function completeControlPlaneSyncTask(taskId: string): void {
  loadControlPlaneSyncTasks()
  const nextTasks = controlPlaneSyncTasks.filter((item) => item.id !== taskId)
  if (nextTasks.length === controlPlaneSyncTasks.length) {
    return
  }
  controlPlaneSyncTasks = nextTasks
  persistControlPlaneSyncTasks()
}

async function requestControlPlaneRaw(
  pathName: string,
  init: JsonRequestInit,
  includeAuth = true,
): Promise<JsonResponse> {
  const headers = new Headers(init.headers || {})
  if (includeAuth) {
    const token = getStoredAuthToken()
    if (!token) {
      throw new Error('请先登录桌面端')
    }
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (init.body != null && init.body !== '' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const method = String(init.method || 'GET').toUpperCase()
  try {
    const response = await requestJsonWithRetry(`${getControlPlaneApiBase()}${pathName}`, {
      ...init,
      method,
      headers,
    }, method === 'GET' ? 2 : 1)
    if (response.status >= 500) {
      throw createControlPlaneRequestError(pathName, method, `${response.status} ${response.statusText}`, response.status, response.text)
    }
    markControlPlaneSuccess()
    if (getControlPlanePendingSyncCount() > 0) {
      scheduleControlPlaneSyncRetry(500)
    }
    return response
  } catch (error) {
    const requestError =
      error instanceof Error && error.name === 'ControlPlaneRequestError'
        ? (error as ControlPlaneRequestError)
        : createControlPlaneRequestError(pathName, method, error)
    if (requestError.recoverable) {
      markControlPlaneRecoverableFailure(requestError)
    }
    throw requestError
  }
}

async function flushPendingControlPlaneSyncTasks(): Promise<void> {
  loadControlPlaneSyncTasks()
  if (controlPlaneSyncInFlight || controlPlaneSyncTasks.length === 0 || !getDesktopAuthState().authenticated) {
    return
  }
  controlPlaneSyncInFlight = true
  try {
    for (const task of [...controlPlaneSyncTasks]) {
      try {
        await requestControlPlaneRaw(task.pathName, {
          method: task.method,
          body: task.body,
        })
        completeControlPlaneSyncTask(task.id)
      } catch (error) {
        if (!isRecoverableControlPlaneError(error)) {
          break
        }
        const updatedTask: ControlPlaneSyncTask = {
          ...task,
          retryCount: task.retryCount + 1,
          lastError: error.message,
          lastTriedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        controlPlaneSyncTasks = controlPlaneSyncTasks.map((item) => item.id === task.id ? updatedTask : item)
        persistControlPlaneSyncTasks()
        const delayMs = Math.min(
          CONTROL_PLANE_SYNC_RETRY_BASE_MS * Math.max(1, 2 ** Math.min(updatedTask.retryCount, 4)),
          CONTROL_PLANE_SYNC_RETRY_MAX_MS,
        )
        audit('control_plane_sync_retry_scheduled', {
          kind: task.kind,
          profileId: task.profileId,
          pathName: task.pathName,
          retryCount: updatedTask.retryCount,
          delayMs,
          err: error.message,
        })
        scheduleControlPlaneSyncRetry(delayMs)
        break
      }
    }
  } finally {
    controlPlaneSyncInFlight = false
  }
}

function beginControlPlaneSyncPolling(): void {
  if (controlPlaneSyncPollTimer) {
    clearInterval(controlPlaneSyncPollTimer)
  }
  controlPlaneSyncPollTimer = setInterval(() => {
    void flushPendingControlPlaneSyncTasks()
  }, CONTROL_PLANE_SYNC_POLL_INTERVAL_MS)
}

function saveDesktopAuth(apiBase: string, token: string, user: AuthUser): DesktopAuthState {
  sessionAuthApiBase = apiBase.replace(/\/$/, '')
  sessionAuthToken = token
  sessionAuthUser = user
  requireDatabase().setSettings({
    ...getSettings(),
    [CONTROL_PLANE_API_BASE_KEY]: sessionAuthApiBase,
    [CONTROL_PLANE_AUTH_TOKEN_KEY]: '',
    [CONTROL_PLANE_AUTH_USER_KEY]: '',
    [CONTROL_PLANE_AUTH_REMEMBER_KEY]: '0',
  })
  markControlPlaneSuccess()
  void flushPendingControlPlaneSyncTasks()
  return getDesktopAuthState()
}

function clearDesktopAuth(): DesktopAuthState {
  sessionAuthApiBase = ''
  sessionAuthToken = ''
  sessionAuthUser = null
  lastUserConfigSyncVersion = 0
  resetGlobalNetworkRecoveryState()
  controlPlaneConnectivityState = {
    status: 'online',
    lastError: '',
    lastErrorAt: '',
    lastSuccessAt: '',
    consecutiveFailures: 0,
  }
  setLastConfigSyncResult(null)
  requireDatabase().setSettings({
    ...getSettings(),
    [CONTROL_PLANE_AUTH_TOKEN_KEY]: '',
    [CONTROL_PLANE_AUTH_USER_KEY]: '',
    [CONTROL_PLANE_AUTH_REMEMBER_KEY]: '0',
  })
  return getDesktopAuthState()
}

function clearPersistedDesktopAuthOnStartup(): void {
  const settings = getSettings()
  const hasLegacyAuth =
    Boolean(String(settings[CONTROL_PLANE_AUTH_TOKEN_KEY] || '').trim()) ||
    Boolean(String(settings[CONTROL_PLANE_AUTH_USER_KEY] || '').trim()) ||
    String(settings[CONTROL_PLANE_AUTH_REMEMBER_KEY] || '').trim() === '1'
  if (!hasLegacyAuth) {
    return
  }
  requireDatabase().setSettings({
    ...settings,
    [CONTROL_PLANE_AUTH_TOKEN_KEY]: '',
    [CONTROL_PLANE_AUTH_USER_KEY]: '',
    [CONTROL_PLANE_AUTH_REMEMBER_KEY]: '0',
  })
}

function buildControlPlaneLoginCandidates(explicitApiBase?: string): string[] {
  const candidates = new Set<string>()
  const rawCandidates = [
    String(explicitApiBase || '').trim().replace(/\/$/, ''),
    getControlPlaneApiBase(),
    DEFAULT_CONTROL_PLANE_API_BASE,
  ].filter(Boolean)

  for (const candidate of rawCandidates) {
    candidates.add(candidate)
    if (/^http:\/\//i.test(candidate)) {
      candidates.add(candidate.replace(/^http:\/\//i, 'https://'))
    } else if (/^https:\/\//i.test(candidate)) {
      candidates.add(candidate.replace(/^https:\/\//i, 'http://'))
    } else {
      candidates.add(`https://${candidate}`)
      candidates.add(`http://${candidate}`)
    }
  }

  return [...candidates]
}

async function requestControlPlane(
  pathName: string,
  init: RequestInit = {},
  includeAuth = true,
): Promise<Record<string, unknown>> {
  const method = String(init.method || 'GET').toUpperCase()
  const response = await requestControlPlaneRaw(
    pathName,
    {
      method,
      headers: init.headers as JsonRequestInit['headers'],
      body:
        typeof init.body === 'string'
          ? init.body
          : init.body == null
            ? undefined
            : String(init.body),
    },
    includeAuth,
  )
  const payload = response.json
  if (!response.ok || payload.success === false) {
    const message = String(payload.error || `${response.status} ${response.statusText}` || 'Control plane request failed')
    if (response.status === 401) {
      clearDesktopAuth()
    }
    throw new Error(message)
  }
  return payload
}

async function reportEnvironmentSyncEvent(payload: {
  direction: 'push' | 'pull'
  mode: 'auto' | 'manual'
  status: 'succeeded' | 'failed-warning'
  profileIds?: string[]
  reason?: string
  errorMessage?: string
  cloudProfileCount?: number
  localMirroredProfileCount?: number
}): Promise<void> {
  if (!getDesktopAuthState().authenticated) {
    return
  }
  try {
    const body = JSON.stringify({
      scope: 'environment',
      direction: payload.direction,
      mode: payload.mode,
      status: payload.status,
      profileIds: payload.profileIds ?? [],
      reason: payload.reason || '',
      errorMessage: payload.errorMessage || '',
      cloudProfileCount: payload.cloudProfileCount || 0,
      localMirroredProfileCount: payload.localMirroredProfileCount || requireDatabase().listProfiles().length,
      deviceId: getControlPlaneDeviceId(),
    })
    await requestControlPlane('/api/config/sync-events', {
      method: 'POST',
      body,
    })
  } catch (error) {
    enqueueRecoverableControlPlaneSyncTask(
      {
        kind: 'sync-event',
        dedupeKey: `sync-event:${payload.direction}:${payload.mode}:${payload.reason || 'none'}`,
        profileId: '',
        method: 'POST',
        pathName: '/api/config/sync-events',
        body: JSON.stringify({
          scope: 'environment',
          direction: payload.direction,
          mode: payload.mode,
          status: payload.status,
          profileIds: payload.profileIds ?? [],
          reason: payload.reason || '',
          errorMessage: payload.errorMessage || '',
          cloudProfileCount: payload.cloudProfileCount || 0,
          localMirroredProfileCount: payload.localMirroredProfileCount || requireDatabase().listProfiles().length,
          deviceId: getControlPlaneDeviceId(),
        }),
      },
      error,
    )
    audit('environment_sync_event_report_failed', {
      direction: payload.direction,
      mode: payload.mode,
      status: payload.status,
      err: error instanceof Error ? error.message : String(error),
    })
  }
}

type JsonRequestInit = {
  method?: string
  headers?: Headers | Record<string, string> | Array<[string, string]>
  body?: string
}

type JsonResponse = {
  status: number
  statusText: string
  ok: boolean
  text: string
  json: Record<string, unknown>
}

function escapePowerShellString(value: string): string {
  return value.replace(/'/g, "''")
}

function buildPowerShellHashtableLiteral(values: Record<string, string>): string {
  const entries = Object.entries(values)
    .map(([key, value]) => `  '${escapePowerShellString(key)}' = '${escapePowerShellString(value)}'`)
    .join('\n')
  return `@{\n${entries}\n}`
}

function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

async function requestJsonViaPowerShell(input: string, init: JsonRequestInit = {}): Promise<JsonResponse> {
  const headers = headersToObject(init.headers)
  const body = init.body || ''
  const method = String(init.method || 'GET').toUpperCase()
  const bodyFilePath =
    body.length > 0 ? path.join(os.tmpdir(), `duokai-request-body-${randomUUID()}.txt`) : null
  if (bodyFilePath) {
    writeFileSync(bodyFilePath, body, 'utf8')
  }
  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$uri = '${escapePowerShellString(input)}'
$method = '${escapePowerShellString(method)}'
$headers = ${buildPowerShellHashtableLiteral(headers)}
$bodyPath = ${bodyFilePath ? `'${escapePowerShellString(bodyFilePath)}'` : '$null'}
$body = if ($null -ne $bodyPath -and (Test-Path -LiteralPath $bodyPath)) {
  Get-Content -LiteralPath $bodyPath -Raw -Encoding UTF8
} else {
  ''
}
try {
  $requestParams = @{
    Uri = $uri
    Method = $method
    Headers = $headers
    UseBasicParsing = $true
  }
  if ($method -ne 'GET' -and $method -ne 'HEAD' -and -not [string]::IsNullOrEmpty($body)) {
    $requestParams['Body'] = $body
  }
  $response = Invoke-WebRequest @requestParams
  $payload = @{
    status = [int]$response.StatusCode
    statusText = [string]$response.StatusDescription
    text = [string]$response.Content
  }
} catch {
  $webResponse = $_.Exception.Response
  if ($null -eq $webResponse) {
    Write-Error $_.Exception.Message
    exit 1
  }
  $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
  $content = $reader.ReadToEnd()
  $reader.Close()
  $payload = @{
    status = [int]$webResponse.StatusCode
    statusText = [string]$webResponse.StatusDescription
    text = [string]$content
  }
}
$payload | ConvertTo-Json -Compress
`.trim()
  const encodedScript = encodePowerShellCommand(script)

  return await new Promise<JsonResponse>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    const cleanupBodyFile = () => {
      if (!bodyFilePath) {
        return
      }
      try {
        unlinkSync(bodyFilePath)
      } catch {
        // Best-effort cleanup for a short-lived temp request body file.
      }
    }

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    child.on('close', (code) => {
      cleanupBodyFile()
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim()
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
      if (code !== 0 && !stdout) {
        reject(new Error(stderr || `PowerShell request failed with exit code ${code ?? -1}`))
        return
      }
      try {
        const parsed = stdout ? (JSON.parse(stdout) as { status?: number; statusText?: string; text?: string }) : {}
        const text = String(parsed.text || '')
        let json: Record<string, unknown> = {}
        try {
          json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
        } catch {
          json = {}
        }
        resolve({
          status: Number(parsed.status || 0),
          statusText: String(parsed.statusText || ''),
          ok: Number(parsed.status || 0) >= 200 && Number(parsed.status || 0) < 300,
          text,
          json,
        })
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
    child.on('error', (error) => {
      cleanupBodyFile()
      reject(error)
    })
  })
}

function headersToObject(input?: Headers | Record<string, string> | Array<[string, string]>): Record<string, string> {
  if (!input) {
    return {}
  }
  const headers =
    input instanceof Headers
      ? input
      : Array.isArray(input)
        ? new Headers(input)
        : new Headers(Object.entries(input))
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

async function requestJson(input: string, init: JsonRequestInit = {}): Promise<JsonResponse> {
  const url = new URL(input)
  const isHttps = url.protocol === 'https:'
  const transport = isHttps ? https : http
  const headers = headersToObject(init.headers)
  const body = init.body
  if (body != null && body !== '' && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) {
    headers['Content-Length'] = String(Buffer.byteLength(body))
  }

  return await new Promise<JsonResponse>((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: init.method || 'GET',
        headers,
        family: 4,
        lookup(hostname, options, callback) {
          dns.lookup(
            hostname,
            {
              ...(typeof options === 'number' ? { family: options } : options),
              family: 4,
              hints: dns.ADDRCONFIG,
            },
            callback,
          )
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json: Record<string, unknown> = {}
          try {
            json = text ? (JSON.parse(text) as Record<string, unknown>) : {}
          } catch {
            json = {}
          }
          resolve({
            status: response.statusCode || 0,
            statusText: response.statusMessage || '',
            ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
            text,
            json,
          })
        })
      },
    )
    request.on('error', reject)
    request.setTimeout(15_000, () => {
      request.destroy(new Error('Request timeout'))
    })
    if (body != null && body !== '') {
      request.write(body)
    }
    request.end()
  })
}

async function requestJsonWithRetry(input: string, init: JsonRequestInit, retries = 1): Promise<JsonResponse> {
  let lastError: unknown = null
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestJson(input, init)
    } catch (error) {
      lastError = error
      if (process.platform === 'win32') {
        try {
          return await requestJsonViaPowerShell(input, init)
        } catch (fallbackError) {
          lastError = fallbackError
        }
      }
      if (attempt >= retries) {
        throw lastError
      }
      const baseDelay = CONTROL_PLANE_FETCH_RETRY_MS * Math.max(1, 2 ** attempt)
      const jitter = Math.floor(Math.random() * 300)
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Control plane JSON request failed')
}

function getSettings(): SettingsPayload {
  return requireDatabase().getSettings()
}

function normalizeProfileName(name: string | undefined): string {
  return String(name || '').trim()
}

function normalizeProfileNameKey(name: string | undefined): string {
  return normalizeProfileName(name).toLocaleLowerCase()
}

function resetCachedProfileStatesOnStartup(): void {
  const database = requireDatabase()
  const profiles = database.listProfiles()
  const groupedByName = new Map<string, ProfileRecord[]>()

  for (const profile of profiles) {
    const key = normalizeProfileNameKey(profile.name) || `__EMPTY__:${profile.id}`
    const existing = groupedByName.get(key)
    if (existing) {
      existing.push(profile)
    } else {
      groupedByName.set(key, [profile])
    }
  }

  for (const [, duplicates] of groupedByName.entries()) {
    if (duplicates.length <= 1) {
      continue
    }
    duplicates.sort((left, right) => {
      const rightTime = Date.parse(right.updatedAt || right.createdAt || '')
      const leftTime = Date.parse(left.updatedAt || left.createdAt || '')
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })
    const keep = duplicates[0]
    for (const stale of duplicates.slice(1)) {
      database.deleteProfile(stale.id)
      audit('profiles_local_duplicate_removed_on_startup', {
        keepId: keep.id,
        removedId: stale.id,
        name: stale.name,
      })
    }
  }

  for (const profile of database.listProfiles()) {
    const metadata = profile.fingerprintConfig.runtimeMetadata
    const needsStatusReset = profile.status !== 'stopped'
    const needsMetadataReset =
      metadata.launchValidationStage !== 'idle' ||
      metadata.launchRetryCount !== 0
    const needsStorageStateSyncReset = metadata.lastStorageStateSyncStatus === 'syncing'
    const needsEnvironmentSyncReset = metadata.lastEnvironmentSyncStatus === 'syncing'
    const needsWorkspaceSummarySyncReset = metadata.lastWorkspaceSummarySyncStatus === 'syncing'
    const needsWorkspaceSnapshotSyncReset = metadata.lastWorkspaceSnapshotSyncStatus === 'syncing'

    if (
      !needsStatusReset &&
      !needsMetadataReset &&
      !needsStorageStateSyncReset &&
      !needsEnvironmentSyncReset &&
      !needsWorkspaceSummarySyncReset &&
      !needsWorkspaceSnapshotSyncReset
    ) {
      continue
    }

    database.updateProfile({
      id: profile.id,
      name: profile.name,
      proxyId: profile.proxyId,
      groupName: profile.groupName,
      tags: profile.tags,
      notes: profile.notes,
      fingerprintConfig: {
        ...profile.fingerprintConfig,
        runtimeMetadata: {
          ...metadata,
          launchValidationStage: 'idle',
          launchRetryCount: 0,
          ...(needsStorageStateSyncReset
            ? {
                lastStorageStateSyncStatus: 'error',
                lastStorageStateSyncMessage: '检测到上次登录态同步中断，将在下次启动或停止时重新同步',
              }
            : {}),
          ...(needsEnvironmentSyncReset
            ? {
                lastEnvironmentSyncStatus: 'recovery',
                lastEnvironmentSyncMessage: '检测到上次未完成同步，请选择上传当前环境或从云端拉取',
                lastEnvironmentSyncAt: new Date().toISOString(),
              }
            : {}),
          ...(needsWorkspaceSummarySyncReset
            ? {
                lastWorkspaceSummarySyncStatus: 'error',
                lastWorkspaceSummarySyncMessage: '检测到上次环境摘要同步中断，将在下次变更时重新同步',
              }
            : {}),
          ...(needsWorkspaceSnapshotSyncReset
            ? {
                lastWorkspaceSnapshotSyncStatus: 'error',
                lastWorkspaceSnapshotSyncMessage: '检测到上次环境快照同步中断，将在下次保存时重新同步',
              }
            : {}),
        },
      },
    })
    database.setProfileStatus(profile.id, 'stopped')
    audit('profiles_local_status_reset_on_startup', {
      profileId: profile.id,
      previousStatus: profile.status,
      previousLaunchStage: metadata.launchValidationStage,
      previousEnvironmentSyncStatus: metadata.lastEnvironmentSyncStatus,
    })
  }
}

function assertProfileNameUniqueOrThrow(name: string | undefined, ignoreProfileId?: string): void {
  const normalizedName = normalizeProfileName(name)
  const normalizedKey = normalizeProfileNameKey(name)
  if (!normalizedName) {
    throw new Error('环境名称不能为空')
  }
  const duplicated = requireDatabase()
    .listProfiles()
    .find(
      (profile) =>
        profile.id !== ignoreProfileId && normalizeProfileNameKey(profile.name) === normalizedKey,
    )
  if (duplicated) {
    throw new Error('已存在同名环境，请使用不同名称')
  }
}

type ProxyEntryTransport = 'https-entry' | 'http-entry' | 'socks5-entry' | 'direct'

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

function shareStartupOrigin(candidateUrl: string, expectedUrl: string): boolean {
  try {
    return new URL(candidateUrl).origin === new URL(expectedUrl).origin
  } catch {
    return false
  }
}

function resolveProfileStartupUrl(profile: Pick<ProfileRecord, 'fingerprintConfig'>): string {
  const basicSettings = profile.fingerprintConfig.basicSettings
  const customPlatformUrl = basicSettings.customPlatformUrl.trim()
  if (basicSettings.platform === 'custom') {
    return customPlatformUrl
  }
  const builtInStartupUrl = getBuiltInStartupUrl(basicSettings.platform)
  if (customPlatformUrl && builtInStartupUrl && shareStartupOrigin(customPlatformUrl, builtInStartupUrl)) {
    return customPlatformUrl
  }
  return (
    builtInStartupUrl ||
    customPlatformUrl ||
    ''
  )
}

function classifyStartupNavigationError(error: unknown): StartupNavigationReasonCode {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout'
  }
  if (message.includes('proxy')) {
    return 'proxy_error'
  }
  if (message.includes('dns') || message.includes('enotfound') || message.includes('eai_again')) {
    return 'dns_error'
  }
  if (message.includes('ssl') || message.includes('tls') || message.includes('certificate')) {
    return 'tls_error'
  }
  if (message.includes('redirect')) {
    return 'redirect_unstable'
  }
  if (
    message.includes('blocked') ||
    message.includes('forbidden') ||
    message.includes('denied') ||
    message.includes('access denied')
  ) {
    return 'page_blocked'
  }
  if (message.includes('challenge') || message.includes('captcha') || message.includes('verify')) {
    return 'challenge_or_gate'
  }
  if (
    message.includes('net::') ||
    message.includes('connection') ||
    message.includes('socket') ||
    message.includes('network')
  ) {
    return 'net_error'
  }
  return 'unknown'
}

async function navigateToStartupUrl(
  page: import('playwright').Page,
  profileId: string,
  startupUrl: string,
): Promise<StartupNavigationResult> {
  const checkedAt = new Date().toISOString()
  const requestedUrl = startupUrl
  try {
    await page.goto(startupUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })
    return {
      requestedUrl,
      attemptedUrl: startupUrl,
      finalUrl: page.url(),
      success: true,
      reasonCode: 'ok',
      message: 'Startup page loaded successfully',
      checkedAt,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    audit('startup_navigation_retry', {
      profileId,
      startupUrl,
      strategy: 'commit',
      err: message,
    })
    try {
      await page.goto(startupUrl, {
        waitUntil: 'commit',
        timeout: 15_000,
      })
      return {
        requestedUrl,
        attemptedUrl: startupUrl,
        finalUrl: page.url(),
        success: true,
        reasonCode: 'ok',
        message: 'Startup page loaded successfully after fallback navigation',
        checkedAt,
      }
    } catch (retryError) {
      const retryMessage = retryError instanceof Error ? retryError.message : String(retryError)
      return {
        requestedUrl,
        attemptedUrl: startupUrl,
        finalUrl: page.url(),
        success: false,
        reasonCode: classifyStartupNavigationError(retryError),
        message: retryMessage,
        checkedAt,
      }
    }
  }
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
    environmentPurpose: profile.environmentPurpose,
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
    deviceProfile: profile.deviceProfile,
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
  profile: ProfileRecord,
  check: NetworkHealthResult,
  effectiveProxyTransport: string,
  success: boolean,
  message: string,
): TrustedIsolationCheck {
  const workspace = profile.workspace
  return {
    mode: 'quick-network',
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
    workspaceConsistencyStatus: workspace?.consistencySummary.status || 'unknown',
    workspaceHealthStatus: workspace?.healthSummary.status || 'unknown',
    runtimeLockStatus: getRuntimeLockStateForProfile(profile),
    canonicalRoot: workspace ? path.dirname(workspace.paths.profileDir) : '',
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
        startupNavigation: profile.startupNavigation || null,
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
  void profileId
}

type StorageStateUploadReason =
  | 'stop'
  | 'graceful-shutdown'
  | 'context-close'
  | 'manual-upload'

async function uploadProfileStorageStateToControlPlane(
  profileId: string,
  options: {
    context?: BrowserContext | null
    reason: StorageStateUploadReason
  },
): Promise<StorageStateSyncResult> {
  const buildResult = (
    status: StorageStateSyncStatus,
    message: string,
    overrides: Partial<StorageStateSyncResult> = {},
  ): StorageStateSyncResult => ({
    status,
    message,
    version: 0,
    updatedAt: '',
    cloudRecordExists: false,
    ...overrides,
  })
  if (!getDesktopAuthState().authenticated) {
    return buildResult('idle', '当前未登录账号，无法同步登录态')
  }
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    return buildResult('error', '环境不存在')
  }

  let stateJson: BrowserStorageState | null = null
  if (options.context) {
    stateJson = await saveProfileStorageStateToDisk(profileId, options.context)
  } else {
    stateJson = await readProfileStorageStateFromDisk(profileId)
  }
  if (!stateJson) {
    updateRuntimeMetadata(profile, {
      lastStorageStateSyncStatus: 'error',
      lastStorageStateSyncMessage: '本地没有可上传的有效登录态文件',
    })
    return buildResult('error', '本地没有可上传的有效登录态文件')
  }

  const stateHash = hashStorageState(stateJson)
  const pendingProfile = updateRuntimeMetadata(profile, {
    lastStorageStateSyncStatus: 'syncing',
    lastStorageStateSyncMessage: '正在同步云端登录态',
  })
  let cloudRecordExists = false
  let baseVersion = 0

  try {
    const remoteState = await fetchRemoteProfileStorageState(profileId)
    cloudRecordExists = Boolean(remoteState)
    const localVersion = Math.max(
      0,
      Number(pendingProfile.fingerprintConfig.runtimeMetadata.lastStorageStateVersion || 0),
    )
    baseVersion = remoteState ? localVersion : 0
    if (remoteState && remoteState.stateHash && remoteState.stateHash === stateHash) {
      const updatedAt = remoteState.updatedAt || new Date().toISOString()
      updateRuntimeMetadata(pendingProfile, {
        lastStorageStateVersion: remoteState.version,
        lastStorageStateSyncedAt: updatedAt,
        lastStorageStateDeviceId: remoteState.deviceId || '',
        lastStorageStateSyncStatus: 'synced',
        lastStorageStateSyncMessage: '云端登录态已同步',
      })
      await syncStorageStateStatusToCanonicalProfile(profileId, {
        status: 'synced',
        message: '云端登录态已同步',
        updatedAt,
        version: remoteState.version,
        deviceId: remoteState.deviceId || '',
      })
      return buildResult('synced', '云端登录态已同步', {
        version: remoteState.version,
        updatedAt,
        cloudRecordExists: true,
      })
    }
    if (remoteState && remoteState.version > localVersion) {
      const updatedAt = remoteState.updatedAt || new Date().toISOString()
      updateRuntimeMetadata(pendingProfile, {
        lastStorageStateVersion: remoteState.version,
        lastStorageStateSyncedAt: updatedAt,
        lastStorageStateDeviceId: remoteState.deviceId || '',
        lastStorageStateSyncStatus: 'conflict',
        lastStorageStateSyncMessage: '云端登录态已更新，请重新启动环境以同步最新状态',
      })
      await syncStorageStateStatusToCanonicalProfile(profileId, {
        status: 'conflict',
        message: '云端登录态已更新，请重新启动环境以同步最新状态',
        updatedAt,
        version: remoteState.version,
        deviceId: remoteState.deviceId || '',
      })
      audit('storage_state_conflict', {
        profileId,
        reason: options.reason,
        localVersion,
        remoteVersion: remoteState.version,
      })
      return buildResult('conflict', '云端登录态已更新，请重新启动环境以同步最新状态', {
        version: remoteState.version,
        updatedAt,
        cloudRecordExists: true,
      })
    }
    if (remoteState && remoteState.version === localVersion && remoteState.stateHash && remoteState.stateHash === stateHash) {
      const updatedAt = remoteState.updatedAt || new Date().toISOString()
      updateRuntimeMetadata(pendingProfile, {
        lastStorageStateVersion: remoteState.version,
        lastStorageStateSyncedAt: updatedAt,
        lastStorageStateDeviceId: remoteState.deviceId || '',
        lastStorageStateSyncStatus: 'synced',
        lastStorageStateSyncMessage: '云端登录态已同步',
      })
      await syncStorageStateStatusToCanonicalProfile(profileId, {
        status: 'synced',
        message: '云端登录态已同步',
        updatedAt,
        version: remoteState.version,
        deviceId: remoteState.deviceId || '',
      })
      return buildResult('synced', '云端登录态已同步', {
        version: remoteState.version,
        updatedAt,
        cloudRecordExists: true,
      })
    }

    const token = getStoredAuthToken()
    if (!token) {
      updateRuntimeMetadata(pendingProfile, {
        lastStorageStateSyncStatus: 'error',
        lastStorageStateSyncMessage: '当前登录态凭证缺失，无法上传登录态',
      })
      return buildResult('error', '当前登录态凭证缺失，无法上传登录态', {
        version: localVersion,
        cloudRecordExists: Boolean(remoteState),
      })
    }
    const pathName = `/api/profile-storage-state/${encodeURIComponent(profileId)}`
    const body = JSON.stringify({
      stateJson,
      encrypted: false,
      baseVersion,
      deviceId: getControlPlaneDeviceId(),
      source: 'desktop',
      stateHash,
    })
    const response = await requestControlPlaneRaw(
      pathName,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
      },
      false,
    )
    const payload = response.json
    if (response.status === 409) {
      const conflict = (payload.conflict || {}) as Record<string, unknown>
      const updatedAt = String(conflict.updatedAt || '')
      updateRuntimeMetadata(pendingProfile, {
        lastStorageStateVersion: Number(conflict.currentVersion || localVersion),
        lastStorageStateSyncedAt: updatedAt,
        lastStorageStateDeviceId: String(conflict.deviceId || ''),
        lastStorageStateSyncStatus: 'conflict',
        lastStorageStateSyncMessage: '云端登录态已更新，请重新启动环境以同步最新状态',
      })
      await syncStorageStateStatusToCanonicalProfile(profileId, {
        status: 'conflict',
        message: '云端登录态已更新，请重新启动环境以同步最新状态',
        updatedAt,
        version: Number(conflict.currentVersion || 0),
        deviceId: String(conflict.deviceId || ''),
      })
      audit('storage_state_conflict', {
        profileId,
        reason: options.reason,
        localVersion,
        remoteVersion: Number(conflict.currentVersion || 0),
      })
      return buildResult('conflict', '云端登录态已更新，请重新启动环境以同步最新状态', {
        version: Number(conflict.currentVersion || 0),
        updatedAt: String(conflict.updatedAt || ''),
        cloudRecordExists: true,
      })
    }
    if (!response.ok || payload.success === false) {
      throw new Error(String(payload.error || `${response.status} ${response.statusText}`))
    }

    const storageState = (payload.storageState || {}) as Record<string, unknown>
    const updatedAt = String(storageState.updatedAt || new Date().toISOString())
    const deviceId = String(storageState.deviceId || getControlPlaneDeviceId())
    updateRuntimeMetadata(pendingProfile, {
      lastStorageStateVersion: Number(storageState.version || localVersion),
      lastStorageStateSyncedAt: updatedAt,
      lastStorageStateDeviceId: deviceId,
      lastStorageStateSyncStatus: 'synced',
      lastStorageStateSyncMessage: '云端登录态已同步',
    })
    await syncStorageStateStatusToCanonicalProfile(profileId, {
      status: 'synced',
      message: '云端登录态已同步',
      updatedAt,
      version: Number(storageState.version || localVersion),
      deviceId,
    })
    audit('storage_state_uploaded', {
      profileId,
      reason: options.reason,
      version: Number(storageState.version || 0),
    })
    return buildResult('synced', '云端登录态已同步', {
      version: Number(storageState.version || localVersion),
      updatedAt,
      cloudRecordExists: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    updateRuntimeMetadata(pendingProfile, {
      lastStorageStateSyncStatus: 'error',
      lastStorageStateSyncMessage: message,
      lastControlPlaneError: message,
      lastControlPlaneErrorAt: new Date().toISOString(),
    })
    enqueueRecoverableControlPlaneSyncTask(
      {
        kind: 'storage-state-upload',
        dedupeKey: `storage-state-upload:${profileId}:${stateHash}:${Math.max(
          0,
          Number(pendingProfile.fingerprintConfig.runtimeMetadata.lastStorageStateVersion || 0),
        )}`,
        profileId,
        method: 'PUT',
        pathName: `/api/profile-storage-state/${encodeURIComponent(profileId)}`,
        body: JSON.stringify({
          stateJson,
          encrypted: false,
          baseVersion,
          deviceId: getControlPlaneDeviceId(),
          source: 'desktop',
          stateHash,
        }),
      },
      error,
    )
    audit('storage_state_upload_failed', {
      profileId,
      reason: options.reason,
      err: message,
    })
    logEvent(
      'warn',
      'runtime',
      `Failed syncing storage state for ${profile.name}: ${message}`,
      profileId,
    )
    return buildResult('error', message, {
      version: Number(pendingProfile.fingerprintConfig.runtimeMetadata.lastStorageStateVersion || 0),
      cloudRecordExists,
    })
  }
}

async function downloadProfileStorageStateFromControlPlane(
  profileId: string,
  options: {
    force?: boolean
    reason?: StorageStateDownloadReason
  } = {},
): Promise<StorageStateSyncResult> {
  const buildResult = (
    status: StorageStateSyncStatus,
    message: string,
    overrides: Partial<StorageStateSyncResult> = {},
  ): StorageStateSyncResult => ({
    status,
    message,
    version: 0,
    updatedAt: '',
    cloudRecordExists: false,
    ...overrides,
  })
  if (!getDesktopAuthState().authenticated) {
    return buildResult('idle', '当前未登录账号，无法拉取登录态')
  }
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    return buildResult('error', '环境不存在')
  }
  let cloudRecordExists = false
  try {
    updateRuntimeMetadata(profile, {
      lastStorageStateSyncStatus: 'syncing',
      lastStorageStateSyncMessage: '正在拉取云端登录态',
    })
    const remoteState = await fetchRemoteProfileStorageState(profileId)
    if (!remoteState) {
      updateRuntimeMetadata(profile, {
        lastStorageStateSyncStatus: 'idle',
        lastStorageStateSyncMessage: '云端暂无登录态记录',
      })
      return buildResult('idle', '云端暂无登录态记录')
    }
    cloudRecordExists = true
    const localVersion = Math.max(
      0,
      Number(profile.fingerprintConfig.runtimeMetadata.lastStorageStateVersion || 0),
    )
    const localStorageState = await readProfileStorageStateFromDisk(profileId)
    const hasLocalStorageState = hasUsableStorageState(localStorageState)
    if (!options.force && remoteState.version <= localVersion && hasLocalStorageState) {
      const updatedAt = remoteState.updatedAt || new Date().toISOString()
      updateRuntimeMetadata(profile, {
        lastStorageStateVersion: remoteState.version,
        lastStorageStateSyncedAt: updatedAt,
        lastStorageStateDeviceId: remoteState.deviceId || '',
        lastStorageStateSyncStatus: 'synced',
        lastStorageStateSyncMessage: '本地登录态已是最新版本',
      })
      await syncStorageStateStatusToCanonicalProfile(profileId, {
        status: 'synced',
        message: '本地登录态已是最新版本',
        updatedAt,
        version: remoteState.version,
        deviceId: remoteState.deviceId || '',
      })
      return buildResult('synced', '本地登录态已是最新版本', {
        version: remoteState.version,
        updatedAt,
        cloudRecordExists: true,
      })
    }
    const normalizedState = normalizeStorageState(remoteState.stateJson)
    if (!hasUsableStorageState(normalizedState)) {
      updateRuntimeMetadata(profile, {
        lastStorageStateSyncStatus: 'error',
        lastStorageStateSyncMessage: '云端登录态内容为空或格式无效',
      })
      return buildResult('error', '云端登录态内容为空或格式无效', {
        version: remoteState.version,
        updatedAt: remoteState.updatedAt || '',
        cloudRecordExists: true,
      })
    }
    await writeProfileStorageStateToDisk(profileId, normalizedState)
    const running = runtimeContexts.has(profileId)
    const baseMessage =
      options.reason === 'manual' && running
        ? '已下载云端登录态，重启环境后生效'
        : '已下载云端登录态'
    const updatedAt = remoteState.updatedAt || new Date().toISOString()
    updateRuntimeMetadata(profile, {
      lastStorageStateVersion: remoteState.version,
      lastStorageStateSyncedAt: updatedAt,
      lastStorageStateDeviceId: remoteState.deviceId || '',
      lastStorageStateSyncStatus: 'synced',
      lastStorageStateSyncMessage: baseMessage,
    })
    await syncStorageStateStatusToCanonicalProfile(profileId, {
      status: 'synced',
      message: baseMessage,
      updatedAt,
      version: remoteState.version,
      deviceId: remoteState.deviceId || '',
    })
    audit('storage_state_downloaded', {
      profileId,
      version: remoteState.version,
      deviceId: remoteState.deviceId,
    })
    return buildResult('synced', baseMessage, {
      version: remoteState.version,
      updatedAt,
      cloudRecordExists: true,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    updateRuntimeMetadata(profile, {
      lastStorageStateSyncStatus: 'error',
      lastStorageStateSyncMessage: message,
    })
    audit('storage_state_download_failed', {
      profileId,
      err: message,
    })
    logEvent(
      'warn',
      'runtime',
      `Failed downloading cloud storage state for ${profile.name}: ${message}`,
      profileId,
    )
    return buildResult('error', message, {
      version: Number(profile.fingerprintConfig.runtimeMetadata.lastStorageStateVersion || 0),
      cloudRecordExists,
    })
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
  try {
    const themeMode = String(requireDatabase().getSettings().themeMode || 'system').trim()
    if (themeMode === 'dark' || themeMode === 'light' || themeMode === 'system') {
      nativeTheme.themeSource = themeMode
      syncNativeChrome()
      return
    }
  } catch {
    // Database not ready during early bootstrap.
  }
  nativeTheme.themeSource = 'system'
  syncNativeChrome()
}

function getUiLanguage(): 'zh-CN' | 'en-US' {
  try {
    const language = String(getSettings().uiLanguage || 'zh-CN').trim()
    return language === 'en-US' ? 'en-US' : 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

function shouldUseDarkNativeChrome(): boolean {
  try {
    const themeMode = String(getSettings().themeMode || 'system').trim()
    return themeMode === 'dark' || (themeMode !== 'light' && nativeTheme.shouldUseDarkColors)
  } catch {
    return nativeTheme.shouldUseDarkColors
  }
}

function getNativeChromeColors(): { backgroundColor: string; symbolColor: string } {
  return shouldUseDarkNativeChrome()
    ? { backgroundColor: '#071425', symbolColor: '#f5f9ff' }
    : { backgroundColor: '#f7f9fc', symbolColor: '#0f172a' }
}

function getTitleBarOverlayOptions(): TitleBarOverlay | undefined {
  if (process.platform !== 'win32') {
    return undefined
  }
  const { backgroundColor, symbolColor } = getNativeChromeColors()
  return {
    color: backgroundColor,
    symbolColor,
    height: 40,
  }
}

function getWindowFrameMetrics(win: BrowserWindow | null = mainWindow): DesktopWindowFrameMetrics {
  const overlay = getTitleBarOverlayOptions()
  if (process.platform !== 'win32') {
    return {
      platform: process.platform,
      titleBarOverlayHeight: overlay?.height ?? 0,
      windowControlsRightInset: 0,
      topDragRegionHeight: overlay?.height ?? 0,
    }
  }

  const isMaximized = Boolean(win && !win.isDestroyed() && win.isMaximized())
  const titleBarOverlayHeight = overlay?.height ?? 40
  return {
    platform: process.platform,
    titleBarOverlayHeight,
    windowControlsRightInset: isMaximized ? 168 : 156,
    topDragRegionHeight: titleBarOverlayHeight,
  }
}

function getDesktopRuntimeInfo(): DesktopRuntimeInfo {
  return {
    mode: isDev ? 'development' : 'production',
    appVersion: app.getVersion(),
    mainVersion: app.getVersion(),
    preloadVersion: PRELOAD_VERSION,
    rendererVersion: app.getVersion(),
    buildMarker: BUILD_MARKER,
    capabilities: CAPABILITIES,
    windowFrame: getWindowFrameMetrics(),
    controlPlaneStatus: controlPlaneConnectivityState.status,
    controlPlaneLastError: controlPlaneConnectivityState.lastError,
    pendingSyncCount: getControlPlanePendingSyncCount(),
    controlPlaneRecoveryState,
    controlPlaneNextRetryAt: controlPlaneNextRetryAt || undefined,
  }
}

function broadcastWindowFrameMetrics(): void {
  const payload = getWindowFrameMetrics()
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    window.webContents.send('meta.windowFrameChanged', payload)
  }
}

function buildLocalizedMenuTemplate(locale: 'zh-CN' | 'en-US'): MenuItemConstructorOptions[] {
  const isZh = locale === 'zh-CN'
  return [
    {
      label: isZh ? '文件' : 'File',
      submenu: [
        { role: 'quit', label: isZh ? '退出' : 'Quit' },
      ],
    },
    {
      label: isZh ? '编辑' : 'Edit',
      submenu: [
        { role: 'undo', label: isZh ? '撤销' : 'Undo' },
        { role: 'redo', label: isZh ? '重做' : 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: isZh ? '剪切' : 'Cut' },
        { role: 'copy', label: isZh ? '复制' : 'Copy' },
        { role: 'paste', label: isZh ? '粘贴' : 'Paste' },
        { role: 'selectAll', label: isZh ? '全选' : 'Select All' },
      ],
    },
    {
      label: isZh ? '查看' : 'View',
      submenu: [
        { role: 'reload', label: isZh ? '重新加载' : 'Reload' },
        { role: 'forceReload', label: isZh ? '强制重新加载' : 'Force Reload' },
        { role: 'toggleDevTools', label: isZh ? '开发者工具' : 'Toggle Developer Tools' },
        { type: 'separator' },
        { role: 'resetZoom', label: isZh ? '实际大小' : 'Actual Size' },
        { role: 'zoomIn', label: isZh ? '放大' : 'Zoom In' },
        { role: 'zoomOut', label: isZh ? '缩小' : 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: isZh ? '切换全屏' : 'Toggle Full Screen' },
      ],
    },
    {
      label: isZh ? '窗口' : 'Window',
      submenu: [
        { role: 'minimize', label: isZh ? '最小化' : 'Minimize' },
        { role: 'close', label: isZh ? '关闭' : 'Close' },
      ],
    },
    {
      label: isZh ? '帮助' : 'Help',
      submenu: [
        {
          label: isZh ? 'Duokai 官网' : 'Duokai Website',
          click: () => {
            void shell.openExternal('https://github.com/txj1992ceshi/duokai')
          },
        },
      ],
    },
  ]
}

function syncApplicationMenu(): void {
  const menu = Menu.buildFromTemplate(buildLocalizedMenuTemplate(getUiLanguage()))
  Menu.setApplicationMenu(menu)
  if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setMenu(menu)
    mainWindow.setMenuBarVisibility(true)
    mainWindow.autoHideMenuBar = false
  }
}

function syncNativeChrome(): void {
  syncApplicationMenu()
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  const { backgroundColor } = getNativeChromeColors()
  mainWindow.setBackgroundColor(backgroundColor)
  if (process.platform === 'win32') {
    try {
      const overlay = getTitleBarOverlayOptions()
      if (overlay) {
        mainWindow.setTitleBarOverlay(overlay)
      }
    } catch {
      // Best-effort for platforms or Electron builds without overlay support.
    }
  }
  broadcastWindowFrameMetrics()
}

async function createMainWindow(): Promise<void> {
  if (beforeQuitHandled || gracefulShutdownInFlight) {
    traceStartup('create_main_window_skipped_during_shutdown')
    return
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
    traceStartup('create_main_window_reused_existing')
    return
  }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: getNativeChromeColors().backgroundColor,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: getTitleBarOverlayOptions(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  traceStartup('main_window_created', {
    rendererUrl: rendererUrl || '',
    rendererFile,
  })
  syncNativeChrome()

  mainWindow.on('closed', () => {
    clearDesktopAuth()
    traceStartup('main_window_closed')
    mainWindow = null
  })

  const syncWindowFrameMetrics = () => {
    broadcastWindowFrameMetrics()
  }
  mainWindow.on('resize', syncWindowFrameMetrics)
  mainWindow.on('maximize', syncWindowFrameMetrics)
  mainWindow.on('unmaximize', syncWindowFrameMetrics)
  mainWindow.on('enter-full-screen', syncWindowFrameMetrics)
  mainWindow.on('leave-full-screen', syncWindowFrameMetrics)

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }
    mainWindow.show()
    mainWindow.focus()
    broadcastWindowFrameMetrics()
    traceStartup('main_window_ready_to_show')
  })

  mainWindow.webContents.on('did-finish-load', () => {
    traceStartup('main_window_did_finish_load')
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
    mainWindow.focus()
    emitUpdateState()
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    traceStartup('main_window_did_fail_load', {
      errorCode,
      errorDescription,
      validatedUrl,
      isMainFrame,
    })
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    traceStartup('render_process_gone', {
      reason: details.reason,
      exitCode: details.exitCode,
    })
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
    await releaseProfileRuntimeLock(profileId)
    await updateProfileStatus(profileId, 'stopped')
    return
  }
  await finalizeRuntimeShutdown(profileId, 'stop')
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
  const checkedAt = new Date().toISOString()
  const result = await checkStandaloneProxyEgress(proxy)

  if (options.syncStoredProxyId) {
    requireDatabase().setProxyStatus(options.syncStoredProxyId, result.ok ? 'online' : 'offline')
  }

  logEvent(
    result.ok ? 'info' : 'error',
    category,
    result.ok
      ? `Proxy "${options.label}" verified locally proxyType=${proxy.type}; host=${proxy.host}; port=${proxy.port}; detail=${result.message}`
      : `Proxy "${options.label}" test failed locally proxyType=${proxy.type}; host=${proxy.host}; port=${proxy.port}; error=${result.message}`,
    null,
  )

  return {
    success: result.ok,
    message: result.ok ? result.message || '本机检测通过（local）' : `本机检测失败：${result.message}`,
    checkedAt,
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
    settings:
      parsed.settings && typeof parsed.settings === 'object'
        ? (parsed.settings as SettingsPayload)
        : {},
    workspaceSnapshots: Array.isArray(parsed.workspaceSnapshots) ? parsed.workspaceSnapshots : [],
    workspaceManifest:
      parsed.workspaceManifest && typeof parsed.workspaceManifest === 'object'
        ? parsed.workspaceManifest
        : undefined,
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

function getRegisterIpCooldownHours(): number {
  return getRuntimeNumberSetting('registerIpCooldownHours', DEFAULT_REGISTER_IP_COOLDOWN_HOURS)
}

function getRegisterIpCooldownMaxProfiles(): number {
  return getRuntimeNumberSetting('registerIpCooldownMaxProfiles', DEFAULT_REGISTER_IP_MAX_PROFILES)
}

function getPlatformSpecificRegisterCooldown(platform: string): {
  platform: string
  withinHours: number
  maxProfiles: number
} | null {
  const normalized = String(platform || '').trim().toLowerCase()
  if (normalized === 'linkedin') {
    return {
      platform: 'LinkedIn',
      withinHours: getRuntimeNumberSetting(
        'linkedinRegisterIpCooldownHours',
        DEFAULT_LINKEDIN_REGISTER_IP_COOLDOWN_HOURS,
      ),
      maxProfiles: getRuntimeNumberSetting(
        'linkedinRegisterIpCooldownMaxProfiles',
        DEFAULT_LINKEDIN_REGISTER_IP_MAX_PROFILES,
      ),
    }
  }
  if (normalized === 'tiktok') {
    return {
      platform: 'TikTok',
      withinHours: getRuntimeNumberSetting(
        'tiktokRegisterIpCooldownHours',
        DEFAULT_TIKTOK_REGISTER_IP_COOLDOWN_HOURS,
      ),
      maxProfiles: getRuntimeNumberSetting(
        'tiktokRegisterIpCooldownMaxProfiles',
        DEFAULT_TIKTOK_REGISTER_IP_MAX_PROFILES,
      ),
    }
  }
  return null
}

function getLifecyclePolicyContext() {
  return {
    nurtureMinimumHoursAfterRegister: getRuntimeNumberSetting(
      'nurtureMinimumHoursAfterRegister',
      DEFAULT_NURTURE_MINIMUM_HOURS_AFTER_REGISTER,
    ),
    operationMinimumHoursAfterNurture: getRuntimeNumberSetting(
      'operationMinimumHoursAfterNurture',
      DEFAULT_OPERATION_MINIMUM_HOURS_AFTER_NURTURE,
    ),
  }
}

function getRegistrationCooldownContext(profile: ProfileRecord, check: NetworkHealthResult) {
  if (profile.environmentPurpose !== 'register' || !check.ok || !check.ip) {
    return undefined
  }
  const withinHours = getRegisterIpCooldownHours()
  const maxProfiles = getRegisterIpCooldownMaxProfiles()
  const platformCooldown = getPlatformSpecificRegisterCooldown(
    profile.fingerprintConfig.basicSettings.platform,
  )
  const recentUsages = requireDatabase().listRecentIpUsageByEgressIp({
    egressIp: check.ip,
    withinHours,
    environmentPurpose: 'register',
    usageKind: 'register-launch',
    excludeProfileId: profile.id,
    successOnly: true,
  })
  const platformRecentUsages =
    platformCooldown
      ? requireDatabase().listRecentIpUsageByEgressIp({
          egressIp: check.ip,
          withinHours: platformCooldown.withinHours,
          environmentPurpose: 'register',
          platform: profile.fingerprintConfig.basicSettings.platform,
          usageKind: 'register-launch',
          excludeProfileId: profile.id,
          successOnly: true,
        })
      : []
  return {
    withinHours,
    maxProfiles,
    recentUsages,
    platform: platformCooldown?.platform || '',
    platformWithinHours: platformCooldown?.withinHours || withinHours,
    platformMaxProfiles: platformCooldown?.maxProfiles || maxProfiles,
    platformRecentUsages,
  }
}

function recordProfileIpUsage(
  profile: ProfileRecord,
  check: NetworkHealthResult,
  startupNavigation: StartupNavigationResult,
): void {
  if (!check.ip) {
    return
  }
  const navigationMessage = startupNavigation.success
    ? 'Profile runtime launched and startup navigation completed'
    : `Profile runtime launched but startup navigation failed (${startupNavigation.reasonCode})`
  requireDatabase().createIpUsage({
    profileId: profile.id,
    proxyId: profile.proxyId,
    environmentPurpose: profile.environmentPurpose,
    platform: profile.fingerprintConfig.basicSettings.platform,
    usageKind: profile.environmentPurpose === 'register' ? 'register-launch' : 'launch',
    egressIp: check.ip,
    country: check.country,
    region: check.region,
    city: check.city,
    timezone: check.timezone,
    language: check.languageHint,
    geolocation: check.geolocation,
    success: true,
    message: navigationMessage,
  })
}

function applyPurposeTransitionMetadata(
  nextInput: UpdateProfileInput,
  existing: ProfileRecord | null,
): UpdateProfileInput {
  if (!existing || nextInput.environmentPurpose === existing.environmentPurpose) {
    return nextInput
  }
  const now = new Date().toISOString()
  const nextPurpose = nextInput.environmentPurpose ?? existing.environmentPurpose
  return {
    ...nextInput,
    fingerprintConfig: {
      ...nextInput.fingerprintConfig,
      runtimeMetadata: {
        ...nextInput.fingerprintConfig.runtimeMetadata,
        lastPurposeTransitionAt: now,
        lastPurposeTransitionFrom: existing.environmentPurpose,
        lastPurposeTransitionTo: nextPurpose,
        lastNurtureTransitionAt:
          nextPurpose === 'nurture'
            ? now
            : nextInput.fingerprintConfig.runtimeMetadata.lastNurtureTransitionAt,
        lastOperationTransitionAt:
          nextPurpose === 'operation'
            ? now
            : nextInput.fingerprintConfig.runtimeMetadata.lastOperationTransitionAt,
      },
    },
  }
}

function getRuntimeHostInfo() {
  const settings = getSettings()
  const kind = resolveRequestedRuntimeKind(settings)
  const available = isRuntimeHostSupported(kind)
  const lockSummary = summarizeRuntimeLockStates()
  const effectiveRuntimeMode =
    kind === 'container' ? 'container' : kind === 'vm' ? 'vm' : 'local'
  const supportedRuntimeModes: RuntimeHostInfo['supportedRuntimeModes'] = ['local']
  if (process.platform === 'linux') {
    supportedRuntimeModes.push('strong-local')
  }
  if (isRuntimeHostSupported('vm')) {
    supportedRuntimeModes.push('vm')
  }
  if (isRuntimeHostSupported('container')) {
    supportedRuntimeModes.push('container')
  }
  const diagnostics = readLatestRuntimeNetworkDiagnosticsFromAudit()
  return {
    kind,
    label: available ? kind : `local fallback for ${kind}`,
    available,
    reason: available
      ? 'runtime host ready'
      : `runtime host "${kind}" is unavailable on this platform; falling back to local`,
    activeHosts: runtimeHostManager.listEnvironments().length,
    networkDiagnostics: diagnostics ?? undefined,
    effectiveRuntimeMode: available ? effectiveRuntimeMode : 'local',
    supportedRuntimeModes,
    degraded: !available && kind !== 'local',
    degradeReason:
      !available && kind !== 'local'
        ? `requested runtime host "${kind}" is unavailable on this platform`
        : '',
    lockState:
      lockSummary.staleLockProfileIds.length > 0
        ? 'stale-lock'
        : lockSummary.lockedProfileIds.length > 0 ||
            scheduler.getStartingIds().length > 0 ||
            scheduler.getQueuedIds().length > 0
          ? 'locked'
          : 'unlocked',
    controlPlaneStatus: controlPlaneConnectivityState.status,
    controlPlaneLastError: controlPlaneConnectivityState.lastError,
    controlPlaneLastErrorAt: controlPlaneConnectivityState.lastErrorAt,
    controlPlanePendingSyncCount: getControlPlanePendingSyncCount(),
    controlPlaneConsecutiveFailures: controlPlaneConnectivityState.consecutiveFailures,
    controlPlaneLastSuccessAt: controlPlaneConnectivityState.lastSuccessAt,
    controlPlaneRecoveryState,
    controlPlaneNextRetryAt: controlPlaneNextRetryAt || undefined,
  }
}

function persistProfile(profile: ProfileRecord): ProfileRecord {
  const fingerprintConfig = syncFingerprintConfigWithWorkspaceEnvironment(
    profile.fingerprintConfig,
    profile.workspace,
  )
  return requireDatabase().updateProfile({
    id: profile.id,
    name: profile.name,
    proxyId: profile.proxyId,
    groupName: profile.groupName,
    tags: profile.tags,
    notes: profile.notes,
    environmentPurpose: profile.environmentPurpose,
    deviceProfile: createDeviceProfileFromFingerprint(
      fingerprintConfig,
      profile.deviceProfile?.createdAt || profile.createdAt,
      profile.deviceProfile,
    ),
    fingerprintConfig,
    workspace: profile.workspace ?? null,
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

function updateEnvironmentSyncMetadata(
  profileId: string,
  patch: {
    status: ProfileRecord['fingerprintConfig']['runtimeMetadata']['lastEnvironmentSyncStatus'
    ]
    message: string
    syncedAt?: string
  },
): ProfileRecord | null {
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    return null
  }
  return updateRuntimeMetadata(profile, {
    lastEnvironmentSyncStatus: patch.status,
    lastEnvironmentSyncMessage: patch.message,
    lastEnvironmentSyncAt: patch.syncedAt ?? new Date().toISOString(),
  })
}

function updateEnvironmentSyncMetadataForProfiles(
  profileIds: string[],
  patch: {
    status: ProfileRecord['fingerprintConfig']['runtimeMetadata']['lastEnvironmentSyncStatus'
    ]
    message: string
    syncedAt?: string
  },
): void {
  for (const profileId of new Set(profileIds)) {
    updateEnvironmentSyncMetadata(profileId, patch)
  }
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
      environmentPurpose: payload.environmentPurpose || DEFAULT_ENVIRONMENT_PURPOSE,
      deviceProfile:
        payload.deviceProfile ||
        createDeviceProfileFromFingerprint(payload.fingerprintConfig, new Date().toISOString()),
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
      environmentPurpose: payload.environmentPurpose || DEFAULT_ENVIRONMENT_PURPOSE,
      deviceProfile:
        payload.deviceProfile ||
        createDeviceProfileFromFingerprint(payload.fingerprintConfig, new Date().toISOString()),
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
  const proxy = toCandidateProxy(originalProxy, toEntryTransport(originalProxy))
  const check = await checkNetworkHealth(profile, proxy)

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
    const detail = check.message || 'Unknown proxy preflight error'
    audit('proxy_preflight_failed', {
      profileId: profile.id,
      profileName: profile.name,
      platform: process.platform,
      detail,
      source: check.source,
    })
    throw new Error(`Proxy preflight failed for "${profile.name}": ${detail}`)
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
  let runtimeLockHeld = false
  let workspaceLaunch: ReturnType<typeof resolveWorkspaceLaunchConfig> | null = null
  let suppressContextCloseSideEffects = false

  if (runtimeContexts.has(profileId)) {
    return
  }
  profile = ensureWorkspaceLayoutForProfileId(profileId)
  try {
    acquireProfileRuntimeLock(profile)
    runtimeLockHeld = true

    const workspaceGate = validateWorkspaceGate(profile, database.listProfiles())
    profile = persistProfile({
      ...profile,
      workspace: workspaceGate.workspace,
    })
    profile = await refreshLastKnownGoodSnapshotStatus(profile)
    if (workspaceGate.status === 'block') {
      profile = updateRuntimeMetadata(profile, {
        lastValidationLevel: 'block',
        lastValidationMessages: workspaceGate.messages,
        launchValidationStage: 'idle',
      })
      throw new Error(workspaceGate.messages.join(' '))
    }
    if (workspaceGate.status === 'warn') {
      profile = updateRuntimeMetadata(profile, {
        lastValidationLevel: 'warn',
        lastValidationMessages: workspaceGate.messages,
        launchValidationStage: 'idle',
      })
    }
    const isolationPreflight = runLocalIsolationPreflight(profile, database.listProfiles(), {
      disableGpu: !profile.fingerprintConfig.commonSettings.hardwareAcceleration,
      getRuntimeLockState: getRuntimeLockStateForProfile,
    })
    workspaceLaunch = isolationPreflight.launch
    profile = persistProfile({
      ...profile,
      workspace: isolationPreflight.workspace,
    })
    profile = persistQuickIsolationTrust(profile, isolationPreflight.quickCheck)
    audit(
      isolationPreflight.status === 'block' ? 'isolation_preflight_failed' : 'isolation_preflight_passed',
      {
        profileId,
        status: isolationPreflight.status,
        workspaceHealthStatus: isolationPreflight.quickCheck.workspaceHealthStatus,
        workspaceConsistencyStatus: isolationPreflight.quickCheck.workspaceConsistencyStatus,
        runtimeLockStatus: isolationPreflight.quickCheck.runtimeLockStatus,
        canonicalRoot: isolationPreflight.quickCheck.canonicalRoot,
        message: isolationPreflight.quickCheck.message,
      },
    )
    void syncProfileLaunchTrustToControlPlane(profile)
    void syncWorkspaceSummaryToControlPlane(profile).catch(() => {})
    if (isolationPreflight.status === 'block') {
      profile = updateRuntimeMetadata(profile, {
        lastValidationLevel: 'block',
        lastValidationMessages: isolationPreflight.messages,
        launchValidationStage: 'idle',
      })
      throw new Error(isolationPreflight.messages.join(' '))
    }
    const proxy = resolveProfileProxy(profile, database)
    const validation = validateProfileReadiness(profile, proxy, undefined, undefined, getLifecyclePolicyContext())
    const configFingerprintHash = buildConfigFingerprintHash(profile)
    const proxyFingerprintHash = buildProxyFingerprintHash(profile, proxy)
    const existingSnapshot = profile.fingerprintConfig.runtimeMetadata.trustedLaunchSnapshot
    const trustedSnapshotDecision = evaluateTrustedSnapshotReuse(existingSnapshot, {
      configFingerprintHash,
      proxyFingerprintHash,
      currentDesktopAppVersion: app.getVersion(),
      currentChromiumMajor: resolveChromiumMajorForProfile(profile),
      currentHostEnvironment: detectDesktopHostEnvironment(),
      currentCanonicalRoot: workspaceLaunch?.canonicalRoot || '',
      runtimeLockStatus: getRuntimeLockStateForProfile(profile),
      workspaceHealthStatus: profile.workspace?.healthSummary.status || 'unknown',
      workspaceConsistencyStatus: profile.workspace?.consistencySummary.status || 'unknown',
      lastQuickIsolationCheck: profile.fingerprintConfig.runtimeMetadata.lastQuickIsolationCheck,
    })
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

    if (existingSnapshot && !trustedSnapshotDecision.usable) {
    audit('trusted_snapshot_rejected', {
      profileId,
      status: trustedSnapshotDecision.status,
      reason: trustedSnapshotDecision.reason,
    })
    profile = updateRuntimeMetadata(profile, {
      trustedSnapshotStatus: trustedSnapshotDecision.status,
      trustedLaunchSnapshot: {
        ...existingSnapshot,
        status: trustedSnapshotDecision.status,
      },
      lastValidationMessages: Array.from(
        new Set([
          ...profile.fingerprintConfig.runtimeMetadata.lastValidationMessages,
          trustedSnapshotDecision.reason,
        ].filter(Boolean)),
      ),
    })
    profile = persistTrustedLaunchSummary(profile, {
      trustedSnapshotStatus: trustedSnapshotDecision.status,
      trustedLaunchVerifiedAt:
        trustedSnapshotDecision.status === 'trusted' ? existingSnapshot.verifiedAt : '',
    })
    void syncWorkspaceSummaryToControlPlane(profile).catch(() => {})
    }

    if (trustedSnapshotDecision.usable) {
    usedTrustedSnapshot = true
    audit('quick_check_start', { profileId })
    profile = updateRuntimeMetadata(profile, {
      launchValidationStage: 'quick-check',
      trustedSnapshotStatus: 'trusted',
    })
    profile = persistTrustedLaunchSummary(profile, {
      trustedSnapshotStatus: 'trusted',
      trustedLaunchVerifiedAt: existingSnapshot?.verifiedAt || '',
    })
    check = await checkNetworkHealth(profile, proxy)
    effectiveProxyTransport = toEntryTransport(proxy)
    const comparison = compareSnapshotWithCheck(existingSnapshot!, check, effectiveProxyTransport)
    const quickCheck = buildQuickIsolationCheck(
      profile,
      check,
      effectiveProxyTransport,
      comparison.ok,
      comparison.message,
    )
    profile = updateRuntimeMetadata(profile, {
      lastQuickCheckAt: quickCheck.checkedAt,
      lastQuickCheckSuccess: quickCheck.success,
      lastQuickCheckMessage: quickCheck.message,
      lastEffectiveProxyTransport: effectiveProxyTransport,
      trustedSnapshotStatus: comparison.ok ? 'trusted' : 'invalid',
      trustedLaunchSnapshot: comparison.ok
        ? existingSnapshot
        : existingSnapshot
          ? { ...existingSnapshot, status: 'invalid', verificationLevel: 'quick' }
          : null,
    })
    profile = persistTrustedLaunchSummary(profile, {
      trustedSnapshotStatus: comparison.ok ? 'trusted' : 'invalid',
      trustedLaunchVerifiedAt: comparison.ok ? existingSnapshot?.verifiedAt || '' : '',
    })
    void syncProfileLaunchTrustToControlPlane(profile)
    void syncWorkspaceSummaryToControlPlane(profile).catch(() => {})
    if (!comparison.ok) {
      audit('quick_check_failed', { profileId, reason: comparison.message })
      throw new Error(comparison.message)
    }
    audit('trusted_launch_quick_check_passed', {
      profileId,
      verifiedAt: existingSnapshot?.verifiedAt || '',
      effectiveProxyTransport,
      egressIp: check.ip,
    })
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
      lastEffectiveProxyTransport: effectiveProxyTransport,
      trustedSnapshotStatus: 'stale',
    })
    profile = persistTrustedLaunchSummary(profile, {
      trustedSnapshotStatus: 'stale',
    })
    void syncWorkspaceSummaryToControlPlane(profile).catch(() => {})
    }

    const registrationCooldown = getRegistrationCooldownContext(profile, check)
    const readinessValidation = validateProfileReadiness(
      profile,
      resolvedProxy,
      check,
      registrationCooldown,
      getLifecyclePolicyContext(),
    )
    const registrationRisk = assessRegistrationRisk(
      profile,
      readinessValidation,
      check,
      registrationCooldown,
    )
    profile = updateRuntimeMetadata(profile, {
      lastValidationLevel: readinessValidation.level,
      lastValidationMessages: readinessValidation.messages,
      lastRegistrationRiskScore: registrationRisk.score,
      lastRegistrationRiskLevel: registrationRisk.level,
      lastRegistrationRiskFactors: registrationRisk.factors,
    })
    if (readinessValidation.level === 'block') {
      throw new Error(readinessValidation.messages.join(' '))
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
    audit('trusted_launch_snapshot_created', {
      profileId,
      verifiedAt: refreshedSnapshot.verifiedAt,
      effectiveProxyTransport,
      egressIp: refreshedSnapshot.verifiedEgressIp,
      country: refreshedSnapshot.verifiedCountry,
      region: refreshedSnapshot.verifiedRegion,
    })
    void syncProfileLaunchTrustToControlPlane(profile)
    }

    const directoryInfo = getProfileDirectoryInfo(app)
    ensureProfileDirectory(directoryInfo.profilesDir)
    profile = ensureWorkspaceLayoutForProfileId(profileId)
    const settings = database.getSettings()
    const fingerprint = profile.fingerprintConfig
    workspaceLaunch =
      workspaceLaunch ||
      resolveWorkspaceLaunchConfig(
        profile,
        !fingerprint.commonSettings.hardwareAcceleration,
      )
    const userDataDir = workspaceLaunch.userDataDir
    mkdirSync(userDataDir, { recursive: true })
    await runNonBlockingSyncSideEffect(profileId, 'storageState', async () => {
      await downloadProfileStorageStateFromControlPlane(profileId, { reason: 'startup' })
    })
    const runtimeHost = await runtimeHostManager.startEnvironment(profileId, userDataDir, getSettings())
    audit('runtime_host_ready', {
    profileId,
    kind: runtimeHost.kind,
    available: runtimeHost.available,
    reason: runtimeHost.reason,
    })

    const executablePath = resolveChromiumExecutable()

  const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless: false,
    executablePath,
    viewport: workspaceLaunch.viewport,
    locale: workspaceLaunch.locale,
    timezoneId: workspaceLaunch.timezoneId || DEFAULT_TIMEZONE_FALLBACK,
    userAgent: fingerprint.userAgent,
    ignoreHTTPSErrors: true,
    geolocation: parseGeolocation(fingerprint.advanced.geolocation),
    permissions:
      fingerprint.advanced.geolocationPermission === 'allow' && parseGeolocation(fingerprint.advanced.geolocation)
        ? ['geolocation']
        : [],
    args: workspaceLaunch.launchArgs,
    acceptDownloads: true,
    downloadsPath: workspaceLaunch.downloadsDir,
  }

  const launchProxy = await resolveLaunchProxy(resolvedProxy)
  if (resolvedProxy) {
    const bypassArg = `--proxy-bypass-list=${GOOGLE_PROXY_BYPASS_LIST}`
    if (!launchOptions.args?.some((arg) => arg.startsWith('--proxy-bypass-list='))) {
      launchOptions.args = [...(launchOptions.args ?? []), bypassArg]
    }
    launchOptions.proxy = launchProxy.config ?? undefined
  }
  launchOptions.args = applyProxyCompatibilityArgs(launchOptions.args ?? [], resolvedProxy, {
    bridgeActive: launchProxy.bridgeActive,
  })
  launchOptions.env = buildChromiumLaunchEnv()

    const diagnostics = buildNetworkDiagnosticsSummary(runtimeHost, check)
    rememberRuntimeNetworkDiagnostics({
      level: diagnostics.level,
      message: diagnostics.messages[0] || check.message || '',
      checkedAt: check.checkedAt,
      egressIp: check.ip,
      country: check.country || check.region,
      timezone: check.timezone,
    })
    audit('runtime_network_diagnostics', {
      profileId,
      level: diagnostics.level,
      messages: diagnostics.messages,
      message: diagnostics.messages[0] || check.message || '',
      checkedAt: check.checkedAt,
      egressIp: check.ip,
      country: check.country,
      region: check.region,
      timezone: check.timezone,
    })

    // Launch reads userDataDir and runtime config from workspace only. Legacy fingerprint fields are mirrors.
    const context = await chromium.launchPersistentContext(userDataDir, launchOptions)
    if (scheduler.isCancelled(profileId)) {
      await context.close()
      throw new Error('Launch cancelled')
    }
    runtimeContexts.set(profileId, context)
    markProfileRuntimeLockRunning(profileId)
    database.touchProfileLastStarted(profileId)
    const injectedFeatures = buildInjectedFeatures(profile)
    profile = updateRuntimeMetadata(profile, {
    launchRetryCount: scheduler.getRetryCounts()[profileId] ?? 0,
    injectedFeatures,
    })
    profile = persistTrustedLaunchSummary(profile, {
      trustedSnapshotStatus: profile.fingerprintConfig.runtimeMetadata.trustedSnapshotStatus,
      trustedLaunchVerifiedAt:
        profile.fingerprintConfig.runtimeMetadata.trustedLaunchSnapshot?.verifiedAt || '',
    })
    void syncWorkspaceSummaryToControlPlane(profile).catch(() => {})
    logEvent(
    'info',
    'runtime',
    `Launched profile "${profile.name}"${resolvedProxy ? ` proxyType=${resolvedProxy.type}; host=${resolvedProxy.host}; port=${resolvedProxy.port}; bridgeActive=${launchProxy.bridgeActive}; detail=${launchProxy.detail || 'none'}; upstream=${buildProxyServer(resolvedProxy)}` : ''}`,
    profileId,
    )
    await context.addInitScript(buildFingerprintInitScript(profile.id, profile.fingerprintConfig))
    let latestWorkspaceSnapshot: WorkspaceSnapshotRecord | null = null
    try {
    const existingSnapshots = await listWorkspaceSnapshotsForProfile(profileId)
    const localStorageState = await readProfileStorageStateFromDisk(profileId)
    const currentStorageState = {
      version: Number(profile.fingerprintConfig.runtimeMetadata.lastStorageStateVersion || 0),
      stateHash: localStorageState ? hashStorageState(localStorageState) : '',
      updatedAt: profile.fingerprintConfig.runtimeMetadata.lastStorageStateSyncedAt || '',
      deviceId: profile.fingerprintConfig.runtimeMetadata.lastStorageStateDeviceId || '',
      source: getDesktopAuthState().authenticated ? 'desktop' : 'local-disk',
    }
    const matchedSnapshot = existingSnapshots.find((snapshot) =>
      doesWorkspaceSnapshotMatchProfile(snapshot, profile, currentStorageState),
    )
    latestWorkspaceSnapshot = matchedSnapshot ?? (await createWorkspaceSnapshotForProfile(profileId))
    } catch (error) {
    audit('workspace_snapshot_create_failed', {
      profileId,
      err: error instanceof Error ? error.message : String(error),
    })
    }

  const persistStateOnLastPageClose = (pageToWatch: import('playwright').Page) => {
    pageToWatch.on('close', () => {
      if (context.pages().length > 1) {
        return
      }
      void saveProfileStorageStateToDiskSafely(profileId, context)
    })
  }

    context.on('close', () => {
    clearProfileStorageSyncTimer(profileId)
    runtimeContexts.delete(profileId)
    if (suppressContextCloseSideEffects) {
      scheduler.markStopped(profileId)
      void releaseProfileRuntimeLock(profileId)
      return
    }
    if (!gracefulShutdownInFlight && !runtimeShutdownFinalizing.has(profileId)) {
      if (hasPendingProfileConfigChanges(profileId)) {
        void pushProfileConfigToControlPlane(profileId, 'runtime-context-close').catch(() => {})
      }
      const persistedProfile = requireDatabase().getProfileById(profileId)
      if (persistedProfile?.workspace) {
        void syncWorkspaceSummaryToControlPlane(persistedProfile).catch(() => {})
        void createWorkspaceSnapshotForProfile(profileId).catch(() => {})
      }
      void uploadProfileStorageStateToControlPlane(profileId, { reason: 'context-close' })
      void releaseProfileRuntimeLock(profileId)
      scheduler.markStopped(profileId)
      void syncProfileStatusToControlPlane(profileId, 'stopped')
    }
    logEvent('info', 'runtime', `Closed profile "${profile.name}"`, profileId)
    })

    const pages = context.pages()
    const page = pages[0] ?? (await context.newPage())
    persistStateOnLastPageClose(page)
    context.on('page', (newPage) => {
    persistStateOnLastPageClose(newPage)
    })
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
    const startupNavigation = await navigateToStartupUrl(page, profileId, startupUrl)
    if (profile.environmentPurpose === 'register') {
      profile = updateRuntimeMetadata(profile, {
        lastRegisterLaunchAt: new Date().toISOString(),
      })
    }
    recordProfileIpUsage(profile, check, startupNavigation)
    const latestProfile = database.getProfileById(profileId) ?? profile
    const latestSnapshot = latestProfile.fingerprintConfig.runtimeMetadata.trustedLaunchSnapshot
    const nextSnapshot = latestSnapshot
      ? {
          ...latestSnapshot,
          startupNavigationPassed: startupNavigation.success,
          status: startupNavigation.success ? latestSnapshot.status : 'stale',
          verificationLevel:
            latestProfile.fingerprintConfig.runtimeMetadata.lastQuickCheckAt ? 'quick' : latestSnapshot.verificationLevel,
          verifiedAt: new Date().toISOString(),
        }
      : latestSnapshot
    const persisted = persistProfile({
      ...updateRuntimeMetadata(latestProfile, {
        launchValidationStage: 'idle',
        trustedSnapshotStatus:
          nextSnapshot?.status || latestProfile.fingerprintConfig.runtimeMetadata.trustedSnapshotStatus,
        trustedLaunchSnapshot: nextSnapshot,
      }),
      startupNavigation,
    })
    if (!startupNavigation.success) {
      logEvent(
        'warn',
        'runtime',
        `Profile launched, but default startup page failed to open: ${startupNavigation.message}`,
        profileId,
      )
    }
    audit(startupNavigation.success ? 'trusted_launch_confirmed' : 'trusted_launch_navigation_failed', {
      profileId,
      startupNavigationPassed: startupNavigation.success,
      startupNavigationReasonCode: startupNavigation.reasonCode,
      startupNavigationMessage: startupNavigation.message,
      verifiedAt: nextSnapshot?.verifiedAt || '',
      trustedSnapshotStatus: nextSnapshot?.status || latestProfile.fingerprintConfig.runtimeMetadata.trustedSnapshotStatus,
      startupUrl,
      finalUrl: startupNavigation.finalUrl,
    })
    if (startupNavigation.success && latestWorkspaceSnapshot) {
      await runNonBlockingSyncSideEffect(profileId, 'workspaceSnapshot', async () => {
        await markWorkspaceSnapshotAsLastKnownGood(
          profileId,
          latestWorkspaceSnapshot.snapshotId,
          new Date().toISOString(),
        )
      })
    }
    void syncProfileLaunchTrustToControlPlane(persisted)
  } catch (error) {
    const activeContext = runtimeContexts.get(profileId)
    if (activeContext) {
      suppressContextCloseSideEffects = true
      runtimeContexts.delete(profileId)
      try {
        await activeContext.close()
      } catch {
        // Ignore best-effort cleanup failures while surfacing the original launch error.
      }
    }
    if (runtimeLockHeld && !runtimeContexts.has(profileId)) {
      await releaseProfileRuntimeLock(profileId)
    }
    throw error
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
    recordProfileLaunchFailure(profileId, error)
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
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    throw new Error('Profile not found')
  }
  if (runtimeContexts.has(profileId)) {
    audit('enqueue_rejected_running', { profileId })
    throw new Error('Profile is already running')
  }
  if (scheduler.getStartingIds().includes(profileId)) {
    audit('enqueue_rejected_starting', { profileId })
    throw new Error('Profile is already starting')
  }
  if (scheduler.getQueuedIds().includes(profileId)) {
    audit('enqueue_rejected_queued', { profileId })
    throw new Error('Profile is already queued for launch')
  }
  const runtimeLockState = getRuntimeLockStateForProfile(profile)
  if (runtimeLockState === 'locked') {
    const existingLock = readRuntimeLockRecord(profile)
    audit('enqueue_rejected_runtime_lock', {
      profileId,
      ownerPid: existingLock?.ownerPid ?? null,
      updatedAt: existingLock?.updatedAt ?? '',
    })
    throw new Error(
      `Profile runtime lock is already active (pid=${existingLock?.ownerPid ?? 'unknown'}, updatedAt=${existingLock?.updatedAt ?? 'unknown'})`,
    )
  }
  if (scheduler.getQueuedIds().length > MAX_QUEUE) {
    audit('enqueue_rejected_queue_full', { profileId, queueLen: scheduler.getQueuedIds().length })
    throw new Error('launch queue is full')
  }
  const accepted = scheduler.enqueue(profileId)
  if (!accepted) {
    audit('enqueue_rejected_duplicate', { profileId })
    throw new Error('Profile launch is already pending')
  }
  audit('enqueue', { profileId, queueLen: scheduler.getQueuedIds().length })
}

async function performDesktopLogin(payload: {
  identifier: string
  password: string
  apiBase?: string
  rememberCredentials?: boolean
}): Promise<DesktopAuthState> {
  const identifier = String(payload.identifier || '').trim()
  const password = String(payload.password || '')
  const rememberCredentials = Boolean(payload.rememberCredentials)
  if (!identifier || !password) {
    throw new Error('请输入账号和密码')
  }
  requireDatabase().setSettings({
    ...getSettings(),
    [CONTROL_PLANE_AUTH_REMEMBER_KEY]: '0',
    [CONTROL_PLANE_REMEMBER_CREDENTIALS_KEY]: rememberCredentials ? '1' : '0',
    [CONTROL_PLANE_AUTH_IDENTIFIER_KEY]: rememberCredentials ? identifier : '',
    [CONTROL_PLANE_AUTH_PASSWORD_KEY]: rememberCredentials ? password : '',
  })
  let lastError: Error | null = null
  const attemptedBases: string[] = []

  for (const apiBase of buildControlPlaneLoginCandidates(payload.apiBase)) {
    attemptedBases.push(apiBase)
    try {
      const response = await requestJsonWithRetry(`${apiBase}/api/auth/login`, {
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
      const data = response.json
      if (!response.ok || data.success === false) {
        throw new Error(String(data.error || `${response.status} ${response.statusText}` || '登录失败'))
      }
      const user = (data.user || null) as AuthUser | null
      const token = String(data.token || '')
      if (!user || !token) {
        throw new Error('登录响应缺少用户或令牌')
      }
      saveDesktopAuth(apiBase, token, user)
      try {
        const result = await reconcileEnvironmentMirrorFromControlPlane('auto-full-reconcile')
        setLastConfigSyncResult(result)
        if (requireDatabase().getNextEnvironmentSyncTask()) {
          scheduleSharedDataAutoPush('resume-environment-sync-after-login')
        }
      } catch (syncError) {
        const message = syncError instanceof Error ? syncError.message : String(syncError)
        void reportEnvironmentSyncEvent({
          direction: 'pull',
          mode: 'auto',
          status: 'failed-warning',
          reason: 'auto-full-reconcile',
          errorMessage: message,
        })
        setLastConfigSyncResult({
          scope: 'environment',
          count: requireDatabase().listProfiles().length,
          source: 'account',
          usedLocalCache: true,
          message: '',
          warningMessage: `自动拉取环境失败，请手动从云端拉取最新环境：${message}`,
          localMirroredProfileCount: requireDatabase().listProfiles().length,
        })
        audit('profile_index_pull_after_login_failed', {
          apiBase,
          err: message,
        })
      }
      return getDesktopAuthState()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      audit('auth_login_failed', { apiBase, err: lastError.message })
    }
  }

  if (lastError) {
    throw new Error(`登录失败：${lastError.message}（已尝试：${attemptedBases.join(', ')}）`)
  }
  throw new Error('登录失败')
}

async function performRuntimeLaunch(profileId: string): Promise<{ warningMessage?: string }> {
  ensureWritable('runtime.launch')
  await enqueueLaunch(profileId)
  return {}
}

async function verifyProfileForControlTask(profileId: string): Promise<{
  level: 'pass' | 'warn' | 'block'
  messages: string[]
}> {
  const database = requireDatabase()
  const storedProfile = database.getProfileById(profileId)
  if (!storedProfile) {
    throw new Error('Profile not found')
  }

  let profile = ensureWorkspaceLayoutForProfileId(profileId)
  const workspaceGate = validateWorkspaceGate(profile, database.listProfiles())
  profile = persistProfile({
    ...profile,
    workspace: workspaceGate.workspace,
  })
  profile = await refreshLastKnownGoodSnapshotStatus(profile)

  const proxy = resolveProfileProxy(profile, database)
  const validation = validateProfileReadiness(profile, proxy, undefined, undefined, getLifecyclePolicyContext())
  const level =
    workspaceGate.status === 'block' || validation.level === 'block'
      ? 'block'
      : workspaceGate.status === 'warn' || validation.level === 'warn'
        ? 'warn'
        : 'pass'
  const messages = Array.from(new Set([...workspaceGate.messages, ...validation.messages]))

  updateRuntimeMetadata(profile, {
    lastValidationLevel: level,
    lastValidationMessages: messages,
    launchValidationStage: 'idle',
  })

  return { level, messages }
}

async function updateProfileStartupTarget(
  profileId: string,
  targetUrl: string,
  startupPlatform?: string,
): Promise<ProfileRecord> {
  const profile = requireDatabase().getProfileById(profileId)
  if (!profile) {
    throw new Error('Profile not found')
  }

  const nextPlatform = String(startupPlatform || '').trim()
  const persisted = persistProfile({
    ...profile,
    fingerprintConfig: {
      ...profile.fingerprintConfig,
      basicSettings: {
        ...profile.fingerprintConfig.basicSettings,
        platform: nextPlatform || profile.fingerprintConfig.basicSettings.platform,
        customPlatformUrl: targetUrl,
      },
    },
  })
  void syncWorkspaceSummaryToControlPlane(persisted).catch((error: unknown) => {
    audit('profile_startup_target_sync_failed', {
      profileId,
      targetUrl,
      startupPlatform: nextPlatform,
      err: error instanceof Error ? error.message : String(error),
    })
  })
  return persisted
}

function getRuntimeStatusSnapshot() {
  return {
    runningProfileIds: [...runtimeContexts.keys()],
    queuedProfileIds: scheduler.getQueuedIds(),
    startingProfileIds: scheduler.getStartingIds(),
    launchStages: Object.fromEntries(
      requireDatabase()
        .listProfiles()
        .map((profile) => [profile.id, profile.fingerprintConfig.runtimeMetadata.launchValidationStage]),
    ),
    retryCounts: scheduler.getRetryCounts(),
  }
}

function getProfilesDirectoryInfoPayload() {
  const info = getProfileDirectoryInfo(app)
  return {
    ...info,
    chromiumExecutable: resolveChromiumExecutable(),
  }
}

type SmokeStepStatus = 'passed' | 'failed' | 'skipped'

type SmokeStepResult = {
  step: string
  status: SmokeStepStatus
  detail: string
  data?: unknown
}

type SmokeResultPayload = {
  success: boolean
  platform: NodeJS.Platform
  appVersion: string
  startedAt: string
  finishedAt?: string
  outputDir: string
  smokeMode: 'ci'
  steps: SmokeStepResult[]
}

function pushSmokeStep(
  steps: SmokeStepResult[],
  step: string,
  status: SmokeStepStatus,
  detail: string,
  data?: unknown,
): void {
  steps.push({ step, status, detail, data })
}

async function writeSmokeArtifacts(result: SmokeResultPayload): Promise<void> {
  const outputDir = resolveSmokeOutputDir()
  mkdirSync(outputDir, { recursive: true })
  result.finishedAt = new Date().toISOString()
  await writeFile(path.join(outputDir, SMOKE_RESULT_FILE), JSON.stringify(result, null, 2), 'utf8')
  if (existsSync(AUDIT_LOG_PATH)) {
    const auditContent = await readFile(AUDIT_LOG_PATH, 'utf8').catch(() => '')
    if (auditContent) {
      await writeFile(path.join(outputDir, SMOKE_AUDIT_FILE), auditContent, 'utf8')
    }
  }
}

async function waitForRuntimeOutcome(
  profileId: string,
  timeoutMs = 45_000,
): Promise<{
  profile: ProfileRecord | null
  runtimeStatus: ReturnType<typeof getRuntimeStatusSnapshot>
  elapsedMs: number
}> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const profile = requireDatabase().getProfileById(profileId)
    const runtimeStatus = getRuntimeStatusSnapshot()
    const isActive =
      runtimeStatus.runningProfileIds.includes(profileId) ||
      runtimeStatus.startingProfileIds.includes(profileId) ||
      runtimeStatus.queuedProfileIds.includes(profileId)
    if (!profile) {
      return { profile: null, runtimeStatus, elapsedMs: Date.now() - startedAt }
    }
    if (!isActive && profile.status !== 'queued' && profile.status !== 'starting') {
      return { profile, runtimeStatus, elapsedMs: Date.now() - startedAt }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return {
    profile: requireDatabase().getProfileById(profileId),
    runtimeStatus: getRuntimeStatusSnapshot(),
    elapsedMs: timeoutMs,
  }
}

function buildSmokeFingerprint(proxy: ProxyRecord | null, startupUrl: string): FingerprintConfig {
  const fingerprint = createDefaultFingerprint()
  const defaultTimezone = String(process.env.DUOKAI_SMOKE_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC').trim()
  fingerprint.basicSettings.platform = 'custom'
  fingerprint.basicSettings.customPlatformUrl = startupUrl
  fingerprint.timezone = defaultTimezone || 'UTC'
  fingerprint.advanced.autoTimezoneFromIp = false
  if (proxy) {
    fingerprint.proxySettings.proxyMode = 'custom'
    fingerprint.proxySettings.proxyType = proxy.type
    fingerprint.proxySettings.host = proxy.host
    fingerprint.proxySettings.port = proxy.port
    fingerprint.proxySettings.username = proxy.username
    fingerprint.proxySettings.password = proxy.password
  }
  return fingerprint
}

async function ensureSmokeProxyAndProfile(): Promise<{
  proxy: ProxyRecord | null
  profile: ProfileRecord | null
}> {
  const database = requireDatabase()
  const smokeProxyHost = String(process.env.DUOKAI_SMOKE_PROXY_HOST || '').trim()
  const smokeProxyPort = Number(process.env.DUOKAI_SMOKE_PROXY_PORT || 0)
  const smokeStartupUrl = String(process.env.DUOKAI_SMOKE_STARTUP_URL || 'https://example.com').trim()
  const smokeProxyName = String(process.env.DUOKAI_SMOKE_PROXY_NAME || 'CI Desktop Smoke Proxy').trim()
  const smokeProfileName = String(process.env.DUOKAI_SMOKE_PROFILE_NAME || 'CI Desktop Smoke Profile').trim()
  const smokeProxyType = String(process.env.DUOKAI_SMOKE_PROXY_TYPE || 'https').trim()
  const proxy =
    smokeProxyHost && smokeProxyPort > 0
      ? (() => {
          const proxyPayload = createProxyPayload({
            name: smokeProxyName,
            type: smokeProxyType === 'socks5' ? 'socks5' : smokeProxyType === 'https' ? 'https' : 'http',
            host: smokeProxyHost,
            port: smokeProxyPort,
            username: String(process.env.DUOKAI_SMOKE_PROXY_USERNAME || '').trim(),
            password: String(process.env.DUOKAI_SMOKE_PROXY_PASSWORD || ''),
          })

          const existingProxy = database.listProxies().find((item) => item.name === smokeProxyName)
          return existingProxy
            ? database.updateProxy({ ...proxyPayload, id: existingProxy.id })
            : database.createProxy(proxyPayload)
        })()
      : null

  const existingProfile = database.listProfiles().find((item) => item.name === smokeProfileName)
  if (existingProfile) {
    database.deleteProfile(existingProfile.id)
  }
  const profilePayload = createProfilePayload(
    {
      id: randomUUID(),
      name: smokeProfileName,
      proxyId: null,
      groupName: 'CI Smoke',
      tags: ['ci', 'windows-smoke'],
      notes: 'Generated by desktop smoke harness',
      fingerprintConfig: buildSmokeFingerprint(proxy, smokeStartupUrl),
    },
    createDefaultFingerprint,
  )

  const profile = database.createProfile(profilePayload)

  return { proxy, profile }
}

async function runDesktopSmokeScenario(): Promise<void> {
  const result: SmokeResultPayload = {
    success: false,
    platform: process.platform,
    appVersion: app.getVersion(),
    startedAt: new Date().toISOString(),
    outputDir: resolveSmokeOutputDir(),
    smokeMode: 'ci',
    steps: [],
  }

  try {
    pushSmokeStep(result.steps, 'meta.getInfo', 'passed', 'Loaded desktop metadata', {
      mode: isDev ? 'development' : 'production',
      capabilities: CAPABILITIES.length,
    })

    const directoryInfo = getProfilesDirectoryInfoPayload()
    pushSmokeStep(
      result.steps,
      'profiles.getDirectoryInfo',
      directoryInfo.chromiumExecutable ? 'passed' : 'failed',
      directoryInfo.chromiumExecutable ? 'Chromium executable resolved' : 'Chromium executable missing',
      directoryInfo,
    )

    const smokeIdentifier = String(process.env.DUOKAI_SMOKE_IDENTIFIER || '').trim()
    const smokePassword = String(process.env.DUOKAI_SMOKE_PASSWORD || '')
    const smokeApiBase = String(process.env.DUOKAI_SMOKE_API_BASE || '').trim()

    if (smokeIdentifier && smokePassword) {
      try {
        const authState = await performDesktopLogin({
          identifier: smokeIdentifier,
          password: smokePassword,
          apiBase: smokeApiBase || undefined,
        })
        pushSmokeStep(result.steps, 'auth.login', 'passed', 'Desktop login succeeded', authState)
      } catch (error) {
        pushSmokeStep(
          result.steps,
          'auth.login',
          'failed',
          error instanceof Error ? error.message : String(error),
        )
      }
    } else {
      pushSmokeStep(result.steps, 'auth.login', 'skipped', 'Missing DUOKAI_SMOKE_IDENTIFIER / DUOKAI_SMOKE_PASSWORD')
    }

    const { proxy, profile } = await ensureSmokeProxyAndProfile()
    pushSmokeStep(
      result.steps,
      'smoke.setup',
      profile ? 'passed' : 'skipped',
      profile ? `Using profile "${profile.name}"` : 'No profile available for runtime smoke',
      {
        profileId: profile?.id || null,
        proxyId: proxy?.id || null,
        proxyServer: proxy ? buildProxyServer(proxy) : null,
        proxyType: proxy?.type || null,
      },
    )

    if (proxy) {
      try {
        const proxyTest = await testProxyById(proxy.id)
        pushSmokeStep(
          result.steps,
          'proxies.test',
          proxyTest.success ? 'passed' : 'failed',
          proxyTest.message || (proxyTest.success ? 'Proxy test succeeded' : 'Proxy test failed'),
          {
            ...proxyTest,
            proxyServer: buildProxyServer(proxy),
            proxyType: proxy.type,
          },
        )
      } catch (error) {
        pushSmokeStep(
          result.steps,
          'proxies.test',
          'failed',
          error instanceof Error ? error.message : String(error),
          {
            proxyServer: buildProxyServer(proxy),
            proxyType: proxy.type,
          },
        )
      }
    } else {
      pushSmokeStep(result.steps, 'proxies.test', 'skipped', 'No proxy configured for smoke scenario')
    }

    if (profile) {
      try {
        await performRuntimeLaunch(profile.id)
        const outcome = await waitForRuntimeOutcome(profile.id)
        const latestProfile = outcome.profile
        const logs = requireDatabase().listLogs().slice(-20)
        const metadata = latestProfile?.fingerprintConfig.runtimeMetadata || null
        const launchPassed = Boolean(
          latestProfile &&
            (latestProfile.status === 'running' ||
              latestProfile.status === 'stopped' ||
              (metadata?.lastProxyCheckSuccess === true && metadata.launchValidationStage === 'idle')),
        )
        pushSmokeStep(
          result.steps,
          'runtime.launch',
          launchPassed ? 'passed' : 'failed',
          latestProfile
            ? `Runtime finished with profile status "${latestProfile.status}" after ${outcome.elapsedMs}ms`
            : 'Profile disappeared during runtime smoke',
          {
            elapsedMs: outcome.elapsedMs,
            runtimeStatus: outcome.runtimeStatus,
            profileStatus: latestProfile?.status || null,
            profileId: latestProfile?.id || profile.id,
            lastProxyCheckSuccess: metadata?.lastProxyCheckSuccess ?? null,
            lastProxyCheckMessage: metadata?.lastProxyCheckMessage || '',
            lastResolvedIp: metadata?.lastResolvedIp || '',
            lastResolvedCountry: metadata?.lastResolvedCountry || '',
            lastResolvedTimezone: metadata?.lastResolvedTimezone || '',
            logs,
          },
        )
        if (runtimeContexts.has(profile.id)) {
          await stopRuntime(profile.id)
        }
      } catch (error) {
        pushSmokeStep(
          result.steps,
          'runtime.launch',
          'failed',
          error instanceof Error ? error.message : String(error),
          {
            runtimeStatus: getRuntimeStatusSnapshot(),
            logs: requireDatabase().listLogs().slice(-20),
          },
        )
      }
    } else {
      pushSmokeStep(result.steps, 'runtime.launch', 'skipped', 'No profile available for runtime launch smoke')
    }

    result.success = result.steps.every((step) => step.status !== 'failed')
  } catch (error) {
    pushSmokeStep(
      result.steps,
      'smoke.unhandled',
      'failed',
      error instanceof Error ? error.message : String(error),
    )
    result.success = false
  } finally {
    await writeSmokeArtifacts(result)
    setTimeout(() => app.exit(result.success ? 0 : 1), 300)
  }
}

async function registerIpcHandlers(): Promise<void> {
  ipcMain.handle('auth.getState', async () => getDesktopAuthState())
  ipcMain.handle(
    'auth.login',
    async (_event, payload: { identifier: string; password: string; apiBase?: string; rememberCredentials?: boolean }) =>
      performDesktopLogin(payload),
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
  ipcMain.handle('auth.syncGlobalConfig', async () => {
    ensureControlPlaneConfigWritable('auth.syncGlobalConfig')
    return pushGlobalConfigToControlPlaneManually('auth.manual-upload-global-config')
  })
  ipcMain.handle('auth.pullGlobalConfig', async () => {
    ensureControlPlaneConfigWritable('auth.pullGlobalConfig')
    const result = await syncConfigFromControlPlane()
    result.scope = 'global-config'
    result.updatedAt = new Date().toISOString()
    return setLastConfigSyncResult(result)!
  })
  ipcMain.handle('auth.syncProfiles', async () => {
    ensureControlPlaneConfigWritable('auth.syncProfiles')
    return pushEnvironmentProfilesToControlPlaneManually('auth.manual-upload-profiles')
  })
  ipcMain.handle('auth.pullProfiles', async () => {
    ensureControlPlaneConfigWritable('auth.pullProfiles')
    if (runtimeContexts.size > 0 || scheduler.getQueuedIds().length > 0 || scheduler.getStartingIds().length > 0) {
      throw new Error('当前存在运行中或启动中的环境，请先停止环境后再从云端拉取环境')
    }
    try {
      const result = await pullEnvironmentProfilesFromControlPlaneOrThrow('manual-force-pull')
      void reportEnvironmentSyncEvent({
        direction: 'pull',
        mode: 'manual',
        status: 'succeeded',
        profileIds: requireDatabase().listProfiles().map((profile) => profile.id),
        reason: 'manual-force-pull',
        cloudProfileCount: result.cloudProfileCount,
        localMirroredProfileCount: result.localMirroredProfileCount,
      })
      return setLastConfigSyncResult({
        scope: 'environment',
        count: result.localMirroredProfileCount,
        source: agentService?.getState().enabled ? 'agent' : 'account',
        usedLocalCache: false,
        message: `已从云端拉取环境：云端 ${result.cloudProfileCount} 个环境，本地已收敛为 ${result.localMirroredProfileCount} 个环境，拉取更新 ${result.autoPulledCount} 个，移除本地旧镜像 ${result.removedLocalMirrorCount} 个`,
        warningMessage: '',
        ...buildEnvironmentCountFields({
          cloudProfileCount: result.cloudProfileCount,
          localMirroredProfileCount: result.localMirroredProfileCount,
          autoPulledCount: result.autoPulledCount,
          removedLocalMirrorCount: result.removedLocalMirrorCount,
          remoteProfileCount: result.cloudProfileCount,
          localProfileCountAfterPull: result.localMirroredProfileCount,
          removedLocalOrphanCount: result.removedLocalMirrorCount,
          updatedProfileCount: result.autoPulledCount,
        }),
      } satisfies ConfigSyncResult)!
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      void reportEnvironmentSyncEvent({
        direction: 'pull',
        mode: 'manual',
        status: 'failed-warning',
        reason: 'manual-force-pull',
        errorMessage: message,
      })
      throw error
    }
  })

  ipcMain.handle('meta.getInfo', async () => getDesktopRuntimeInfo())
  ipcMain.handle('meta.getAgentState', async () => getAgentStateSnapshot())
  ipcMain.handle('updater.getState', async () => updateState)
  ipcMain.handle('updater.check', async () => checkForDesktopUpdates())
  ipcMain.handle('updater.download', async () => downloadDesktopUpdate())
  ipcMain.handle('updater.install', async () => installDownloadedUpdate())
  ipcMain.handle('updater.openReleasePage', async () => {
    await shell.openExternal(updateState.releaseUrl || DESKTOP_RELEASES_PAGE)
  })

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
    ensureControlPlaneConfigWritable('cloudPhones.create')
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
    scheduleGlobalConfigMutation('云手机环境已创建，等待上传到云端')
    logEvent('info', 'cloud-phone', `Created cloud phone "${record.name}" via ${provider.label}`, null)
    return requireDatabase().getCloudPhoneById(record.id)!
  })
  ipcMain.handle('cloudPhones.update', async (_event, input: UpdateCloudPhoneInput) => {
    ensureWritable('cloudPhones.update')
    ensureControlPlaneConfigWritable('cloudPhones.update')
    const resolvedProxy = resolveCloudPhoneProxyConfig(input)
    const payload = createCloudPhonePayload({ ...input, ...resolvedProxy }, input.providerKey)
    const record = requireDatabase().updateCloudPhone(payload)
    const provider = resolveCloudPhoneProvider(record)
    await provider.updateEnvironment(record, getSettings())
    scheduleGlobalConfigMutation('云手机环境已更新，等待上传到云端')
    logEvent('info', 'cloud-phone', `Updated cloud phone "${record.name}" via ${provider.label}`, null)
    return record
  })
  ipcMain.handle('cloudPhones.delete', async (_event, cloudPhoneId: string) => {
    ensureWritable('cloudPhones.delete')
    ensureControlPlaneConfigWritable('cloudPhones.delete')
    const record = requireDatabase().getCloudPhoneById(cloudPhoneId)
    if (record) {
      const provider = resolveCloudPhoneProvider(record)
      await provider.deleteEnvironment(record, getSettings())
    }
    requireDatabase().deleteCloudPhone(cloudPhoneId)
    scheduleGlobalConfigMutation('云手机环境已删除，等待上传到云端')
    logEvent('warn', 'cloud-phone', `Deleted cloud phone ${cloudPhoneId}`, null)
  })
  ipcMain.handle('cloudPhones.start', async (_event, cloudPhoneId: string) => {
    ensureWritable('cloudPhones.start')
    await startCloudPhone(cloudPhoneId)
    scheduleGlobalConfigMutation('云手机环境状态已在本地更新，等待上传到云端')
  })
  ipcMain.handle('cloudPhones.stop', async (_event, cloudPhoneId: string) => {
    ensureWritable('cloudPhones.stop')
    await stopCloudPhone(cloudPhoneId)
    scheduleGlobalConfigMutation('云手机环境状态已在本地更新，等待上传到云端')
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
    scheduleGlobalConfigMutation('批量云手机状态已在本地更新，等待上传到云端')
  })
  ipcMain.handle('cloudPhones.bulkStop', async (_event, payload: CloudPhoneBulkActionPayload) => {
    ensureWritable('cloudPhones.bulkStop')
    for (const cloudPhoneId of payload.cloudPhoneIds) {
      await stopCloudPhone(cloudPhoneId)
    }
    scheduleGlobalConfigMutation('批量云手机状态已在本地更新，等待上传到云端')
  })
  ipcMain.handle('cloudPhones.bulkDelete', async (_event, payload: CloudPhoneBulkActionPayload) => {
    ensureWritable('cloudPhones.bulkDelete')
    ensureControlPlaneConfigWritable('cloudPhones.bulkDelete')
    for (const cloudPhoneId of payload.cloudPhoneIds) {
      const record = requireDatabase().getCloudPhoneById(cloudPhoneId)
      if (record) {
        const provider = resolveCloudPhoneProvider(record)
        await provider.deleteEnvironment(record, getSettings())
      }
    }
    requireDatabase().bulkDeleteCloudPhones(payload.cloudPhoneIds)
    scheduleGlobalConfigMutation('批量云手机环境已删除，等待上传到云端')
    logEvent('warn', 'cloud-phone', `Deleted ${payload.cloudPhoneIds.length} cloud phones`, null)
  })
  ipcMain.handle('cloudPhones.bulkAssignGroup', async (_event, payload: CloudPhoneBulkActionPayload) => {
    ensureWritable('cloudPhones.bulkAssignGroup')
    ensureControlPlaneConfigWritable('cloudPhones.bulkAssignGroup')
    requireDatabase().bulkAssignCloudPhoneGroup(payload.cloudPhoneIds, payload.groupName ?? '')
    scheduleGlobalConfigMutation('云手机分组已在本地更新，等待上传到云端')
    logEvent('info', 'cloud-phone', `Updated group for ${payload.cloudPhoneIds.length} cloud phones`, null)
  })

  ipcMain.handle('profiles.list', async () => requireDatabase().listProfiles())
  ipcMain.handle('profiles.create', async (_event, input: CreateProfileInput) => {
    ensureWritable('profiles.create')
    ensureControlPlaneConfigWritable('profiles.create')
    const payload = await applyResolvedNetworkProfileToPayload(
      createProfilePayload(input, createDefaultFingerprint),
      requireDatabase(),
    )
    assertProfileNameUniqueOrThrow(payload.name)
    const profile = requireDatabase().createProfile(payload)
    scheduleProfileConfigAfterLocalMutation('create', profile)
    logEvent('info', 'profile', `Created profile "${profile.name}"`, profile.id)
    return profile
  })
  ipcMain.handle('profiles.update', async (_event, input: UpdateProfileInput) => {
    ensureWritable('profiles.update')
    ensureControlPlaneConfigWritable('profiles.update')
    const existingProfile = requireDatabase().getProfileById(input.id)
    const payload = applyPurposeTransitionMetadata(
      await applyResolvedNetworkProfileToPayload(
        createProfilePayload(input, createDefaultFingerprint),
        requireDatabase(),
      ),
      existingProfile,
    )
    assertProfileNameUniqueOrThrow(payload.name, payload.id)
    const profile = requireDatabase().updateProfile(payload)
    if (existingProfile?.status === 'error' && !runtimeContexts.has(profile.id)) {
      requireDatabase().setProfileStatus(profile.id, 'stopped')
    }
    scheduleProfileConfigAfterLocalMutation('update', profile)
    logEvent('info', 'profile', `Updated profile "${profile.name}"`, profile.id)
    return profile
  })
  ipcMain.handle('profiles.delete', async (_event, profileId: string) => {
    ensureWritable('profiles.delete')
    ensureControlPlaneConfigWritable('profiles.delete')
    await stopRuntime(profileId)
    requireDatabase().deleteProfile(profileId)
    setLastConfigSyncResult(buildEnvironmentSyncPendingResult('环境已在本地删除，等待同步到云端'))
    scheduleSharedDataAutoPush('delete-profile', [profileId])
    logEvent('warn', 'profile', `Deleted profile ${profileId}`, profileId)
  })
  ipcMain.handle('profiles.clone', async (_event, profileId: string) => {
    ensureWritable('profiles.clone')
    ensureControlPlaneConfigWritable('profiles.clone')
    const profile = requireDatabase().cloneProfile(profileId)
    scheduleProfileConfigAfterLocalMutation('clone', profile)
    logEvent('info', 'profile', `Cloned profile "${profile.name}"`, profile.id)
    return profile
  })
  ipcMain.handle('profiles.syncConfig', async (_event, profileId: string) => {
    ensureWritable('profiles.syncConfig')
    ensureControlPlaneConfigWritable('profiles.syncConfig')
    return pushProfileConfigToControlPlane(profileId, 'profiles.manual-upload')
  })
  ipcMain.handle('profiles.pullConfig', async (_event, profileId: string) => {
    ensureWritable('profiles.pullConfig')
    ensureControlPlaneConfigWritable('profiles.pullConfig')
    return pullProfileConfigFromControlPlane(profileId, { force: true })
  })
  ipcMain.handle('profiles.syncStorageState', async (_event, profileId: string) => {
    ensureWritable('profiles.syncStorageState')
    ensureControlPlaneConfigWritable('profiles.syncStorageState')
    return uploadProfileStorageStateToControlPlane(profileId, {
      context: runtimeContexts.get(profileId) || null,
      reason: 'manual-upload',
    })
  })
  ipcMain.handle('profiles.pullStorageState', async (_event, profileId: string) => {
    ensureWritable('profiles.pullStorageState')
    ensureControlPlaneConfigWritable('profiles.pullStorageState')
    return downloadProfileStorageStateFromControlPlane(profileId, {
      force: true,
      reason: 'manual',
    })
  })
  ipcMain.handle('profiles.revealDirectory', async (_event, profileId: string) => {
    ensureWorkspaceLayoutForProfileId(profileId)
    const profilePath = getProfilePath(app, profileId)
    await shell.openPath(profilePath)
  })
  ipcMain.handle('profiles.getDirectoryInfo', async () => getProfilesDirectoryInfoPayload())
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
    ensureControlPlaneConfigWritable('profiles.bulkDelete')
    await stopMany(payload.profileIds)
    requireDatabase().bulkDeleteProfiles(payload.profileIds)
    setLastConfigSyncResult(buildEnvironmentSyncPendingResult('批量环境已在本地删除，等待同步到云端'))
    scheduleSharedDataAutoPush('bulk-delete-profile', payload.profileIds)
    logEvent('warn', 'profile', `Deleted ${payload.profileIds.length} profiles`, null)
  })
  ipcMain.handle('profiles.bulkAssignGroup', async (_event, payload: ProfileBulkActionPayload) => {
    ensureWritable('profiles.bulkAssignGroup')
    ensureControlPlaneConfigWritable('profiles.bulkAssignGroup')
    requireDatabase().bulkAssignGroup(payload.profileIds, payload.groupName ?? '')
    setLastConfigSyncResult(buildEnvironmentSyncPendingResult('环境分组已在本地更新，等待上传到云端'))
    updateEnvironmentSyncMetadataForProfiles(payload.profileIds, {
      status: 'pending',
      message: '环境分组已在本地更新，等待上传到云端',
    })
    scheduleSharedDataAutoPush('bulk-assign-profile-group', payload.profileIds)
    logEvent('info', 'profile', `Updated group for ${payload.profileIds.length} profiles`, null)
  })

  ipcMain.handle('templates.list', async () => requireDatabase().listTemplates())
  ipcMain.handle('templates.create', async (_event, input: CreateTemplateInput) => {
    ensureWritable('templates.create')
    ensureControlPlaneConfigWritable('templates.create')
    const template = requireDatabase().createTemplate(
      createTemplatePayload(input, createDefaultFingerprint),
    )
    scheduleGlobalConfigMutation('模板已在本地创建，等待上传到云端')
    logEvent('info', 'profile', `Created template "${template.name}"`, null)
    return template
  })
  ipcMain.handle('templates.update', async (_event, input: UpdateTemplateInput) => {
    ensureWritable('templates.update')
    ensureControlPlaneConfigWritable('templates.update')
    const template = requireDatabase().updateTemplate(
      createTemplatePayload(input, createDefaultFingerprint),
    )
    scheduleGlobalConfigMutation('模板已在本地更新，等待上传到云端')
    logEvent('info', 'profile', `Updated template "${template.name}"`, null)
    return template
  })
  ipcMain.handle('templates.delete', async (_event, templateId: string) => {
    ensureWritable('templates.delete')
    ensureControlPlaneConfigWritable('templates.delete')
    requireDatabase().deleteTemplate(templateId)
    scheduleGlobalConfigMutation('模板已在本地删除，等待上传到云端')
    logEvent('warn', 'profile', `Deleted template ${templateId}`, null)
  })
  ipcMain.handle('templates.createFromProfile', async (_event, profileId: string) => {
    ensureWritable('templates.createFromProfile')
    ensureControlPlaneConfigWritable('templates.createFromProfile')
    const template = requireDatabase().createTemplateFromProfile(profileId)
    scheduleGlobalConfigMutation('模板已从环境生成，等待上传到云端')
    logEvent('info', 'profile', `Created template from profile "${template.name}"`, null)
    return template
  })

  ipcMain.handle('proxies.list', async () => requireDatabase().listProxies())
  ipcMain.handle('proxies.create', async (_event, input: CreateProxyInput) => {
    ensureWritable('proxies.create')
    ensureControlPlaneConfigWritable('proxies.create')
    const payload = createProxyPayload(input)
    const proxy = requireDatabase().createProxy(payload)
    scheduleGlobalConfigMutation('代理已在本地创建，等待上传到云端')
    logEvent('info', 'proxy', `Created proxy "${proxy.name}"`, null)
    return proxy
  })
  ipcMain.handle('proxies.update', async (_event, input: UpdateProxyInput) => {
    ensureWritable('proxies.update')
    ensureControlPlaneConfigWritable('proxies.update')
    const payload = createProxyPayload(input)
    const proxy = requireDatabase().updateProxy(payload)
    scheduleGlobalConfigMutation('代理已在本地更新，等待上传到云端')
    logEvent('info', 'proxy', `Updated proxy "${proxy.name}"`, null)
    return proxy
  })
  ipcMain.handle('proxies.delete', async (_event, proxyId: string) => {
    ensureWritable('proxies.delete')
    ensureControlPlaneConfigWritable('proxies.delete')
    requireDatabase().deleteProxy(proxyId)
    scheduleGlobalConfigMutation('代理已在本地删除，等待上传到云端')
    logEvent('warn', 'proxy', `Deleted proxy ${proxyId}`, null)
  })
  ipcMain.handle('proxies.test', async (_event, proxyId: string) => {
    ensureWritable('proxies.test')
    return testProxyById(proxyId)
  })

  ipcMain.handle('runtime.launch', async (_event, profileId: string) => performRuntimeLaunch(profileId))
  ipcMain.handle('runtime.stop', async (_event, profileId: string) => {
    ensureWritable('runtime.stop')
    await stopRuntime(profileId)
    await updateProfileStatus(profileId, 'stopped')
  })
  ipcMain.handle('runtime.getStatus', async () => getRuntimeStatusSnapshot())
  ipcMain.handle('runtime.getHostInfo', async () => getRuntimeHostInfo())
  ipcMain.handle('runtime.ensureLocalRuntime', async (_event, runtimeApiKey?: string) => {
    return await ensureLocalRuntimeRunning(app, runtimeApiKey)
  })
  ipcMain.handle('runtime.getLocalRuntimeInfo', async (_event, runtimeApiKey?: string) => {
    return await getLocalRuntimeInfo(app, runtimeApiKey)
  })
  ipcMain.handle('workspace.snapshots.list', async (_event, profileId: string) => {
    return listWorkspaceSnapshotsForProfile(profileId)
  })
  ipcMain.handle('workspace.snapshots.create', async (_event, profileId: string) => {
    ensureWritable('workspace.snapshots.create')
    return createWorkspaceSnapshotForProfile(profileId)
  })
  ipcMain.handle('workspace.snapshots.restore', async (_event, profileId: string, snapshotId: string) => {
    ensureWritable('workspace.snapshots.restore')
    ensureControlPlaneConfigWritable('workspace.snapshots.restore')
    return restoreWorkspaceSnapshotForProfile(profileId, snapshotId)
  })
  ipcMain.handle('workspace.snapshots.rollback', async (_event, profileId: string) => {
    ensureWritable('workspace.snapshots.rollback')
    ensureControlPlaneConfigWritable('workspace.snapshots.rollback')
    return rollbackWorkspaceSnapshotForProfile(profileId)
  })

  ipcMain.handle('logs.list', async () => requireDatabase().listLogs())
  ipcMain.handle('logs.clear', async () => requireDatabase().clearLogs())

  ipcMain.handle('settings.get', async () => requireDatabase().getSettings())
  ipcMain.handle('settings.set', async (_event, payload: SettingsPayload) => {
    ensureWritable('settings.set')
    ensureControlPlaneConfigWritable('settings.set')
    const data = requireDatabase().setSettings(payload)
    syncTheme()
    scheduleGlobalConfigMutation('应用设置已在本地更新，等待上传到云端')
    logEvent('info', 'system', 'Updated application settings', null)
    return data
  })
  ipcMain.handle('data.previewBundle', async () => buildExportBundleV2(requireDatabase()))
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
    const bundle = await buildExportBundleV2(requireDatabase())
    await writeFile(selected.filePath, JSON.stringify(bundle, null, 2), 'utf8')
    logEvent('info', 'system', 'Exported local configuration bundle', null)
    return selected.filePath
  })
  ipcMain.handle('data.importBundle', async () => {
    ensureWritable('data.importBundle')
    ensureControlPlaneConfigWritable('data.importBundle')
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
    const baseResult = requireDatabase().importBundle(bundle)
    const result = await importWorkspaceSnapshotsFromBundle(app, requireDatabase(), bundle, baseResult)
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
      if (
        state.lastErrorKind === 'network' &&
        state.lastRecoverableFailureAt &&
        state.lastRecoverableFailureAt !== lastLoggedAgentRecoverableFailureAt
      ) {
        lastLoggedAgentRecoverableFailureAt = state.lastRecoverableFailureAt
        const isGlobalNetworkFailure = state.lastRecoverableFailureSource === 'global-network'
        audit(isGlobalNetworkFailure ? 'agent_global_network_error_recovered' : 'agent_network_recoverable_error', {
          agentId: state.agentId,
          err: state.lastError,
          code: state.lastErrorCode || '',
          consecutiveFailures: state.consecutiveFailures,
          at: state.lastRecoverableFailureAt,
        })
        traceStartup(isGlobalNetworkFailure ? 'agent_global_network_error_recovered' : 'agent_network_recoverable_error', {
          agentId: state.agentId,
          err: state.lastError,
          code: state.lastErrorCode || '',
          consecutiveFailures: state.consecutiveFailures,
        })
        audit(isGlobalNetworkFailure ? 'agent_global_network_reconnect_scheduled' : 'agent_network_reconnect_scheduled', {
          agentId: state.agentId,
          err: state.lastError,
          code: state.lastErrorCode || '',
          consecutiveFailures: state.consecutiveFailures,
        })
      }
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
        return { status: 'SUCCEEDED', diagnostics: { action: 'start', profileId } }
      }

      if (task.type === 'PROFILE_STOP') {
        const profileId = String(payload.profileId || '').trim()
        if (!profileId) {
          return { status: 'FAILED', errorCode: 'INVALID_PAYLOAD', errorMessage: 'profileId is required' }
        }
        await stopRuntime(profileId)
        await updateProfileStatus(profileId, 'stopped')
        return { status: 'SUCCEEDED', diagnostics: { action: 'stop', profileId } }
      }

      if (task.type === 'WORKSPACE_SNAPSHOT') {
        const profileId = String(payload.profileId || '').trim()
        if (!profileId) {
          return { status: 'FAILED', errorCode: 'INVALID_PAYLOAD', errorMessage: 'profileId is required' }
        }
        const snapshot = await createWorkspaceSnapshotForProfile(profileId)
        return {
          status: 'SUCCEEDED',
          outputRef: snapshot.snapshotId,
          diagnostics: {
            action: 'snapshot',
            profileId,
            snapshotId: snapshot.snapshotId,
            createdAt: snapshot.createdAt,
          },
        }
      }

      if (task.type === 'WORKSPACE_RESTORE') {
        const profileId = String(payload.profileId || '').trim()
        const snapshotId = String(payload.snapshotId || '').trim()
        if (!profileId || !snapshotId) {
          return {
            status: 'FAILED',
            errorCode: 'INVALID_PAYLOAD',
            errorMessage: 'profileId and snapshotId are required',
          }
        }
        await restoreWorkspaceSnapshotForProfile(profileId, snapshotId, 'control-task:restore')
        return {
          status: 'SUCCEEDED',
          outputRef: snapshotId,
          diagnostics: { action: 'restore', profileId, snapshotId },
        }
      }

      if (task.type === 'PROFILE_VERIFY') {
        const profileId = String(payload.profileId || '').trim()
        if (!profileId) {
          return { status: 'FAILED', errorCode: 'INVALID_PAYLOAD', errorMessage: 'profileId is required' }
        }
        const result = await verifyProfileForControlTask(profileId)
        if (result.level === 'block') {
          return {
            status: 'FAILED',
            errorCode: 'POLICY_BLOCK',
            errorMessage: result.messages.join(' ') || 'Profile verification failed',
            diagnostics: { action: 'verify', profileId, level: result.level, messages: result.messages },
          }
        }
        return {
          status: 'SUCCEEDED',
          outputRef: JSON.stringify({ level: result.level, messages: result.messages }),
          diagnostics: { action: 'verify', profileId, level: result.level, messages: result.messages },
        }
      }

      if (task.type === 'OPEN_PLATFORM') {
        const profileId = String(payload.profileId || '').trim()
        const targetUrl = String(payload.targetUrl || '').trim()
        const startupPlatform = String(payload.startupPlatform || payload.platform || '').trim()
        if (!profileId) {
          return { status: 'FAILED', errorCode: 'INVALID_PAYLOAD', errorMessage: 'profileId is required' }
        }
        if (targetUrl) {
          await updateProfileStartupTarget(profileId, targetUrl, startupPlatform)
        }
        await performRuntimeLaunch(profileId)
        return {
          status: 'SUCCEEDED',
          outputRef: targetUrl || profileId,
          diagnostics: {
            action: 'open-platform',
            profileId,
            targetUrl,
            startupPlatform,
          },
        }
      }

      return { status: 'FAILED', errorCode: 'UNSUPPORTED_TASK', errorMessage: `Unsupported task: ${task.type}` }
    },
  })

  agentService.start()
}

async function bootstrap(): Promise<void> {
  traceStartup('bootstrap_begin')
  await app.whenReady()
  traceStartup('app_ready', {
    userData: app.getPath('userData'),
    version: app.getVersion(),
  })
  syncTheme()
  traceStartup('theme_synced')
  db = new DatabaseService(app)
  traceStartup('database_initialized')
  clearPersistedDesktopAuthOnStartup()
  traceStartup('desktop_auth_cleared_on_startup')
  migrateStableHardwareFingerprintsOnStartup()
  traceStartup('hardware_profiles_migrated')
  resetCachedProfileStatesOnStartup()
  traceStartup('profiles_reset_on_startup')
  cleanupRuntimeLocksOnStartup()
  traceStartup('runtime_locks_cleaned')
  loadControlPlaneSyncTasks()
  beginControlPlaneSyncPolling()
  traceStartup('control_plane_sync_queue_ready', {
    pendingSyncCount: getControlPlanePendingSyncCount(),
  })
  initAutoUpdater()
  traceStartup('auto_updater_initialized', { supported: supportsAutoUpdate() })
  await registerIpcHandlers()
  traceStartup('ipc_handlers_registered')
  if (SMOKE_TEST_ENABLED) {
    audit('smoke_test_bootstrap_begin', { outputDir: resolveSmokeOutputDir(), platform: process.platform })
    await runDesktopSmokeScenario()
    return
  }
  initAgentService()
  traceStartup('agent_service_initialized')
  traceStartup('create_main_window_begin')
  await createMainWindow()
  traceStartup('create_main_window_succeeded')
  traceStartup('control_plane_sync_deferred_manual')
  void flushPendingControlPlaneSyncTasks()
  if (supportsAutoUpdate()) {
    setTimeout(() => {
      void checkForDesktopUpdates({ silent: true })
    }, AUTO_UPDATE_CHECK_DELAY_MS)
  } else {
    emitUpdateState()
  }
  logEvent('info', 'system', isDev ? 'Development session started' : 'Application started')
  logEvent(
    'info',
    'system',
    `Runtime info: mode=${isDev ? 'development' : 'production'} preload=${PRELOAD_VERSION} capabilities=${CAPABILITIES.length}`,
  )
  logEvent('info', 'system', `Build marker: ${BUILD_MARKER}`, null)

  app.on('activate', () => {
    if (beforeQuitHandled || gracefulShutdownInFlight) {
      return
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
      traceStartup('app_activate_focused_existing_window')
      return
    }
    void createMainWindow()
  })

  app.on('before-quit', (event) => {
    if (beforeQuitHandled) {
      return
    }
    beforeQuitHandled = true
    event.preventDefault()
    audit('app_before_quit_begin')
    void gracefulShutdownHandler('before-quit').finally(() => {
      audit('app_before_quit_end')
    })
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

void bootstrap().catch((error) => {
  console.error('bootstrap failed', error)
  traceStartup('bootstrap_failed', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack || '' : '',
  })
  void gracefulShutdownHandler(error)
})
