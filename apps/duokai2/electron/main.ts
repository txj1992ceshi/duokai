import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
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
import { DatabaseService } from './services/database'
import {
  createDeviceProfileFromFingerprint,
  DEFAULT_ENVIRONMENT_PURPOSE,
} from './services/deviceProfile'
import {
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
  proxyToPlaywrightConfig,
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
import { AgentService } from './services/agentService'
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
import type {
  AuthUser,
  CloudPhoneBulkActionPayload,
  CloudPhoneRecord,
  ConfigSyncResult,
  CreateCloudPhoneInput,
  CreateProfileInput,
  CreateProxyInput,
  CreateTemplateInput,
  DesktopRuntimeInfo,
  DesktopAuthState,
  DesktopWindowFrameMetrics,
  ExportBundle,
  FingerprintConfig,
  LogLevel,
  ProfileBulkActionPayload,
  ProfileRecord,
  ProxyRecord,
  RemoteConfigSnapshot,
  RuntimeHostInfo,
  SettingsPayload,
  DesktopUpdateState,
  TrustedIsolationCheck,
  TrustedLaunchSnapshot,
  UpdateCloudPhoneInput,
  UpdateTemplateInput,
  UpdateProfileInput,
  UpdateProxyInput,
  WorkspaceSnapshotRecord,
} from '../src/shared/types'

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

let configSyncInFlight: Promise<ConfigSyncResult> | null = null
let lastConfigSyncAt = 0
let lastConfigSyncResult: ConfigSyncResult | null = null
let lastUserConfigSyncVersion = 0
let sessionAuthApiBase = ''
let sessionAuthToken = ''
let sessionAuthUser: AuthUser | null = null

const runtimeContexts = new Map<string, BrowserContext>()
const runtimeLockHeartbeatTimers = new Map<string, NodeJS.Timeout>()
const runtimeShutdownFinalizing = new Set<string>()
const MAX_QUEUE = Number(process.env.MAX_QUEUE_LENGTH || 200)
const CONTROL_PLANE_FETCH_RETRY_MS = 1200
const DESKTOP_RELEASES_API = 'https://api.github.com/repos/txj1992ceshi/duokai/releases/latest'
const DESKTOP_RELEASES_PAGE = 'https://github.com/txj1992ceshi/duokai/releases'
const UPDATE_DOWNLOAD_DIR = 'updates'
const AUTO_UPDATE_CHECK_DELAY_MS = 12_000
const UPDATE_CHECK_MIN_INTERVAL_MS = 30 * 60 * 1000
const PROFILE_SYNC_COOLDOWN_MS = 30_000

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

function setLastConfigSyncResult(result: ConfigSyncResult | null): ConfigSyncResult | null {
  lastConfigSyncResult = result
  return result
}

function buildConfigSyncSuccessResult(
  source: ConfigSyncResult['source'],
  snapshot: RemoteConfigSnapshot,
): ConfigSyncResult {
  return {
    count: Array.isArray(snapshot.profiles) ? snapshot.profiles.length : 0,
    source,
    usedLocalCache: false,
    message: '已从云端更新环境数据',
    warningMessage: '',
  }
}

function buildConfigSyncFallbackResult(message: string): ConfigSyncResult {
  return {
    count: requireDatabase().listProfiles().length,
    source: 'account',
    usedLocalCache: true,
    message: '',
    warningMessage: `云端环境数据拉取失败，当前显示本地缓存：${message}`,
  }
}

function applyRemoteConfigSnapshot(snapshot: RemoteConfigSnapshot): void {
  const localProfiles = requireDatabase().listProfiles()
  const remoteIds = new Set((snapshot.profiles || []).map((profile) => profile.id))
  for (const profile of localProfiles) {
    if (remoteIds.has(profile.id)) {
      continue
    }
    audit('config_pull_removed_local_profile', {
      profileId: profile.id,
      name: profile.name,
    })
  }
  requireDatabase().applyRemoteConfigSnapshot(snapshot)
  emitConfigChanged()
}

async function pullConfigSnapshotFromAccount(): Promise<RemoteConfigSnapshot> {
  const payload = await requestControlPlane('/api/config/snapshot')
  const snapshot = (payload.snapshot || null) as RemoteConfigSnapshot | null
  if (!snapshot) {
    return {
      syncVersion: 0,
      profiles: [],
      proxies: [],
      templates: [],
      cloudPhones: [],
      settings: {},
    }
  }
  return {
    syncVersion: Number(snapshot.syncVersion || 0),
    profiles: Array.isArray(snapshot.profiles) ? snapshot.profiles : [],
    proxies: Array.isArray(snapshot.proxies) ? snapshot.proxies : [],
    templates: Array.isArray(snapshot.templates) ? snapshot.templates : [],
    cloudPhones: Array.isArray(snapshot.cloudPhones) ? snapshot.cloudPhones : [],
    settings: snapshot.settings && typeof snapshot.settings === 'object' ? snapshot.settings : {},
  }
}

async function syncConfigFromControlPlane(options: ConfigSyncOptions = {}): Promise<ConfigSyncResult> {
  const useLocalCacheOnError = options.useLocalCacheOnError ?? false

  try {
    let snapshot: RemoteConfigSnapshot | null = null
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
        count: requireDatabase().listProfiles().length,
        source,
        usedLocalCache: false,
        message: '',
        warningMessage: '',
      })
      return result!
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

async function syncConfigToControlPlaneOrThrow(mode: 'replace' | 'merge' = 'replace'): Promise<void> {
  if (!agentService?.getState().enabled && !getDesktopAuthState().authenticated) {
    return
  }

  const syncVersion = agentService?.getState().enabled
    ? agentService.getSyncVersion()
    : lastUserConfigSyncVersion
  const snapshot = requireDatabase().exportRemoteConfigSnapshot(syncVersion)

  try {
    if (agentService?.getState().enabled) {
      await agentService.pushConfigSnapshot({
        profiles: snapshot.profiles,
        proxies: snapshot.proxies,
        templates: snapshot.templates,
        cloudPhones: snapshot.cloudPhones,
        settings: snapshot.settings,
      }, { mode })
      return
    }

    const payload = await requestControlPlane('/api/config/push', {
      method: 'POST',
      body: JSON.stringify({
        syncVersion,
        profiles: snapshot.profiles,
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
      await syncConfigFromControlPlane()
      throw new Error('配置版本冲突，已拉取后台最新数据，请重试操作')
    }
    throw error
  }
}

const AUDIT_LOG_PATH = resolveAuditLogPath()
let gracefulShutdownInFlight = false
let beforeQuitHandled = false
let lastRuntimeNetworkDiagnostics: NonNullable<RuntimeHostInfo['networkDiagnostics']> | null = null

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

async function syncConfigToControlPlaneBestEffort(action: string, details: Record<string, unknown>): Promise<void> {
  try {
    await syncConfigToControlPlaneOrThrow()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    audit('config_sync_best_effort_failed', {
      action,
      err: message,
      ...details,
    })
    logEvent('warn', 'system', `${action} config sync failed: ${message}`, null)
  }
}

async function deleteRemoteProfileBestEffort(profileId: string): Promise<void> {
  if (!getDesktopAuthState().authenticated) {
    return
  }

  try {
    await requestControlPlane(`/api/profiles/${encodeURIComponent(profileId)}`, {
      method: 'DELETE',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/profile not found/i.test(message) || /请先登录桌面端/i.test(message)) {
      audit('profile_remote_delete_skipped', {
        profileId,
        err: message,
      })
      return
    }
    audit('profile_remote_delete_failed', {
      profileId,
      err: message,
    })
    logEvent('warn', 'profile', `Remote delete failed for profile ${profileId}: ${message}`, profileId)
  }
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

function hashStorageState(stateJson: unknown): string {
  return createHash('sha256').update(JSON.stringify(stateJson)).digest('hex')
}

async function readProfileStorageStateFromDisk(profileId: string): Promise<BrowserStorageState | null> {
  try {
    ensureWorkspaceLayoutForProfileId(profileId)
    const content = await readFile(getProfileStorageStatePath(profileId), 'utf8')
    return normalizeStorageState(JSON.parse(content))
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

async function syncWorkspaceSnapshotToControlPlane(snapshot: WorkspaceSnapshotRecord): Promise<void> {
  if (!getDesktopAuthState().authenticated) {
    return
  }
  await requestControlPlane(
    `/api/workspace-snapshots/${encodeURIComponent(snapshot.profileId)}/${encodeURIComponent(snapshot.snapshotId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(snapshot),
    },
  )
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

async function syncWorkspaceSummaryToControlPlane(profile: ProfileRecord): Promise<void> {
  if (!getDesktopAuthState().authenticated || !profile.workspace) {
    return
  }
  await requestControlPlane(`/api/profiles/${encodeURIComponent(profile.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      workspace: profile.workspace,
    }),
  })
}

async function createWorkspaceSnapshotForProfile(profileId: string): Promise<WorkspaceSnapshotRecord> {
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
  const assessment = await evaluateLastKnownGoodSnapshot(profile, {
    storageState: currentStorageState,
    fetchRemoteSnapshot: fetchWorkspaceSnapshotFromControlPlane,
  })
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
  traceStartup('uncaught_exception', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack || '' : '',
  })
  void gracefulShutdownHandler(error)
})
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection', reason)
  traceStartup('unhandled_rejection', {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack || '' : '',
  })
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

type GitHubReleaseAsset = {
  name?: string
  browser_download_url?: string
  size?: number
}

type GitHubLatestRelease = {
  tag_name?: string
  name?: string
  html_url?: string
  published_at?: string
  assets?: GitHubReleaseAsset[]
}

let updateState: DesktopUpdateState = {
  supported: app.isPackaged,
  status: app.isPackaged ? 'idle' : 'unsupported',
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseName: '',
  publishedAt: null,
  releaseUrl: DESKTOP_RELEASES_PAGE,
  assetName: '',
  downloadedFile: '',
  progressPercent: 0,
  message: app.isPackaged ? '' : '仅打包后的桌面端支持自动更新检测',
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
    ...next,
  }
  emitUpdateState()
  return updateState
}

function normalizeReleaseVersion(input: string): string {
  return String(input || '').trim().replace(/^v/i, '')
}

function parseComparableVersion(input: string): { main: number[]; pre: Array<string | number> } {
  const normalized = normalizeReleaseVersion(input)
  const [mainPart, prePart = ''] = normalized.split('-', 2)
  const main = mainPart
    .split('.')
    .map((item) => Number.parseInt(item, 10))
    .map((item) => (Number.isFinite(item) ? item : 0))
  const pre = prePart
    ? prePart.split('.').map((item) => {
        const numeric = Number.parseInt(item, 10)
        return Number.isFinite(numeric) && String(numeric) === item ? numeric : item
      })
    : []
  return { main, pre }
}

function compareVersions(left: string, right: string): number {
  const a = parseComparableVersion(left)
  const b = parseComparableVersion(right)
  const length = Math.max(a.main.length, b.main.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a.main[index] || 0) - (b.main[index] || 0)
    if (diff !== 0) {
      return diff
    }
  }
  if (a.pre.length === 0 && b.pre.length === 0) {
    return 0
  }
  if (a.pre.length === 0) {
    return 1
  }
  if (b.pre.length === 0) {
    return -1
  }
  const preLength = Math.max(a.pre.length, b.pre.length)
  for (let index = 0; index < preLength; index += 1) {
    const leftPart = a.pre[index]
    const rightPart = b.pre[index]
    if (leftPart === undefined) {
      return -1
    }
    if (rightPart === undefined) {
      return 1
    }
    if (leftPart === rightPart) {
      continue
    }
    if (typeof leftPart === 'number' && typeof rightPart === 'number') {
      return leftPart - rightPart
    }
    if (typeof leftPart === 'number') {
      return -1
    }
    if (typeof rightPart === 'number') {
      return 1
    }
    return leftPart.localeCompare(rightPart)
  }
  return 0
}

function pickReleaseAsset(assets: GitHubReleaseAsset[] = []): GitHubReleaseAsset | null {
  const candidates = assets.filter((asset) => asset.name && asset.browser_download_url)
  if (process.platform === 'win32') {
    return (
      candidates.find((asset) => /\.exe$/i.test(asset.name || '') && /setup/i.test(asset.name || '')) ||
      candidates.find((asset) => /\.exe$/i.test(asset.name || '')) ||
      null
    )
  }
  if (process.platform === 'darwin') {
    return (
      candidates.find((asset) => /\.dmg$/i.test(asset.name || '')) ||
      candidates.find((asset) => /\.zip$/i.test(asset.name || '') && /mac|darwin|arm|x64/i.test(asset.name || '')) ||
      candidates.find((asset) => /\.zip$/i.test(asset.name || '')) ||
      null
    )
  }
  return candidates.find((asset) => /\.appimage$|\.deb$|\.rpm$/i.test(asset.name || '')) || null
}

async function fetchLatestRelease(): Promise<{
  release: GitHubLatestRelease
  latestVersion: string
  asset: GitHubReleaseAsset | null
}> {
  const response = await fetch(DESKTOP_RELEASES_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Duokai2/${app.getVersion()}`,
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub release check failed (${response.status})`)
  }
  const release = (await response.json()) as GitHubLatestRelease
  const latestVersion = normalizeReleaseVersion(release.tag_name || release.name || '')
  if (!latestVersion) {
    throw new Error('未获取到有效的发布版本号')
  }
  return {
    release,
    latestVersion,
    asset: pickReleaseAsset(release.assets || []),
  }
}

async function checkForDesktopUpdates(options: { silent?: boolean } = {}): Promise<DesktopUpdateState> {
  if (!app.isPackaged) {
    return setUpdateState({
      supported: false,
      status: 'unsupported',
      message: '仅打包后的桌面端支持自动更新检测',
    })
  }
  if (updateCheckPromise) {
    return updateCheckPromise
  }
  updateCheckPromise = (async () => {
    const now = Date.now()
    const lastChecked = updateState.checkedAt ? new Date(updateState.checkedAt).getTime() : 0
    if (options.silent && lastChecked > 0 && now - lastChecked < UPDATE_CHECK_MIN_INTERVAL_MS) {
      return updateState
    }
    setUpdateState({
      status: 'checking',
      progressPercent: 0,
      message: options.silent ? '后台检查更新中' : '正在检查更新',
    })
    try {
      const { release, latestVersion, asset } = await fetchLatestRelease()
      const releaseUrl = String(release.html_url || DESKTOP_RELEASES_PAGE)
      if (compareVersions(latestVersion, app.getVersion()) <= 0) {
        return setUpdateState({
          supported: true,
          status: 'not-available',
          latestVersion,
          releaseName: String(release.name || release.tag_name || latestVersion),
          publishedAt: release.published_at || null,
          releaseUrl,
          assetName: '',
          downloadedFile: '',
          progressPercent: 100,
          checkedAt: new Date().toISOString(),
          message: '当前已是最新版本',
        })
      }
      return setUpdateState({
        supported: true,
        status: 'available',
        latestVersion,
        releaseName: String(release.name || release.tag_name || latestVersion),
        publishedAt: release.published_at || null,
        releaseUrl,
        assetName: String(asset?.name || ''),
        downloadedFile: '',
        progressPercent: 0,
        checkedAt: new Date().toISOString(),
        message: asset?.name ? `发现新版本 ${latestVersion}` : `发现新版本 ${latestVersion}，请前往发布页安装`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      audit('update_check_failed', { error: message })
      return setUpdateState({
        status: 'error',
        checkedAt: new Date().toISOString(),
        message,
      })
    } finally {
      updateCheckPromise = null
    }
  })()
  return updateCheckPromise
}

async function downloadDesktopUpdate(): Promise<DesktopUpdateState> {
  if (!app.isPackaged) {
    return setUpdateState({
      supported: false,
      status: 'unsupported',
      message: '仅打包后的桌面端支持自动更新检测',
    })
  }
  if (updateDownloadPromise) {
    return updateDownloadPromise
  }
  updateDownloadPromise = (async () => {
    try {
      let releaseInfo: Awaited<ReturnType<typeof fetchLatestRelease>> | null = null
      if (updateState.status !== 'available' || !updateState.latestVersion) {
        releaseInfo = await fetchLatestRelease()
        setUpdateState({
          latestVersion: releaseInfo.latestVersion,
          releaseName: String(releaseInfo.release.name || releaseInfo.release.tag_name || releaseInfo.latestVersion),
          publishedAt: releaseInfo.release.published_at || null,
          releaseUrl: String(releaseInfo.release.html_url || DESKTOP_RELEASES_PAGE),
          assetName: String(releaseInfo.asset?.name || ''),
        })
      }
      const latestAsset =
        releaseInfo?.asset ||
        (await fetchLatestRelease()).asset
      if (!latestAsset?.browser_download_url || !latestAsset.name) {
        throw new Error('当前平台暂无可下载的安装包，请前往发布页获取新版')
      }
      const downloadsDir = path.join(app.getPath('downloads'), UPDATE_DOWNLOAD_DIR)
      mkdirSync(downloadsDir, { recursive: true })
      const destination = path.join(downloadsDir, latestAsset.name)
      const response = await fetch(latestAsset.browser_download_url, {
        headers: {
          Accept: 'application/octet-stream',
          'User-Agent': `Duokai2/${app.getVersion()}`,
        },
      })
      if (!response.ok || !response.body) {
        throw new Error(`更新包下载失败 (${response.status})`)
      }
      const totalBytes = Number(response.headers.get('content-length') || latestAsset.size || 0)
      const writer = createWriteStream(destination)
      const reader = response.body.getReader()
      let downloaded = 0
      setUpdateState({
        status: 'downloading',
        assetName: latestAsset.name,
        downloadedFile: '',
        progressPercent: 0,
        message: `正在下载更新 ${latestAsset.name}`,
      })
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        if (!value) {
          continue
        }
        downloaded += value.length
        writer.write(Buffer.from(value))
        const progressPercent =
          totalBytes > 0 ? Math.max(1, Math.min(100, Math.round((downloaded / totalBytes) * 100))) : 0
        setUpdateState({
          status: 'downloading',
          progressPercent,
          message:
            totalBytes > 0
              ? `正在下载更新 ${latestAsset.name}（${progressPercent}%）`
              : `正在下载更新 ${latestAsset.name}`,
        })
      }
      await new Promise<void>((resolve, reject) => {
        writer.end(() => resolve())
        writer.on('error', reject)
      })
      audit('update_downloaded', { assetName: latestAsset.name, destination })
      return setUpdateState({
        status: 'downloaded',
        downloadedFile: destination,
        progressPercent: 100,
        checkedAt: new Date().toISOString(),
        message:
          process.platform === 'win32'
            ? '更新包已下载完成，点击安装后将打开安装程序'
            : '更新包已下载完成，点击安装后将打开安装包',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      audit('update_download_failed', { error: message })
      return setUpdateState({
        status: 'error',
        message,
      })
    } finally {
      updateDownloadPromise = null
    }
  })()
  return updateDownloadPromise
}

async function installDownloadedUpdate(): Promise<{ success: boolean; message: string }> {
  if (!updateState.downloadedFile) {
    throw new Error('尚未下载更新安装包')
  }
  const installerPath = updateState.downloadedFile
  audit('update_install_start', { installerPath, platform: process.platform })
  if (process.platform === 'win32') {
    const child = spawn(installerPath, [], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
    setTimeout(() => app.quit(), 500)
    return { success: true, message: '安装程序已打开，应用即将退出' }
  }
  const openResult = await shell.openPath(installerPath)
  if (openResult) {
    throw new Error(openResult)
  }
  return {
    success: true,
    message:
      process.platform === 'darwin'
        ? '安装包已打开，请完成替换后重新启动应用'
        : '安装包已打开，请完成安装后重新启动应用',
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
    lastConfigSyncResult,
  }
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
  return getDesktopAuthState()
}

function clearDesktopAuth(): DesktopAuthState {
  sessionAuthApiBase = ''
  sessionAuthToken = ''
  sessionAuthUser = null
  lastUserConfigSyncVersion = 0
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
  const method = String(init.method || 'GET').toUpperCase()
  const response = await requestJsonWithRetry(`${getControlPlaneApiBase()}${pathName}`, {
    method,
    headers,
    body:
      typeof init.body === 'string'
        ? init.body
        : init.body == null
          ? undefined
          : String(init.body),
  }, method === 'GET' ? 1 : 0)
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

async function requestJsonViaPowerShell(input: string, init: JsonRequestInit = {}): Promise<JsonResponse> {
  const headers = headersToObject(init.headers)
  const body = init.body || ''
  const method = String(init.method || 'GET').toUpperCase()
  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$uri = '${escapePowerShellString(input)}'
$method = '${escapePowerShellString(method)}'
$headers = ${buildPowerShellHashtableLiteral(headers)}
$body = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${Buffer.from(body, 'utf8').toString('base64')}'))
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

  return await new Promise<JsonResponse>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    child.on('error', reject)
    child.on('close', (code) => {
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
      await new Promise((resolve) => setTimeout(resolve, CONTROL_PLANE_FETCH_RETRY_MS))
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

    if (!needsStatusReset && !needsMetadataReset) {
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
        },
      },
    })
    database.setProfileStatus(profile.id, 'stopped')
    audit('profiles_local_status_reset_on_startup', {
      profileId: profile.id,
      previousStatus: profile.status,
      previousLaunchStage: metadata.launchValidationStage,
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
    workspace: profile.workspace ?? null,
  }
}

function syncLegacyProfileMutationInBackground(
  action: 'create' | 'update',
  payload: ProfileRecord,
): void {
  void (async () => {
    if (getDesktopAuthState().authenticated) {
      try {
        if (action === 'create') {
          await requestControlPlane('/api/profiles', {
            method: 'POST',
            body: JSON.stringify(mapLocalProfileToRemotePayload(payload)),
          })
        } else {
          try {
            await requestControlPlane(`/api/profiles/${encodeURIComponent(payload.id)}`, {
              method: 'PATCH',
              body: JSON.stringify(mapLocalProfileToRemotePayload(payload)),
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            if (!/profile not found/i.test(message)) {
              throw error
            }
            await requestControlPlane('/api/profiles', {
              method: 'POST',
              body: JSON.stringify(mapLocalProfileToRemotePayload(payload)),
            })
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        audit('profile_remote_sync_failed', {
          action,
          profileId: payload.id,
          err: message,
        })
        logEvent(
          'warn',
          'profile',
          `${action === 'create' ? 'Create' : 'Update'} profile remote sync failed for "${payload.name}": ${message}`,
          payload.id,
        )
      }
    }
  })()
}

async function syncConfigFromControlPlaneIfForced(options: ConfigSyncOptions = {}): Promise<ConfigSyncResult> {
  const cachedResult: ConfigSyncResult = {
    count: requireDatabase().listProfiles().length,
    source: agentService?.getState().enabled ? 'agent' : 'account',
    usedLocalCache: false,
    message: '',
    warningMessage: '',
  }

  if (!getDesktopAuthState().authenticated && !agentService?.getState().enabled) {
    return cachedResult
  }
  if (!options.force) {
    return cachedResult
  }
  if (configSyncInFlight) {
    return configSyncInFlight
  }

  const now = Date.now()
  if (now - lastConfigSyncAt < PROFILE_SYNC_COOLDOWN_MS && lastConfigSyncResult) {
    return lastConfigSyncResult
  }

  configSyncInFlight = (async () => {
    const result = await syncConfigFromControlPlane({
      force: true,
      useLocalCacheOnError: options.useLocalCacheOnError,
    })
    lastConfigSyncAt = Date.now()
    setLastConfigSyncResult(result)
    return result
  })()

  try {
    return await configSyncInFlight
  } finally {
    configSyncInFlight = null
  }
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
  void profileId
}

type StorageStateUploadReason = 'stop' | 'graceful-shutdown' | 'context-close'

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
  try {
    const launchProxy = await resolveLaunchProxy(proxy)
    const browser = await chromium.launch({
      headless: true,
      executablePath: resolveChromiumExecutable(),
      proxy: launchProxy.config ?? proxyToPlaywrightConfig(proxy) ?? undefined,
      env: buildChromiumLaunchEnv(),
      args: applyProxyCompatibilityArgs([], proxy, { bridgeActive: launchProxy.bridgeActive }),
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
      message: '本机检测通过（local）',
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
                ? '本机检测失败，但控制台后备检测通过（control-plane）'
                : '本机与控制台后备检测均失败')
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
      message: error instanceof Error ? `本机检测失败：${error.message}` : '本机检测失败：未知错误',
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

function recordProfileIpUsage(profile: ProfileRecord, check: NetworkHealthResult, startupNavigationPassed: boolean): void {
  if (!check.ip) {
    return
  }
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
    success: startupNavigationPassed,
    message: startupNavigationPassed ? 'Profile startup navigation completed' : 'Profile startup navigation failed',
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
    await downloadProfileStorageStateFromControlPlane(profileId)
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

  const proxyConfig = proxyToPlaywrightConfig(resolvedProxy)
  const launchProxy = await resolveLaunchProxy(resolvedProxy)
  if (proxyConfig || launchProxy.config) {
    const bypassArg = `--proxy-bypass-list=${GOOGLE_PROXY_BYPASS_LIST}`
    if (!launchOptions.args?.some((arg) => arg.startsWith('--proxy-bypass-list='))) {
      launchOptions.args = [...(launchOptions.args ?? []), bypassArg]
    }
    launchOptions.proxy = launchProxy.config ?? proxyConfig ?? undefined
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
    `Launched profile "${profile.name}"${resolvedProxy ? ` via ${buildProxyServer(resolvedProxy)}` : ''}${launchProxy.bridgeActive ? ` ${launchProxy.detail}` : ''}`,
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
    if (!gracefulShutdownInFlight && !runtimeShutdownFinalizing.has(profileId)) {
      void uploadProfileStorageStateToControlPlane(profileId, {
        reason: 'context-close',
      })
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
    let startupNavigationPassed = false
    try {
    await page.goto(startupUrl, {
      waitUntil: 'domcontentloaded',
    })
    startupNavigationPassed = true
    if (profile.environmentPurpose === 'register') {
      profile = updateRuntimeMetadata(profile, {
        lastRegisterLaunchAt: new Date().toISOString(),
      })
    }
    recordProfileIpUsage(profile, check, startupNavigationPassed)
    } finally {
    if (!startupNavigationPassed) {
      recordProfileIpUsage(profile, check, startupNavigationPassed)
    }
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
    audit(startupNavigationPassed ? 'trusted_launch_confirmed' : 'trusted_launch_navigation_failed', {
      profileId,
      startupNavigationPassed,
      verifiedAt: nextSnapshot?.verifiedAt || '',
      trustedSnapshotStatus: nextSnapshot?.status || latestProfile.fingerprintConfig.runtimeMetadata.trustedSnapshotStatus,
      startupUrl,
    })
    if (startupNavigationPassed && latestWorkspaceSnapshot) {
      await markWorkspaceSnapshotAsLastKnownGood(
        profileId,
        latestWorkspaceSnapshot.snapshotId,
        new Date().toISOString(),
      )
    }
    void syncProfileLaunchTrustToControlPlane(persisted)
    }
  } catch (error) {
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
      const syncResult = await syncConfigFromControlPlaneIfForced({
        force: true,
        useLocalCacheOnError: true,
      })
      if (syncResult.usedLocalCache) {
        audit('auth_login_config_sync_fallback', { apiBase, warning: syncResult.warningMessage })
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

async function performRuntimeLaunch(profileId: string): Promise<void> {
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
  ipcMain.handle('auth.syncConfig', async (_event, options?: ConfigSyncOptions) =>
    syncConfigFromControlPlaneIfForced({
      force: options?.force ?? true,
      useLocalCacheOnError: options?.useLocalCacheOnError ?? true,
    }),
  )
  ipcMain.handle('auth.syncProfiles', async (_event, options?: ConfigSyncOptions) =>
    syncConfigFromControlPlaneIfForced({
      force: options?.force ?? true,
      useLocalCacheOnError: options?.useLocalCacheOnError ?? true,
    }),
  )

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
    assertProfileNameUniqueOrThrow(payload.name)
    const profile = requireDatabase().createProfile(payload)
    await syncConfigToControlPlaneOrThrow()
    syncLegacyProfileMutationInBackground('create', profile)
    logEvent('info', 'profile', `Created profile "${profile.name}"`, profile.id)
    return profile
  })
  ipcMain.handle('profiles.update', async (_event, input: UpdateProfileInput) => {
    ensureWritable('profiles.update')
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
    await syncConfigToControlPlaneOrThrow()
    syncLegacyProfileMutationInBackground('update', profile)
    logEvent('info', 'profile', `Updated profile "${profile.name}"`, profile.id)
    return profile
  })
  ipcMain.handle('profiles.delete', async (_event, profileId: string) => {
    ensureWritable('profiles.delete')
    await stopRuntime(profileId)
    await deleteRemoteProfileBestEffort(profileId)
    requireDatabase().deleteProfile(profileId)
    await syncConfigToControlPlaneBestEffort('profiles.delete', { profileId })
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
    await stopMany(payload.profileIds)
    for (const profileId of payload.profileIds) {
      await deleteRemoteProfileBestEffort(profileId)
    }
    requireDatabase().bulkDeleteProfiles(payload.profileIds)
    await syncConfigToControlPlaneBestEffort('profiles.bulkDelete', {
      profileIds: payload.profileIds,
      count: payload.profileIds.length,
    })
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

  ipcMain.handle('runtime.launch', async (_event, profileId: string) => performRuntimeLaunch(profileId))
  ipcMain.handle('runtime.stop', async (_event, profileId: string) => {
    ensureWritable('runtime.stop')
    await stopRuntime(profileId)
    await updateProfileStatus(profileId, 'stopped')
  })
  ipcMain.handle('runtime.getStatus', async () => getRuntimeStatusSnapshot())
  ipcMain.handle('runtime.getHostInfo', async () => getRuntimeHostInfo())
  ipcMain.handle('workspace.snapshots.list', async (_event, profileId: string) => {
    return listWorkspaceSnapshotsForProfile(profileId)
  })
  ipcMain.handle('workspace.snapshots.create', async (_event, profileId: string) => {
    ensureWritable('workspace.snapshots.create')
    return createWorkspaceSnapshotForProfile(profileId)
  })
  ipcMain.handle('workspace.snapshots.restore', async (_event, profileId: string, snapshotId: string) => {
    ensureWritable('workspace.snapshots.restore')
    return restoreWorkspaceSnapshotForProfile(profileId, snapshotId)
  })
  ipcMain.handle('workspace.snapshots.rollback', async (_event, profileId: string) => {
    ensureWritable('workspace.snapshots.rollback')
    return rollbackWorkspaceSnapshotForProfile(profileId)
  })

  ipcMain.handle('logs.list', async () => requireDatabase().listLogs())
  ipcMain.handle('logs.clear', async () => requireDatabase().clearLogs())

  ipcMain.handle('settings.get', async () => requireDatabase().getSettings())
  ipcMain.handle('settings.set', async (_event, payload: SettingsPayload) => {
    ensureWritable('settings.set')
    const data = requireDatabase().setSettings(payload)
    syncTheme()
    await syncConfigToControlPlaneOrThrow()
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
  void syncConfigFromControlPlane()
    .then(() => {
      traceStartup('control_plane_sync_succeeded')
    })
    .catch((error) => {
      traceStartup('control_plane_sync_failed', {
        message: error instanceof Error ? error.message : String(error),
      })
      logEvent(
        'warn',
        'system',
        `Initial config sync failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  if (app.isPackaged) {
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
