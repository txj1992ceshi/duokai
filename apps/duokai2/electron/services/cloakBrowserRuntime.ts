import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  installCloakClientHintsPolicy,
  type CloakClientHintsPolicy,
} from './cloakBrowserClientHints.ts'
import type {
  CloakBrowserBinaryDescriptor,
  CloakBrowserRuntimeIdentity,
  CloakRuntimeContextLike,
  CloakRuntimePageLike,
  InspectCloakRuntimeIdentityInput,
} from './cloakBrowserIdentity.ts'
import {
  assertCloakBinaryReady,
  CloakIdentityError,
  inspectCloakRuntimeIdentity,
} from './cloakBrowserIdentity.ts'

export const CLOAK_WRAPPER_VERSION = '0.5.2'
export const CLOAK_RELEASE_CHANNEL = 'stable' as const

export type CloakRuntimeErrorCode =
  | 'invalid_request'
  | 'unsupported_platform'
  | 'wrapper_unavailable'
  | 'binary_not_installed'
  | 'binary_not_executable'
  | 'license_unavailable'
  | 'launch_failed'
  | 'runtime_identity_failed'

export class CloakRuntimeError extends Error {
  readonly code: CloakRuntimeErrorCode

  constructor(code: CloakRuntimeErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakRuntimeError'
    this.code = code
  }
}

export interface CloakBrowserPageLike extends CloakRuntimePageLike {
  goto?(url: string, options?: Record<string, unknown>): Promise<unknown>
  evaluate?<Result>(expression: string | (() => Result | Promise<Result>)): Promise<Result>
  waitForEvent?<Result>(event: string): Promise<Result>
}

export interface CloakBrowserContextLike extends CloakRuntimeContextLike {
  pages(): CloakBrowserPageLike[]
  newPage(): Promise<CloakBrowserPageLike>
  on?(event: 'page', listener: (page: CloakBrowserPageLike) => void): void
  close(): Promise<void>
  storageState?(options?: { path?: string }): Promise<unknown>
}

export interface CloakBrowserModuleLike {
  binaryInfo(browserVersion?: string, releaseChannel?: string): CloakBrowserBinaryDescriptor
  launchPersistentContext(options: Record<string, unknown>): Promise<CloakBrowserContextLike>
}

export interface CloakRuntimeProxyConfig {
  server: string
  bypass?: string
  username?: string
  password?: string
}

export interface CloakRuntimeLaunchRequest {
  userDataDir: string
  downloadsDir: string
  cacheDir: string
  locale: string
  timezoneId: string
  fingerprintSeed: number
  browserVersion: string
  clientHintsPolicy?: CloakClientHintsPolicy
  viewport: { width: number; height: number } | null
  deviceMode?: 'desktop' | 'android' | 'ios'
  geolocation?: {
    latitude: number
    longitude: number
    accuracy?: number
  }
  permissions?: string[]
  proxy?: CloakRuntimeProxyConfig
  extraArgs?: string[]
  mappedFingerprintArgs?: string[]
  env?: NodeJS.ProcessEnv
}

export interface CloakRuntimeLaunchResult {
  context: CloakBrowserContextLike
  identity: CloakBrowserRuntimeIdentity
  launchedAt: string
}

export interface CloakRuntimeDependencies {
  loadModule?: () => Promise<CloakBrowserModuleLike>
  inspectIdentity?: (
    input: InspectCloakRuntimeIdentityInput,
  ) => Promise<CloakBrowserRuntimeIdentity>
  now?: () => Date
}

const BLOCKED_ARGUMENT_KEYS = new Set([
  '--fingerprint',
  '--fingerprint-timezone',
  '--fingerprint-locale',
  '--lang',
  '--accept-lang',
  '--user-data-dir',
  '--profile-directory',
  '--remote-debugging-port',
  '--no-sandbox',
  '--disable-web-security',
  '--disable-webrtc',
  '--force-webrtc-ip-handling-policy',
  '--webrtc-ip-handling-policy',
  '--enable-do-not-track',
])

const TRUSTED_MAPPED_ARGUMENT_KEYS = new Set([
  '--fingerprint-platform',
  '--fingerprint-hardware-concurrency',
  '--fingerprint-device-memory',
  '--fingerprint-screen-width',
  '--fingerprint-screen-height',
  '--fingerprint-taskbar-height',
  '--fingerprint-brand',
  '--fingerprint-brand-version',
  '--fingerprint-platform-version',
  '--fingerprint-gpu-vendor',
  '--fingerprint-gpu-renderer',
  '--fingerprint-location',
  '--fingerprint-noise',
  '--fingerprint-webrtc-ip',
  '--disable-webrtc',
  '--force-webrtc-ip-handling-policy',
  '--webrtc-ip-handling-policy',
  '--enable-do-not-track',
])

const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'GIT_HTTP_PROXY',
  'GIT_HTTPS_PROXY',
] as const

function argumentKey(argument: string): string {
  return argument.split('=')[0] || argument
}

function buildLocalePreferenceValue(locale: string): string {
  const normalized = locale.trim()
  const root = normalized.split('-')[0]?.trim()
  return root && root.toLowerCase() !== normalized.toLowerCase()
    ? `${normalized},${root}`
    : normalized
}

export async function ensureCloakProfileLocalePreferences(
  userDataDir: string,
  locale: string,
): Promise<void> {
  const normalizedLocale = locale.trim()
  if (!normalizedLocale) {
    throw new CloakRuntimeError('invalid_request', 'locale is required for Cloak profile preparation.')
  }

  const profileDirectory = path.join(userDataDir, 'Default')
  const preferencesPath = path.join(profileDirectory, 'Preferences')
  let preferences: Record<string, unknown> = {}
  try {
    const raw = await readFile(preferencesPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      preferences = parsed as Record<string, unknown>
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code !== 'ENOENT') {
      throw new CloakRuntimeError(
        'invalid_request',
        `Unable to read Cloak profile preferences at ${preferencesPath}.`,
        error,
      )
    }
  }

  const languageValue = buildLocalePreferenceValue(normalizedLocale)
  const currentIntl =
    preferences.intl && typeof preferences.intl === 'object' && !Array.isArray(preferences.intl)
      ? (preferences.intl as Record<string, unknown>)
      : {}
  if (
    currentIntl.accept_languages === languageValue &&
    currentIntl.selected_languages === languageValue
  ) {
    return
  }

  preferences.intl = {
    ...currentIntl,
    accept_languages: languageValue,
    selected_languages: languageValue,
  }
  await mkdir(profileDirectory, { recursive: true })
  const temporaryPath = `${preferencesPath}.duokai-${process.pid}-${Date.now()}.tmp`
  try {
    await writeFile(temporaryPath, JSON.stringify(preferences), 'utf8')
    await rename(temporaryPath, preferencesPath)
  } catch (error) {
    throw new CloakRuntimeError(
      'invalid_request',
      `Unable to persist Cloak profile locale preferences at ${preferencesPath}.`,
      error,
    )
  }
}

function assertFullChromiumVersion(version: string): void {
  if (!/^\d+(?:\.\d+){3,4}$/.test(version)) {
    throw new CloakRuntimeError(
      'invalid_request',
      `CloakBrowser requires a fully pinned numeric Chromium version; received "${version}".`,
    )
  }
}

function assertLoopbackProxy(proxy: CloakRuntimeProxyConfig): void {
  let parsed: URL
  try {
    parsed = new URL(proxy.server)
  } catch {
    throw new CloakRuntimeError(
      'invalid_request',
      'CloakBrowser proxy server must be a valid URL.',
    )
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    parsed.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '::1'].includes(hostname) ||
    !parsed.port
  ) {
    throw new CloakRuntimeError(
      'invalid_request',
      'CloakBrowser only accepts a prepared loopback HTTP proxy bridge.',
    )
  }
  if (parsed.username || parsed.password || proxy.username || proxy.password) {
    throw new CloakRuntimeError(
      'invalid_request',
      'CloakBrowser proxy transport must not expose upstream credentials.',
    )
  }
}

function assertLaunchRequest(request: CloakRuntimeLaunchRequest): void {
  if (request.deviceMode && request.deviceMode !== 'desktop') {
    throw new CloakRuntimeError(
      'unsupported_platform',
      `CloakBrowser Phase 1 only supports desktop profiles; received ${request.deviceMode}.`,
    )
  }
  for (const [name, value] of [
    ['userDataDir', request.userDataDir],
    ['downloadsDir', request.downloadsDir],
    ['cacheDir', request.cacheDir],
    ['locale', request.locale],
    ['timezoneId', request.timezoneId],
  ] as const) {
    if (!String(value).trim()) {
      throw new CloakRuntimeError('invalid_request', `${name} is required for CloakBrowser launch.`)
    }
  }
  if (!Number.isSafeInteger(request.fingerprintSeed) || request.fingerprintSeed <= 0) {
    throw new CloakRuntimeError(
      'invalid_request',
      'fingerprintSeed must be a positive safe integer.',
    )
  }
  assertFullChromiumVersion(request.browserVersion)
  if (request.proxy) {
    assertLoopbackProxy(request.proxy)
  }
}

export function normalizeCloakArgs(
  extraArgs: string[] = [],
  fingerprintSeed: number,
  mappedFingerprintArgs: string[] = [],
): string[] {
  const normalized = new Map<string, string>()
  for (const rawArgument of extraArgs) {
    const argument = String(rawArgument).trim()
    if (!argument) {
      continue
    }
    const key = argumentKey(argument)
    if (BLOCKED_ARGUMENT_KEYS.has(key) || key.startsWith('--fingerprint')) {
      throw new CloakRuntimeError(
        'invalid_request',
        `CloakBrowser protected launch argument cannot be overridden: ${key}`,
      )
    }
    normalized.set(key, argument)
  }

  for (const rawArgument of mappedFingerprintArgs) {
    const argument = String(rawArgument).trim()
    if (!argument) {
      continue
    }
    const key = argumentKey(argument)
    if (!TRUSTED_MAPPED_ARGUMENT_KEYS.has(key)) {
      throw new CloakRuntimeError(
        'invalid_request',
        `Unsupported mapped Cloak fingerprint argument: ${key}`,
      )
    }
    if (key === '--fingerprint-webrtc-ip' && argument.endsWith('=auto')) {
      throw new CloakRuntimeError(
        'invalid_request',
        'Automatic WebRTC IP resolution is forbidden; Duokai must provide verified network identity.',
      )
    }
    normalized.set(key, argument)
  }

  normalized.set('--fingerprint', `--fingerprint=${fingerprintSeed}`)
  return [...normalized.values()]
}

export function configureCloakProcessEnvironment(
  request: Pick<CloakRuntimeLaunchRequest, 'browserVersion' | 'cacheDir'>,
): void {
  process.env.CLOAKBROWSER_AUTO_UPDATE = 'false'
  process.env.CLOAKBROWSER_VERSION = request.browserVersion
  process.env.CLOAKBROWSER_RELEASE_CHANNEL = CLOAK_RELEASE_CHANNEL
  process.env.CLOAKBROWSER_CACHE_DIR = request.cacheDir
}

export function buildCloakLaunchEnv(
  request: Pick<CloakRuntimeLaunchRequest, 'browserVersion' | 'cacheDir' | 'env'>,
): NodeJS.ProcessEnv {
  const env = { ...(request.env ?? process.env) }
  for (const key of PROXY_ENV_KEYS) {
    delete env[key]
  }
  env.CLOAKBROWSER_AUTO_UPDATE = 'false'
  env.CLOAKBROWSER_VERSION = request.browserVersion
  env.CLOAKBROWSER_RELEASE_CHANNEL = CLOAK_RELEASE_CHANNEL
  env.CLOAKBROWSER_CACHE_DIR = request.cacheDir
  return env
}

export function buildCloakLaunchOptions(
  request: CloakRuntimeLaunchRequest,
): Record<string, unknown> {
  assertLaunchRequest(request)
  return {
    userDataDir: request.userDataDir,
    headless: false,
    stealthArgs: false,
    geoip: false,
    browserVersion: request.browserVersion,
    releaseChannel: CLOAK_RELEASE_CHANNEL,
    locale: request.locale,
    timezone: request.timezoneId,
    viewport: request.viewport,
    ...(request.proxy ? { proxy: request.proxy } : {}),
    args: normalizeCloakArgs(
      request.extraArgs,
      request.fingerprintSeed,
      request.mappedFingerprintArgs,
    ),
    contextOptions: {
      ignoreHTTPSErrors: true,
      acceptDownloads: true,
      permissions: request.permissions ?? [],
      ...(request.geolocation ? { geolocation: request.geolocation } : {}),
    },
    launchOptions: {
      downloadsPath: request.downloadsDir,
      env: buildCloakLaunchEnv(request),
    },
  }
}

export async function loadCloakBrowserModule(): Promise<CloakBrowserModuleLike> {
  const moduleSpecifier = process.env.DUOKAI_CLOAKBROWSER_MODULE || 'cloakbrowser'
  try {
    return (await import(moduleSpecifier)) as unknown as CloakBrowserModuleLike
  } catch (error) {
    throw new CloakRuntimeError(
      'wrapper_unavailable',
      `Unable to load CloakBrowser wrapper from "${moduleSpecifier}".`,
      error,
    )
  }
}

function mapIdentityError(error: CloakIdentityError): CloakRuntimeError {
  if (error.code === 'binary_not_installed') {
    return new CloakRuntimeError('binary_not_installed', error.message, error)
  }
  if (error.code === 'binary_not_executable') {
    return new CloakRuntimeError('binary_not_executable', error.message, error)
  }
  return new CloakRuntimeError('runtime_identity_failed', error.message, error)
}

function classifyLaunchFailure(error: unknown): CloakRuntimeError {
  if (error instanceof CloakRuntimeError) {
    return error
  }
  if (error instanceof CloakIdentityError) {
    return mapIdentityError(error)
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/license/i.test(message)) {
    return new CloakRuntimeError('license_unavailable', message, error)
  }
  return new CloakRuntimeError('launch_failed', `CloakBrowser launch failed: ${message}`, error)
}

export async function closeCloakContextSafely(
  context: Pick<CloakBrowserContextLike, 'close'> | null,
): Promise<void> {
  if (!context) {
    return
  }
  await context.close().catch(() => undefined)
}

export async function launchCloakPersistentContext(
  request: CloakRuntimeLaunchRequest,
  dependencies: CloakRuntimeDependencies = {},
): Promise<CloakRuntimeLaunchResult> {
  assertLaunchRequest(request)
  const now = dependencies.now ?? (() => new Date())
  configureCloakProcessEnvironment(request)
  const loadModule = dependencies.loadModule ?? loadCloakBrowserModule
  const inspectIdentity = dependencies.inspectIdentity ?? inspectCloakRuntimeIdentity
  let context: CloakBrowserContextLike | null = null
  try {
    const cloakBrowser = await loadModule()
    const descriptor = cloakBrowser.binaryInfo(
      request.browserVersion,
      CLOAK_RELEASE_CHANNEL,
    )
    await assertCloakBinaryReady(descriptor)
    await ensureCloakProfileLocalePreferences(request.userDataDir, request.locale)
    context = await cloakBrowser.launchPersistentContext(buildCloakLaunchOptions(request))
    if (request.clientHintsPolicy) {
      await installCloakClientHintsPolicy(context, request.clientHintsPolicy)
    }
    const identity = await inspectIdentity({
      wrapperVersion: CLOAK_WRAPPER_VERSION,
      requestedChromiumVersion: request.browserVersion,
      releaseChannel: CLOAK_RELEASE_CHANNEL,
      descriptor,
      context,
      now,
    })
    return {
      context,
      identity,
      launchedAt: now().toISOString(),
    }
  } catch (error) {
    await closeCloakContextSafely(context)
    throw classifyLaunchFailure(error)
  }
}
