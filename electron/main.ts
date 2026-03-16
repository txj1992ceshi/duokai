import { appendFileSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
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
import type {
  CloudPhoneBulkActionPayload,
  CloudPhoneRecord,
  CreateCloudPhoneInput,
  CreateProfileInput,
  CreateProxyInput,
  CreateTemplateInput,
  DesktopRuntimeInfo,
  ExportBundle,
  LogLevel,
  ProfileBulkActionPayload,
  ProfileRecord,
  ProxyRecord,
  SettingsPayload,
  UpdateCloudPhoneInput,
  UpdateTemplateInput,
  UpdateProfileInput,
  UpdateProxyInput,
} from '../src/shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TIMEZONE_LOOKUP_URL = 'https://ipwho.is/?output=json'
const DEFAULT_TIMEZONE_FALLBACK = 'America/Los_Angeles'
const DEFAULT_CONCURRENT_STARTS = 2
const DEFAULT_ACTIVE_LIMIT = 6
const DEFAULT_LAUNCH_RETRIES = 2

let mainWindow: BrowserWindow | null = null
let db: DatabaseService | null = null

const runtimeContexts = new Map<string, BrowserContext>()
const queuedProfileIds = new Set<string>()
const startingProfileIds = new Set<string>()
const launchRetryCounts = new Map<string, number>()
const launchQueue: string[] = []
const cancelledLaunches = new Set<string>()
let launchQueueActive = false
const MAX_QUEUE = Number(process.env.MAX_QUEUE_LENGTH || 200)

function resolveAuditLogPath(): string {
  try {
    return path.join(app.getPath('userData'), process.env.RUNTIME_AUDIT_FILE || 'runtime-audit.log')
  } catch {
    return path.join(process.cwd(), process.env.RUNTIME_AUDIT_FILE || 'runtime-audit.log')
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

async function saveAllElectronSessions(): Promise<void> {
  audit('save_all_begin', { count: runtimeContexts.size })
  for (const [profileId, context] of runtimeContexts.entries()) {
    try {
      const profilePath = getProfilePath(app, profileId)
      mkdirSync(profilePath, { recursive: true })
      const storagePath = path.join(profilePath, 'storageState.json')
      await context.storageState({ path: storagePath })
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

function getSettings(): SettingsPayload {
  return requireDatabase().getSettings()
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
}

async function stopRuntime(profileId: string): Promise<void> {
  cancelledLaunches.add(profileId)
  queuedProfileIds.delete(profileId)
  startingProfileIds.delete(profileId)
  const queuedIndex = launchQueue.indexOf(profileId)
  if (queuedIndex >= 0) {
    launchQueue.splice(queuedIndex, 1)
  }
  const context = runtimeContexts.get(profileId)
  if (!context) {
    await updateProfileStatus(profileId, 'stopped')
    return
  }

  runtimeContexts.delete(profileId)
  await context.close()
  launchRetryCounts.delete(profileId)
  void processLaunchQueue()
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

type TimezoneProfileLike = Pick<ProfileRecord, 'id' | 'name' | 'proxyId' | 'fingerprintConfig'>

type NetworkProfileLookupResult = {
  ip: string | null
  timezone: string
  countryCode: string
  country: string
  region: string
  city: string
  latitude: number | null
  longitude: number | null
  source: 'proxy' | 'local'
}

type LaunchValidationResult = {
  level: 'pass' | 'warn' | 'block'
  messages: string[]
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

function languageFromCountry(countryCode: string): string {
  const mapping: Record<string, string> = {
    US: 'en-US',
    GB: 'en-GB',
    AU: 'en-AU',
    CA: 'en-CA',
    JP: 'ja-JP',
    KR: 'ko-KR',
    CN: 'zh-CN',
    TW: 'zh-TW',
    HK: 'zh-TW',
    SG: 'en-SG',
    DE: 'de-DE',
    FR: 'fr-FR',
    ES: 'es-ES',
    IT: 'it-IT',
    BR: 'pt-BR',
    MX: 'es-MX',
  }
  return mapping[countryCode.toUpperCase()] ?? 'en-US'
}

function buildGeolocationValue(latitude: number | null, longitude: number | null): string {
  if (latitude === null || longitude === null) {
    return ''
  }
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
}

function parseLookupPayload(payload: unknown): Omit<NetworkProfileLookupResult, 'source'> | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const data = payload as {
    success?: boolean
    ip?: unknown
    timezone?: unknown
    country_code?: unknown
    country?: unknown
    region?: unknown
    city?: unknown
    latitude?: unknown
    longitude?: unknown
  }
  if (data.success === false) {
    return null
  }
  const timezone =
    typeof data.timezone === 'string'
      ? data.timezone
      : data.timezone && typeof data.timezone === 'object' && 'id' in data.timezone
        ? (data.timezone as { id?: unknown }).id
        : null
  if (typeof timezone !== 'string' || timezone.trim().length === 0) {
    return null
  }
  return {
    ip: typeof data.ip === 'string' ? data.ip : null,
    timezone: timezone.trim(),
    countryCode: typeof data.country_code === 'string' ? data.country_code : '',
    country: typeof data.country === 'string' ? data.country : '',
    region: typeof data.region === 'string' ? data.region : '',
    city: typeof data.city === 'string' ? data.city : '',
    latitude: typeof data.latitude === 'number' ? data.latitude : null,
    longitude: typeof data.longitude === 'number' ? data.longitude : null,
  }
}

function resolveProfileProxy(
  profile: TimezoneProfileLike,
  database: DatabaseService,
): ProxyRecord | null {
  const proxySettings = profile.fingerprintConfig.proxySettings
  if (proxySettings.proxyMode === 'manager' && profile.proxyId) {
    return database.getProxyById(profile.proxyId)
  }
  if (proxySettings.proxyMode === 'custom' && proxySettings.host && proxySettings.port > 0) {
    return {
      id: profile.id ? `${profile.id}-custom-proxy` : 'custom',
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

async function lookupNetworkProfileWithoutProxy(): Promise<NetworkProfileLookupResult | null> {
  try {
    const response = await fetch(TIMEZONE_LOOKUP_URL)
    if (!response.ok) {
      return null
    }
    const data = parseLookupPayload(await response.json())
    return data ? { ...data, source: 'local' } : null
  } catch {
    return null
  }
}

async function lookupNetworkProfileWithProxy(proxy: ProxyRecord): Promise<NetworkProfileLookupResult | null> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: resolveChromiumExecutable(),
      proxy: proxyToPlaywrightConfig(proxy) ?? undefined,
    })
    const page = await browser.newPage()
    await page.goto(TIMEZONE_LOOKUP_URL, { waitUntil: 'domcontentloaded' })
    const bodyText = (await page.textContent('body'))?.trim() ?? ''
    const data = parseLookupPayload(bodyText ? JSON.parse(bodyText) : null)
    return data ? { ...data, source: 'proxy' } : null
  } catch {
    return null
  } finally {
    await browser?.close().catch(() => undefined)
  }
}

async function resolveNetworkProfileForProfile(
  profile: TimezoneProfileLike,
  database: DatabaseService,
): Promise<NetworkProfileLookupResult | null> {
  const proxy = resolveProfileProxy(profile, database)
  if (proxy) {
    const proxyLookup = await lookupNetworkProfileWithProxy(proxy)
    if (proxyLookup) {
      return proxyLookup
    }
  }
  return lookupNetworkProfileWithoutProxy()
}

function applyNetworkProfileToFingerprint(
  fingerprint: ProfileRecord['fingerprintConfig'],
  lookup: NetworkProfileLookupResult | null,
) {
  if (!lookup) {
    return fingerprint
  }
  const nextLanguage = fingerprint.advanced.autoLanguageFromIp
    ? languageFromCountry(lookup.countryCode)
    : fingerprint.language
  const nextTimezone = fingerprint.advanced.autoTimezoneFromIp
    ? lookup.timezone
    : fingerprint.timezone || DEFAULT_TIMEZONE_FALLBACK
  const nextGeolocation = fingerprint.advanced.autoGeolocationFromIp
    ? buildGeolocationValue(lookup.latitude, lookup.longitude)
    : fingerprint.advanced.geolocation

  return {
    ...fingerprint,
    language: nextLanguage,
    timezone: nextTimezone,
    advanced: {
      ...fingerprint.advanced,
      geolocation: nextGeolocation,
    },
    runtimeMetadata: {
      ...fingerprint.runtimeMetadata,
      lastResolvedIp: lookup.ip ?? '',
      lastResolvedCountry: lookup.country,
      lastResolvedRegion: lookup.region,
      lastResolvedCity: lookup.city,
      lastResolvedTimezone: lookup.timezone,
      lastResolvedLanguage: nextLanguage,
      lastResolvedGeolocation: nextGeolocation,
      lastResolvedAt: new Date().toISOString(),
    },
  }
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
  const lookup = await resolveNetworkProfileForProfile(
    {
      id: payload.id,
      name: payload.name,
      proxyId: payload.proxyId,
      fingerprintConfig: payload.fingerprintConfig,
    },
    database,
  )
  if (!lookup) {
    logEvent(
      'warn',
      'profile',
      `Unable to resolve IP-linked fingerprint data for "${payload.name}" during save`,
      payload.id,
    )
    return payload
  }
  return {
    ...payload,
    fingerprintConfig: applyNetworkProfileToFingerprint(payload.fingerprintConfig, lookup),
  }
}

async function runProxyPreflight(
  profile: ProfileRecord,
  database: DatabaseService,
): Promise<{ proxy: ProxyRecord | null; lookup: NetworkProfileLookupResult | null }> {
  const proxy = resolveProfileProxy(profile, database)
  if (!proxy) {
    return { proxy: null, lookup: await lookupNetworkProfileWithoutProxy() }
  }

  const lookup = await lookupNetworkProfileWithProxy(proxy)
  const updatedMetadata = {
    ...profile.fingerprintConfig.runtimeMetadata,
    lastProxyCheckAt: new Date().toISOString(),
    lastProxyCheckSuccess: Boolean(lookup),
    lastProxyCheckMessage: lookup ? 'Proxy reachable' : 'Proxy connectivity check failed',
  }
  database.updateProfile({
    ...profile,
    fingerprintConfig: {
      ...profile.fingerprintConfig,
      runtimeMetadata: updatedMetadata,
    },
  })
  if (profile.proxyId && profile.fingerprintConfig.proxySettings.proxyMode === 'manager') {
    database.setProxyStatus(profile.proxyId, lookup ? 'online' : 'offline')
  }
  if (!lookup) {
    throw new Error(`Proxy preflight failed for "${profile.name}"`)
  }
  return { proxy, lookup }
}

function buildLaunchValidation(
  profile: ProfileRecord,
  lookup: NetworkProfileLookupResult | null,
): LaunchValidationResult {
  const messages: string[] = []
  let level: LaunchValidationResult['level'] = 'pass'
  const fingerprint = profile.fingerprintConfig

  if (
    fingerprint.proxySettings.proxyMode !== 'direct' &&
    !lookup
  ) {
    level = 'block'
    messages.push('代理不可用，已阻止启动。')
  }
  if (
    fingerprint.advanced.deviceMode === 'desktop' &&
    /android|iphone|mobile/i.test(fingerprint.userAgent)
  ) {
    level = level === 'block' ? level : 'warn'
    messages.push('当前 UA 与桌面设备模式不一致。')
  }
  if (
    fingerprint.advanced.deviceMode !== 'desktop' &&
    !/android|iphone|mobile/i.test(fingerprint.userAgent)
  ) {
    level = level === 'block' ? level : 'warn'
    messages.push('当前 UA 与移动设备模式不一致。')
  }
  if (
    fingerprint.advanced.windowWidth < 320 ||
    fingerprint.advanced.windowHeight < 480
  ) {
    level = 'block'
    messages.push('窗口尺寸过小，无法稳定启动。')
  }
  if (
    lookup &&
    fingerprint.timezone &&
    fingerprint.timezone !== lookup.timezone &&
    !fingerprint.advanced.autoTimezoneFromIp
  ) {
    level = level === 'block' ? level : 'warn'
    messages.push('手动时区与当前 IP 不一致。')
  }
  if (
    lookup &&
    fingerprint.language &&
    fingerprint.language !== languageFromCountry(lookup.countryCode) &&
    !fingerprint.advanced.autoLanguageFromIp
  ) {
    level = level === 'block' ? level : 'warn'
    messages.push('手动语言与当前 IP 地区不一致。')
  }
  if (messages.length === 0) {
    messages.push('环境校验通过，可启动。')
  }
  return { level, messages }
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
  const { proxy, lookup } = await runProxyPreflight(profile, database)
  if (cancelledLaunches.has(profileId)) {
    cancelledLaunches.delete(profileId)
    throw new Error('Launch cancelled')
  }
  profile = database.getProfileById(profileId) ?? profile
  profile = {
    ...profile,
    fingerprintConfig: applyNetworkProfileToFingerprint(profile.fingerprintConfig, lookup),
  }
  const validation = buildLaunchValidation(profile, lookup)
  profile = database.updateProfile({
    ...profile,
    fingerprintConfig: {
      ...profile.fingerprintConfig,
      timezone: profile.fingerprintConfig.timezone || DEFAULT_TIMEZONE_FALLBACK,
      runtimeMetadata: {
        ...profile.fingerprintConfig.runtimeMetadata,
        lastValidationLevel: validation.level,
        lastValidationMessages: validation.messages,
        launchRetryCount: launchRetryCounts.get(profileId) ?? 0,
      },
    },
  })
  if (validation.level === 'block') {
    throw new Error(validation.messages.join(' '))
  }

  const directoryInfo = getProfileDirectoryInfo(app)
  ensureProfileDirectory(directoryInfo.profilesDir)
  const userDataDir = getProfilePath(app, profileId)
  mkdirSync(userDataDir, { recursive: true })

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

  const proxyConfig = proxyToPlaywrightConfig(proxy)
  if (proxyConfig) {
    launchOptions.proxy = proxyConfig
  }

  const context = await chromium.launchPersistentContext(userDataDir, launchOptions)
  if (cancelledLaunches.has(profileId)) {
    cancelledLaunches.delete(profileId)
    await context.close()
    throw new Error('Launch cancelled')
  }
  runtimeContexts.set(profileId, context)
  database.touchProfileLastStarted(profileId)
  await updateProfileStatus(profileId, 'running')
  const injectedFeatures = buildInjectedFeatures(profile)
  profile = database.updateProfile({
    ...profile,
    fingerprintConfig: {
      ...profile.fingerprintConfig,
      runtimeMetadata: {
        ...profile.fingerprintConfig.runtimeMetadata,
        launchRetryCount: launchRetryCounts.get(profileId) ?? 0,
        injectedFeatures,
      },
    },
  })
  logEvent(
    'info',
    'runtime',
    `Launched profile "${profile.name}"${proxy ? ` via ${buildProxyServer(proxy)}` : ''}`,
    profileId,
  )
  await context.addInitScript(buildFingerprintInitScript(profile.id, profile.fingerprintConfig))

  context.on('close', () => {
    runtimeContexts.delete(profileId)
    launchRetryCounts.delete(profileId)
    void updateProfileStatus(profileId, 'stopped')
    logEvent('info', 'runtime', `Closed profile "${profile.name}"`, profileId)
    void processLaunchQueue()
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
  await page.goto(settings.defaultHomePage || 'https://example.com', {
    waitUntil: 'domcontentloaded',
  })
}

async function enqueueLaunch(profileId: string): Promise<void> {
  cancelledLaunches.delete(profileId)
  if (runtimeContexts.has(profileId) || queuedProfileIds.has(profileId) || startingProfileIds.has(profileId)) {
    audit('enqueue_skip_existing', { profileId })
    return
  }
  if (launchQueue.length > MAX_QUEUE) {
    audit('enqueue_rejected_queue_full', { profileId, queueLen: launchQueue.length })
    throw new Error('launch queue is full')
  }
  audit('enqueue', { profileId, queueLen: launchQueue.length + 1 })
  queuedProfileIds.add(profileId)
  launchQueue.push(profileId)
  await updateProfileStatus(profileId, 'queued')
  void processLaunchQueue()
}

async function processLaunchQueue(): Promise<void> {
  if (launchQueueActive) {
    return
  }
  launchQueueActive = true
  audit('processLaunchQueue_start', {
    queueLen: launchQueue.length,
    activeStarting: Array.from(startingProfileIds),
    activeRunning: Array.from(runtimeContexts.keys()),
  })
  try {
    while (
      launchQueue.length > 0 &&
      startingProfileIds.size < getMaxConcurrentStarts() &&
      runtimeContexts.size + startingProfileIds.size < getMaxActiveProfiles()
    ) {
      const profileId = launchQueue.shift()
      if (!profileId) {
        break
      }
      if (cancelledLaunches.has(profileId)) {
        audit('processLaunchQueue_skip_cancelled', { profileId })
        continue
      }
      if (startingProfileIds.has(profileId)) {
        audit('processLaunchQueue_skip_already_starting', { profileId })
        continue
      }
      queuedProfileIds.delete(profileId)
      startingProfileIds.add(profileId)
      audit('processLaunchQueue_dequeue', {
        profileId,
        currentStartingCount: startingProfileIds.size,
        queueRemaining: launchQueue.length,
      })

      void (async () => {
        try {
          await updateProfileStatus(profileId, 'starting')
          await launchRuntimeNow(profileId)
          launchRetryCounts.delete(profileId)
          audit('start_profile_ok', { profileId })
        } catch (error) {
          if (error instanceof Error && error.message === 'Launch cancelled') {
            launchRetryCounts.delete(profileId)
            audit('start_profile_cancelled', { profileId })
            await updateProfileStatus(profileId, 'stopped')
            return
          }
          const retries = (launchRetryCounts.get(profileId) ?? 0) + 1
          launchRetryCounts.set(profileId, retries)
          if (retries <= getMaxLaunchRetries()) {
            queuedProfileIds.add(profileId)
            launchQueue.push(profileId)
            await updateProfileStatus(profileId, 'queued')
            audit('start_profile_retry', { profileId, retries, maxRetries: getMaxLaunchRetries() })
            logEvent('warn', 'runtime', `Retrying launch for profile ${profileId} (${retries}/${getMaxLaunchRetries()})`, profileId)
          } else {
            await updateProfileStatus(profileId, 'error')
            audit('start_profile_err', { profileId, err: String(error) })
            logEvent(
              'error',
              'runtime',
              error instanceof Error ? error.message : 'Unknown runtime error',
              profileId,
            )
          }
        } finally {
          startingProfileIds.delete(profileId)
          setImmediate(() => {
            void processLaunchQueue()
          })
        }
      })()
    }
  } finally {
    launchQueueActive = false
    audit('processLaunchQueue_end', {
      queueLen: launchQueue.length,
      startingCount: startingProfileIds.size,
      activeRunning: runtimeContexts.size,
    })
  }
}

async function registerIpcHandlers(): Promise<void> {
  ipcMain.handle('meta.getInfo', async () => ({
    mode: isDev ? 'development' : 'production',
    appVersion: app.getVersion(),
    mainVersion: app.getVersion(),
    preloadVersion: PRELOAD_VERSION,
    rendererVersion: app.getVersion(),
    capabilities: CAPABILITIES,
  }))

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
    const providerKey = input.providerKey || resolveDefaultCloudPhoneProviderKey()
    const payload = createCloudPhonePayload(
      {
        ...input,
        providerKey,
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
    logEvent('info', 'cloud-phone', `Created cloud phone "${record.name}" via ${provider.label}`, null)
    return requireDatabase().getCloudPhoneById(record.id)!
  })
  ipcMain.handle('cloudPhones.update', async (_event, input: UpdateCloudPhoneInput) => {
    const payload = createCloudPhonePayload(input, input.providerKey)
    const record = requireDatabase().updateCloudPhone(payload)
    const provider = resolveCloudPhoneProvider(record)
    await provider.updateEnvironment(record, getSettings())
    logEvent('info', 'cloud-phone', `Updated cloud phone "${record.name}" via ${provider.label}`, null)
    return record
  })
  ipcMain.handle('cloudPhones.delete', async (_event, cloudPhoneId: string) => {
    const record = requireDatabase().getCloudPhoneById(cloudPhoneId)
    if (record) {
      const provider = resolveCloudPhoneProvider(record)
      await provider.deleteEnvironment(record, getSettings())
    }
    requireDatabase().deleteCloudPhone(cloudPhoneId)
    logEvent('warn', 'cloud-phone', `Deleted cloud phone ${cloudPhoneId}`, null)
  })
  ipcMain.handle('cloudPhones.start', async (_event, cloudPhoneId: string) => {
    await startCloudPhone(cloudPhoneId)
  })
  ipcMain.handle('cloudPhones.stop', async (_event, cloudPhoneId: string) => {
    await stopCloudPhone(cloudPhoneId)
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
    const payload = createCloudPhonePayload(
      {
        ...input,
        providerKey,
      },
      providerKey,
    )
    const provider = cloudPhoneProviderRegistry.getProvider(providerKey)
    const result = await provider.testProxy(payload, getSettings())
    logEvent(
      result.success ? 'info' : 'warn',
      'cloud-phone',
      `Tested cloud phone proxy for "${payload.name || payload.proxyHost}" via ${provider.label}`,
      null,
    )
    return result
  })
  ipcMain.handle('cloudPhones.refreshStatuses', async () => refreshCloudPhoneStatuses())
  ipcMain.handle('cloudPhones.bulkStart', async (_event, payload: CloudPhoneBulkActionPayload) => {
    for (const cloudPhoneId of payload.cloudPhoneIds) {
      await startCloudPhone(cloudPhoneId)
    }
  })
  ipcMain.handle('cloudPhones.bulkStop', async (_event, payload: CloudPhoneBulkActionPayload) => {
    for (const cloudPhoneId of payload.cloudPhoneIds) {
      await stopCloudPhone(cloudPhoneId)
    }
  })
  ipcMain.handle('cloudPhones.bulkDelete', async (_event, payload: CloudPhoneBulkActionPayload) => {
    for (const cloudPhoneId of payload.cloudPhoneIds) {
      const record = requireDatabase().getCloudPhoneById(cloudPhoneId)
      if (record) {
        const provider = resolveCloudPhoneProvider(record)
        await provider.deleteEnvironment(record, getSettings())
      }
    }
    requireDatabase().bulkDeleteCloudPhones(payload.cloudPhoneIds)
    logEvent('warn', 'cloud-phone', `Deleted ${payload.cloudPhoneIds.length} cloud phones`, null)
  })
  ipcMain.handle('cloudPhones.bulkAssignGroup', async (_event, payload: CloudPhoneBulkActionPayload) => {
    requireDatabase().bulkAssignCloudPhoneGroup(payload.cloudPhoneIds, payload.groupName ?? '')
    logEvent('info', 'cloud-phone', `Updated group for ${payload.cloudPhoneIds.length} cloud phones`, null)
  })

  ipcMain.handle('profiles.list', async () => requireDatabase().listProfiles())
  ipcMain.handle('profiles.create', async (_event, input: CreateProfileInput) => {
    const payload = await applyResolvedNetworkProfileToPayload(
      createProfilePayload(input, createDefaultFingerprint),
      requireDatabase(),
    )
    const profile = requireDatabase().createProfile(payload)
    logEvent('info', 'profile', `Created profile "${profile.name}"`, profile.id)
    return profile
  })
  ipcMain.handle('profiles.update', async (_event, input: UpdateProfileInput) => {
    const payload = await applyResolvedNetworkProfileToPayload(
      createProfilePayload(input, createDefaultFingerprint),
      requireDatabase(),
    )
    const profile = requireDatabase().updateProfile(payload)
    logEvent('info', 'profile', `Updated profile "${profile.name}"`, profile.id)
    return profile
  })
  ipcMain.handle('profiles.delete', async (_event, profileId: string) => {
    await stopRuntime(profileId)
    requireDatabase().deleteProfile(profileId)
    logEvent('warn', 'profile', `Deleted profile ${profileId}`, profileId)
  })
  ipcMain.handle('profiles.clone', async (_event, profileId: string) => {
    const profile = requireDatabase().cloneProfile(profileId)
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
    await launchMany(payload.profileIds)
  })
  ipcMain.handle('profiles.bulkStop', async (_event, payload: ProfileBulkActionPayload) => {
    await stopMany(payload.profileIds)
  })
  ipcMain.handle('profiles.bulkDelete', async (_event, payload: ProfileBulkActionPayload) => {
    await stopMany(payload.profileIds)
    requireDatabase().bulkDeleteProfiles(payload.profileIds)
    logEvent('warn', 'profile', `Deleted ${payload.profileIds.length} profiles`, null)
  })
  ipcMain.handle('profiles.bulkAssignGroup', async (_event, payload: ProfileBulkActionPayload) => {
    requireDatabase().bulkAssignGroup(payload.profileIds, payload.groupName ?? '')
    logEvent('info', 'profile', `Updated group for ${payload.profileIds.length} profiles`, null)
  })

  ipcMain.handle('templates.list', async () => requireDatabase().listTemplates())
  ipcMain.handle('templates.create', async (_event, input: CreateTemplateInput) => {
    const template = requireDatabase().createTemplate(
      createTemplatePayload(input, createDefaultFingerprint),
    )
    logEvent('info', 'profile', `Created template "${template.name}"`, null)
    return template
  })
  ipcMain.handle('templates.update', async (_event, input: UpdateTemplateInput) => {
    const template = requireDatabase().updateTemplate(
      createTemplatePayload(input, createDefaultFingerprint),
    )
    logEvent('info', 'profile', `Updated template "${template.name}"`, null)
    return template
  })
  ipcMain.handle('templates.delete', async (_event, templateId: string) => {
    requireDatabase().deleteTemplate(templateId)
    logEvent('warn', 'profile', `Deleted template ${templateId}`, null)
  })
  ipcMain.handle('templates.createFromProfile', async (_event, profileId: string) => {
    const template = requireDatabase().createTemplateFromProfile(profileId)
    logEvent('info', 'profile', `Created template from profile "${template.name}"`, null)
    return template
  })

  ipcMain.handle('proxies.list', async () => requireDatabase().listProxies())
  ipcMain.handle('proxies.create', async (_event, input: CreateProxyInput) => {
    const payload = createProxyPayload(input)
    const proxy = requireDatabase().createProxy(payload)
    logEvent('info', 'proxy', `Created proxy "${proxy.name}"`, null)
    return proxy
  })
  ipcMain.handle('proxies.update', async (_event, input: UpdateProxyInput) => {
    const payload = createProxyPayload(input)
    const proxy = requireDatabase().updateProxy(payload)
    logEvent('info', 'proxy', `Updated proxy "${proxy.name}"`, null)
    return proxy
  })
  ipcMain.handle('proxies.delete', async (_event, proxyId: string) => {
    requireDatabase().deleteProxy(proxyId)
    logEvent('warn', 'proxy', `Deleted proxy ${proxyId}`, null)
  })
  ipcMain.handle('proxies.test', async (_event, proxyId: string) => {
    const proxy = requireDatabase().getProxyById(proxyId)
    if (!proxy) {
      throw new Error('Proxy not found')
    }

    try {
      const browser = await chromium.launch({
        headless: true,
        executablePath: resolveChromiumExecutable(),
        proxy: proxyToPlaywrightConfig(proxy) ?? undefined,
      })
      const page = await browser.newPage()
      await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 20000 })
      await browser.close()

      const result = requireDatabase().setProxyStatus(proxyId, 'online')
      logEvent('info', 'proxy', `Proxy "${proxy.name}" is reachable`, null)
      return {
        success: true,
        message: 'Proxy connected successfully',
        checkedAt: result.lastCheckedAt ?? new Date().toISOString(),
      }
    } catch (error) {
      const result = requireDatabase().setProxyStatus(proxyId, 'offline')
      logEvent('error', 'proxy', `Proxy "${proxy.name}" test failed`, null)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown proxy error',
        checkedAt: result.lastCheckedAt ?? new Date().toISOString(),
      }
    }
  })

  ipcMain.handle('runtime.launch', async (_event, profileId: string) => {
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
    await stopRuntime(profileId)
    await updateProfileStatus(profileId, 'stopped')
  })
  ipcMain.handle('runtime.getStatus', async () => ({
    runningProfileIds: [...runtimeContexts.keys()],
    queuedProfileIds: [...queuedProfileIds],
    startingProfileIds: [...startingProfileIds],
    retryCounts: Object.fromEntries(launchRetryCounts.entries()),
  }))

  ipcMain.handle('logs.list', async () => requireDatabase().listLogs())
  ipcMain.handle('logs.clear', async () => requireDatabase().clearLogs())

  ipcMain.handle('settings.get', async () => requireDatabase().getSettings())
  ipcMain.handle('settings.set', async (_event, payload: SettingsPayload) => {
    const data = requireDatabase().setSettings(payload)
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

async function bootstrap(): Promise<void> {
  await app.whenReady()
  syncTheme()
  db = new DatabaseService(app)
  await registerIpcHandlers()
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
  await saveAllElectronSessions()
  for (const profileId of [...runtimeContexts.keys()]) {
    await stopRuntime(profileId)
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

void bootstrap()
