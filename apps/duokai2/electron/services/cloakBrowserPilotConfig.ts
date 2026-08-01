import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { ProfileRecord, WorkspaceEnvironment, WorkspacePaths } from '../../src/shared/types.ts'
import {
  CLOAK_PILOT_BINARY_SHA256,
  CLOAK_PILOT_BROWSER_VERSION,
} from './cloakBrowserInstallPreflight.ts'

export const CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION = 1
export const CLOAK_PILOT_COMPATIBILITY_SCHEMA_VERSION = 1

export type CloakPilotLocalEligibilityReason =
  | 'enabled'
  | 'config_missing'
  | 'profile_not_enabled'
  | 'invalid_profile_id'

export interface CloakPilotLocalConfig {
  schemaVersion: typeof CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION
  enabledProfileIds: string[]
  updatedAt: string
}

export interface LoadedCloakPilotLocalConfig {
  config: CloakPilotLocalConfig
  exists: boolean
  configHash: string
  filePath: string
}

export interface CloakPilotLocalEligibility {
  enabled: boolean
  reason: CloakPilotLocalEligibilityReason
  profileId: string
  enabledProfileIds: string[]
  configHash: string
  configUpdatedAt: string
  cacheDir: string
  browserVersion: typeof CLOAK_PILOT_BROWSER_VERSION
  binarySha256: typeof CLOAK_PILOT_BINARY_SHA256
}

export interface CloakPilotCompatibilityReceipt {
  schemaVersion: typeof CLOAK_PILOT_COMPATIBILITY_SCHEMA_VERSION
  profileId: string
  mode: 'runtime-only-browser-identity-overlay'
  storedBrowserVersion: string
  storedBrowserKernelVersion: string
  storedUserAgentMajor: string
  effectiveBrowserVersion: typeof CLOAK_PILOT_BROWSER_VERSION
  effectiveChromiumVersion: string
  effectiveChromiumMajor: string
  configHash: string
  configUpdatedAt: string
  storedNoiseModes: {
    canvas: string
    webglImage: string
    audioContext: string
    clientRects: string
  }
  effectiveNoiseModes: {
    canvas: string
    webglImage: string
    audioContext: string
    clientRects: string
  }
  effectiveNoisePolicy: 'native-seed-derived' | 'native-noise-disabled'
  compatibilityWarnings: string[]
  modifiedFields: string[]
  receiptHash: string
}

export class CloakPilotLocalConfigError extends Error {
  readonly code:
    | 'invalid_path'
    | 'invalid_permissions'
    | 'invalid_config'
    | 'config_io_failed'

  constructor(
    code: CloakPilotLocalConfigError['code'],
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakPilotLocalConfigError'
    this.code = code
  }
}

function canonicalHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizeProfileId(value: unknown): string {
  const profileId = String(value ?? '').trim()
  if (
    !profileId ||
    profileId === '*' ||
    profileId.includes('\0') ||
    profileId.includes('\r') ||
    profileId.includes('\n')
  ) {
    return ''
  }
  return profileId
}

function normalizeEnabledProfileIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new CloakPilotLocalConfigError(
      'invalid_config',
      'Cloak Pilot enabledProfileIds must be an array.',
    )
  }
  return Array.from(
    new Set(
      value.map(normalizeProfileId).filter((entry): entry is string => Boolean(entry)),
    ),
  ).sort()
}

function defaultConfig(): CloakPilotLocalConfig {
  return {
    schemaVersion: CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION,
    enabledProfileIds: [],
    updatedAt: '',
  }
}

function normalizeConfig(value: unknown): CloakPilotLocalConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloakPilotLocalConfigError(
      'invalid_config',
      'Cloak Pilot local configuration must be a JSON object.',
    )
  }
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION) {
    throw new CloakPilotLocalConfigError(
      'invalid_config',
      `Unsupported Cloak Pilot local configuration schema ${String(record.schemaVersion)}.`,
    )
  }
  const updatedAt = String(record.updatedAt ?? '').trim()
  if (updatedAt && !Number.isFinite(Date.parse(updatedAt))) {
    throw new CloakPilotLocalConfigError(
      'invalid_config',
      'Cloak Pilot local configuration updatedAt must be an ISO date.',
    )
  }
  return {
    schemaVersion: CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION,
    enabledProfileIds: normalizeEnabledProfileIds(record.enabledProfileIds),
    updatedAt,
  }
}

function assertAbsoluteConfigPath(filePath: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new CloakPilotLocalConfigError(
      'invalid_path',
      'Cloak Pilot local configuration path must be absolute.',
    )
  }
  return path.resolve(filePath)
}

async function assertPrivateFile(filePath: string): Promise<void> {
  if (process.platform === 'win32') return
  const metadata = await stat(filePath)
  if ((metadata.mode & 0o077) !== 0) {
    throw new CloakPilotLocalConfigError(
      'invalid_permissions',
      `Cloak Pilot local configuration must not be accessible by group or other users; mode=${(
        metadata.mode & 0o777
      ).toString(8)}.`,
    )
  }
}

async function fsyncDirectory(directoryPath: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(directoryPath, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

export function getDefaultCloakPilotCacheDir(): string {
  return path.join(os.homedir(), '.cloakbrowser')
}

export function getCloakPilotLocalConfigPath(userDataDir: string): string {
  if (!path.isAbsolute(userDataDir)) {
    throw new CloakPilotLocalConfigError(
      'invalid_path',
      'Electron userData directory must be absolute.',
    )
  }
  return path.join(path.resolve(userDataDir), 'cloak-pilot', 'pilot-config.json')
}

export async function readCloakPilotLocalConfig(
  filePath: string,
): Promise<LoadedCloakPilotLocalConfig> {
  const resolvedPath = assertAbsoluteConfigPath(filePath)
  try {
    const content = await readFile(resolvedPath, 'utf8')
    await assertPrivateFile(resolvedPath)
    const config = normalizeConfig(JSON.parse(content) as unknown)
    return {
      config,
      exists: true,
      configHash: canonicalHash(config),
      filePath: resolvedPath,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const config = defaultConfig()
      return {
        config,
        exists: false,
        configHash: canonicalHash(config),
        filePath: resolvedPath,
      }
    }
    if (error instanceof CloakPilotLocalConfigError) throw error
    if (error instanceof SyntaxError) {
      throw new CloakPilotLocalConfigError(
        'invalid_config',
        'Cloak Pilot local configuration contains malformed JSON.',
        error,
      )
    }
    throw new CloakPilotLocalConfigError(
      'config_io_failed',
      'Unable to read Cloak Pilot local configuration.',
      error,
    )
  }
}

export async function writeCloakPilotLocalConfigAtomic(
  filePath: string,
  input: CloakPilotLocalConfig,
): Promise<LoadedCloakPilotLocalConfig> {
  const resolvedPath = assertAbsoluteConfigPath(filePath)
  const config = normalizeConfig(input)
  const directory = path.dirname(resolvedPath)
  const temporaryPath = path.join(directory, `.${path.basename(resolvedPath)}.${randomUUID()}.tmp`)
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') await chmod(directory, 0o700)
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    if (process.platform !== 'win32') await chmod(temporaryPath, 0o600)
    const handle = await open(temporaryPath, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, resolvedPath)
    if (process.platform !== 'win32') await chmod(resolvedPath, 0o600)
    await fsyncDirectory(directory)
    return await readCloakPilotLocalConfig(resolvedPath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    if (error instanceof CloakPilotLocalConfigError) throw error
    throw new CloakPilotLocalConfigError(
      'config_io_failed',
      'Unable to persist Cloak Pilot local configuration atomically.',
      error,
    )
  }
}

export async function setCloakPilotProfileEnabled(
  filePath: string,
  profileIdInput: string,
  enabled: boolean,
  now = new Date(),
): Promise<LoadedCloakPilotLocalConfig> {
  const profileId = normalizeProfileId(profileIdInput)
  if (!profileId) {
    throw new CloakPilotLocalConfigError(
      'invalid_config',
      'A concrete Profile ID is required for Cloak Pilot.',
    )
  }
  const current = await readCloakPilotLocalConfig(filePath)
  const ids = new Set(current.config.enabledProfileIds)
  if (enabled) ids.add(profileId)
  else ids.delete(profileId)
  return await writeCloakPilotLocalConfigAtomic(filePath, {
    schemaVersion: CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION,
    enabledProfileIds: [...ids].sort(),
    updatedAt: now.toISOString(),
  })
}

export function evaluateCloakPilotLocalEligibility(
  profileIdInput: string,
  loaded: LoadedCloakPilotLocalConfig,
): CloakPilotLocalEligibility {
  const profileId = normalizeProfileId(profileIdInput)
  const base: Omit<CloakPilotLocalEligibility, 'enabled' | 'reason'> = {
    profileId,
    enabledProfileIds: [...loaded.config.enabledProfileIds],
    configHash: loaded.configHash,
    configUpdatedAt: loaded.config.updatedAt,
    cacheDir: getDefaultCloakPilotCacheDir(),
    browserVersion: CLOAK_PILOT_BROWSER_VERSION,
    binarySha256: CLOAK_PILOT_BINARY_SHA256,
  }
  if (!profileId) {
    return { ...base, enabled: false, reason: 'invalid_profile_id' }
  }
  if (!loaded.exists) {
    return { ...base, enabled: false, reason: 'config_missing' }
  }
  if (!loaded.config.enabledProfileIds.includes(profileId)) {
    return { ...base, enabled: false, reason: 'profile_not_enabled' }
  }
  return { ...base, enabled: true, reason: 'enabled' }
}

function chromiumRuntimeVersion(packageVersion: string): string {
  return packageVersion.split('.').slice(0, 4).join('.')
}

function chromiumMajor(value: string): string {
  return String(value ?? '').trim().match(/^(\d+)/)?.[1] || ''
}

function userAgentMajor(userAgent: string): string {
  return String(userAgent ?? '').match(/Chrome\/(\d+)/i)?.[1] || ''
}

function replaceChromiumVersionInUserAgent(userAgent: string, runtimeVersion: string): string {
  const source = String(userAgent ?? '')
  if (!/Chrome\/\d+(?:\.\d+){0,4}/i.test(source)) {
    throw new CloakPilotLocalConfigError(
      'invalid_config',
      'Cloak Pilot requires a desktop Chrome User-Agent that can be aligned at runtime.',
    )
  }
  return source.replace(/Chrome\/\d+(?:\.\d+){0,4}/i, `Chrome/${runtimeVersion}`)
}

function workspaceTemplateFingerprintHash(
  templateId: string,
  templateRevision: string,
  resolvedEnvironment: WorkspaceEnvironment,
  paths: WorkspacePaths,
): string {
  return canonicalHash({
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

export function buildCloakPilotRuntimeProfile(
  profile: ProfileRecord,
  eligibility: CloakPilotLocalEligibility,
): { profile: ProfileRecord; compatibility: CloakPilotCompatibilityReceipt } {
  if (!eligibility.enabled || profile.id !== eligibility.profileId) {
    throw new CloakPilotLocalConfigError(
      'invalid_config',
      'Cloak Pilot runtime profile overlay requires an enabled exact Profile ID.',
    )
  }
  const effectiveChromiumVersion = chromiumRuntimeVersion(CLOAK_PILOT_BROWSER_VERSION)
  const effectiveChromiumMajor = chromiumMajor(effectiveChromiumVersion)
  const storedBrowserVersion = String(profile.fingerprintConfig.advanced.browserVersion || '').trim()
  const storedBrowserKernelVersion = String(
    profile.fingerprintConfig.advanced.browserKernelVersion || '',
  ).trim()
  const storedUserAgentMajor = userAgentMajor(profile.fingerprintConfig.userAgent)
  const userAgent = replaceChromiumVersionInUserAgent(
    profile.fingerprintConfig.userAgent,
    effectiveChromiumVersion,
  )
  const storedNoiseModes = {
    canvas: String(profile.fingerprintConfig.advanced.canvasMode || ''),
    webglImage: String(profile.fingerprintConfig.advanced.webglImageMode || ''),
    audioContext: String(profile.fingerprintConfig.advanced.audioContextMode || ''),
    clientRects: String(profile.fingerprintConfig.advanced.clientRectsMode || ''),
  }
  const storedNoiseValues = Object.values(storedNoiseModes)
  const disabledNoiseCount = storedNoiseValues.filter((mode) => mode === 'off').length
  const partialNoisePolicy =
    disabledNoiseCount > 0 && disabledNoiseCount < storedNoiseValues.length
  const effectiveNoiseModes = partialNoisePolicy
    ? {
        canvas: 'custom',
        webglImage: 'custom',
        audioContext: 'custom',
        clientRects: 'custom',
      }
    : { ...storedNoiseModes }
  const compatibilityWarnings = partialNoisePolicy
    ? [
        'Legacy partial off/custom Canvas, WebGL image, AudioContext and ClientRects modes were aligned in memory to Cloak seed-derived native noise; the stored Profile was not modified.',
      ]
    : []
  const modifiedFields = [
    'fingerprintConfig.advanced.browserKernel',
    'fingerprintConfig.advanced.browserKernelVersion',
    'fingerprintConfig.advanced.browserVersion',
    'fingerprintConfig.userAgent',
    'deviceProfile.browserKernel',
    'deviceProfile.browserVersion',
    'deviceProfile.userAgent',
  ]
  if (partialNoisePolicy) {
    const noiseFields = [
      ['canvas', 'fingerprintConfig.advanced.canvasMode'],
      ['webglImage', 'fingerprintConfig.advanced.webglImageMode'],
      ['audioContext', 'fingerprintConfig.advanced.audioContextMode'],
      ['clientRects', 'fingerprintConfig.advanced.clientRectsMode'],
    ] as const
    for (const [mode, field] of noiseFields) {
      if (storedNoiseModes[mode] !== effectiveNoiseModes[mode]) modifiedFields.push(field)
    }
  }

  const workspace = profile.workspace ? structuredClone(profile.workspace) : profile.workspace
  if (workspace) {
    workspace.resolvedEnvironment.browserFamily = 'chrome'
    workspace.resolvedEnvironment.browserMajorVersionRange = effectiveChromiumMajor
    const templateFingerprintHash = workspaceTemplateFingerprintHash(
      workspace.templateBinding.templateId,
      workspace.templateBinding.templateRevision,
      workspace.resolvedEnvironment,
      workspace.paths,
    )
    workspace.templateBinding.templateFingerprintHash = templateFingerprintHash
    workspace.consistencySummary.templateFingerprintHash = templateFingerprintHash
    modifiedFields.push(
      'workspace.resolvedEnvironment.browserFamily',
      'workspace.resolvedEnvironment.browserMajorVersionRange',
      'workspace.templateBinding.templateFingerprintHash',
      'workspace.consistencySummary.templateFingerprintHash',
    )
  }

  const runtimeProfile: ProfileRecord = {
    ...structuredClone(profile),
    deviceProfile: {
      ...structuredClone(profile.deviceProfile),
      browserKernel: 'chrome',
      browserVersion: effectiveChromiumVersion,
      userAgent,
    },
    fingerprintConfig: {
      ...structuredClone(profile.fingerprintConfig),
      userAgent,
      advanced: {
        ...structuredClone(profile.fingerprintConfig.advanced),
        browserKernel: 'chrome',
        browserKernelVersion: CLOAK_PILOT_BROWSER_VERSION,
        browserVersion: CLOAK_PILOT_BROWSER_VERSION,
        ...(partialNoisePolicy
          ? {
              canvasMode: effectiveNoiseModes.canvas as typeof profile.fingerprintConfig.advanced.canvasMode,
              webglImageMode:
                effectiveNoiseModes.webglImage as typeof profile.fingerprintConfig.advanced.webglImageMode,
              audioContextMode:
                effectiveNoiseModes.audioContext as typeof profile.fingerprintConfig.advanced.audioContextMode,
              clientRectsMode:
                effectiveNoiseModes.clientRects as typeof profile.fingerprintConfig.advanced.clientRectsMode,
            }
          : {}),
      },
    },
    workspace,
  }

  const withoutHash: Omit<CloakPilotCompatibilityReceipt, 'receiptHash'> = {
    schemaVersion: CLOAK_PILOT_COMPATIBILITY_SCHEMA_VERSION,
    profileId: profile.id,
    mode: 'runtime-only-browser-identity-overlay',
    storedBrowserVersion,
    storedBrowserKernelVersion,
    storedUserAgentMajor,
    effectiveBrowserVersion: CLOAK_PILOT_BROWSER_VERSION,
    effectiveChromiumVersion,
    effectiveChromiumMajor,
    configHash: eligibility.configHash,
    configUpdatedAt: eligibility.configUpdatedAt,
    storedNoiseModes,
    effectiveNoiseModes,
    effectiveNoisePolicy:
      partialNoisePolicy || disabledNoiseCount === 0
        ? 'native-seed-derived'
        : 'native-noise-disabled',
    compatibilityWarnings,
    modifiedFields,
  }
  return {
    profile: runtimeProfile,
    compatibility: {
      ...withoutHash,
      receiptHash: canonicalHash(withoutHash),
    },
  }
}

export function validateCloakPilotCompatibilityReceipt(
  receipt: CloakPilotCompatibilityReceipt,
): void {
  const { receiptHash, ...payload } = receipt
  if (
    receipt.schemaVersion !== CLOAK_PILOT_COMPATIBILITY_SCHEMA_VERSION ||
    receipt.mode !== 'runtime-only-browser-identity-overlay' ||
    !normalizeProfileId(receipt.profileId) ||
    receipt.effectiveBrowserVersion !== CLOAK_PILOT_BROWSER_VERSION ||
    receipt.effectiveChromiumVersion !== chromiumRuntimeVersion(CLOAK_PILOT_BROWSER_VERSION) ||
    receipt.effectiveChromiumMajor !== chromiumMajor(CLOAK_PILOT_BROWSER_VERSION) ||
    !/^[a-f0-9]{64}$/i.test(receipt.configHash) ||
    !/^[a-f0-9]{64}$/i.test(receiptHash) ||
    canonicalHash(payload) !== receiptHash
  ) {
    throw new CloakPilotLocalConfigError(
      'invalid_config',
      'Cloak Pilot compatibility receipt is invalid or was modified.',
    )
  }
}
