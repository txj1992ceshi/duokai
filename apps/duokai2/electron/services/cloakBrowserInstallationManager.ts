import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  CLOAK_INSTALL_PREFLIGHT_VERSION,
  CLOAK_PILOT_BROWSER_VERSION,
  runCloakInstallPreflight,
  type CloakInstallPreflightEnvironment,
  type CloakInstallPreflightReceipt,
} from './cloakBrowserInstallPreflight.ts'
import {
  CLOAK_RELEASE_CHANNEL,
  CLOAK_WRAPPER_VERSION,
} from './cloakBrowserRuntime.ts'

export const CLOAK_INSTALLATION_RECEIPT_VERSION = 1
export const CLOAK_INSTALLATION_RECEIPT_FILENAME = 'duokai-cloak-install-receipt.json'

export type CloakInstallationManagerErrorCode =
  | 'explicit_consent_required'
  | 'invalid_configuration'
  | 'installer_unavailable'
  | 'install_failed'
  | 'receipt_missing'
  | 'receipt_invalid'
  | 'receipt_mismatch'
  | 'receipt_io_failed'

export class CloakInstallationManagerError extends Error {
  readonly code: CloakInstallationManagerErrorCode

  constructor(code: CloakInstallationManagerErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakInstallationManagerError'
    this.code = code
  }
}

export interface CloakInstallationReceipt {
  schemaVersion: typeof CLOAK_INSTALLATION_RECEIPT_VERSION
  engine: 'cloakbrowser'
  installationMode: 'explicit-fixed-version'
  wrapperVersion: string
  browserVersion: string
  executableChromiumVersion: string
  releaseChannel: typeof CLOAK_RELEASE_CHANNEL
  platform: string
  tier: 'free' | 'pro'
  cacheDir: string
  binaryPath: string
  binarySha256: string
  preflightSchemaVersion: number
  source: 'cloakbrowser-ensure-binary'
  launchAutoDownload: false
  wrapperAutoUpdate: false
  browserAutoUpdate: false
  fallbackEngine: 'forbidden'
  installedAt: string
  verifiedAt: string
  receiptSha256: string
}

export interface CloakInstallationRequest {
  cacheDir: string
  expectedBinarySha256: string
  explicitConsent: boolean
  receiptPath?: string
  browserVersion?: string
  environment?: CloakInstallPreflightEnvironment
}

export interface CloakInstallationManagerDependencies {
  ensureBinary?: (
    licenseKey: string | undefined,
    browserVersion: string,
    releaseChannel: string,
  ) => Promise<string>
  preflight?: typeof runCloakInstallPreflight
  now?: () => Date
}

function trim(value: unknown): string {
  return String(value ?? '').trim()
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const parent = path.resolve(parentPath)
  const child = path.resolve(childPath)
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    )
  }
  return value
}

function receiptHash(receipt: Omit<CloakInstallationReceipt, 'receiptSha256'>): string {
  return createHash('sha256')
    .update(`duokai-cloak-installation-receipt-v1\n${JSON.stringify(canonicalize(receipt))}`)
    .digest('hex')
}

function assertSha256(value: string, label: string): string {
  const normalized = trim(value).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new CloakInstallationManagerError(
      'invalid_configuration',
      `${label} must be an exact SHA256 hex digest.`,
    )
  }
  return normalized
}

function resolvePaths(request: CloakInstallationRequest): {
  cacheDir: string
  receiptPath: string
  browserVersion: string
} {
  if (!trim(request.cacheDir) || !path.isAbsolute(request.cacheDir)) {
    throw new CloakInstallationManagerError(
      'invalid_configuration',
      'Cloak installation cacheDir must be absolute.',
    )
  }
  const cacheDir = path.resolve(request.cacheDir)
  const browserVersion = trim(request.browserVersion || CLOAK_PILOT_BROWSER_VERSION)
  if (browserVersion !== CLOAK_PILOT_BROWSER_VERSION) {
    throw new CloakInstallationManagerError(
      'invalid_configuration',
      `Cloak installation is pinned to ${CLOAK_PILOT_BROWSER_VERSION}.`,
    )
  }
  const receiptPath = path.resolve(
    request.receiptPath ?? path.join(cacheDir, CLOAK_INSTALLATION_RECEIPT_FILENAME),
  )
  if (!isPathInside(cacheDir, receiptPath)) {
    throw new CloakInstallationManagerError(
      'invalid_configuration',
      'Cloak installation receipt must remain inside the managed cache directory.',
    )
  }
  return { cacheDir, receiptPath, browserVersion }
}

async function fsyncDirectory(directoryPath: string): Promise<void> {
  const handle = await open(directoryPath, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function atomicWritePrivate(filePath: string, content: string): Promise<void> {
  const resolvedPath = path.resolve(filePath)
  const directory = path.dirname(resolvedPath)
  const temporaryPath = path.join(
    directory,
    `.${path.basename(resolvedPath)}.${process.pid}.${randomUUID()}.tmp`,
  )
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') await chmod(directory, 0o700)
    await writeFile(temporaryPath, content, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    const handle = await open(temporaryPath, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, resolvedPath)
    if (process.platform !== 'win32') await chmod(resolvedPath, 0o600)
    await fsyncDirectory(directory)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function defaultEnsureBinary(
  licenseKey: string | undefined,
  browserVersion: string,
  releaseChannel: string,
): Promise<string> {
  const moduleSpecifier = process.env.DUOKAI_CLOAKBROWSER_MODULE || 'cloakbrowser'
  const module = (await import(moduleSpecifier)) as unknown as {
    ensureBinary?: (
      licenseKey?: string,
      browserVersion?: string,
      releaseChannel?: string,
    ) => Promise<string>
  }
  if (typeof module.ensureBinary !== 'function') {
    throw new CloakInstallationManagerError(
      'installer_unavailable',
      `CloakBrowser module "${moduleSpecifier}" does not expose ensureBinary().`,
    )
  }
  return await module.ensureBinary(licenseKey, browserVersion, releaseChannel)
}

function buildReceipt(
  preflight: CloakInstallPreflightReceipt,
  installedAt: string,
): CloakInstallationReceipt {
  const payload: Omit<CloakInstallationReceipt, 'receiptSha256'> = {
    schemaVersion: CLOAK_INSTALLATION_RECEIPT_VERSION,
    engine: 'cloakbrowser',
    installationMode: 'explicit-fixed-version',
    wrapperVersion: preflight.wrapperVersion,
    browserVersion: preflight.browserVersion,
    executableChromiumVersion: preflight.executableChromiumVersion,
    releaseChannel: preflight.releaseChannel,
    platform: preflight.platform,
    tier: preflight.tier,
    cacheDir: path.resolve(preflight.cacheDir),
    binaryPath: path.resolve(preflight.binaryPath),
    binarySha256: preflight.binarySha256.toLowerCase(),
    preflightSchemaVersion: preflight.schemaVersion,
    source: 'cloakbrowser-ensure-binary',
    launchAutoDownload: false,
    wrapperAutoUpdate: false,
    browserAutoUpdate: false,
    fallbackEngine: 'forbidden',
    installedAt,
    verifiedAt: preflight.verifiedAt,
  }
  return { ...payload, receiptSha256: receiptHash(payload) }
}

export function validateCloakInstallationReceipt(
  receipt: CloakInstallationReceipt,
): void {
  if (!receipt || typeof receipt !== 'object') {
    throw new CloakInstallationManagerError('receipt_invalid', 'Cloak installation receipt is missing.')
  }
  const { receiptSha256, ...payload } = receipt
  if (
    receipt.schemaVersion !== CLOAK_INSTALLATION_RECEIPT_VERSION ||
    receipt.engine !== 'cloakbrowser' ||
    receipt.installationMode !== 'explicit-fixed-version' ||
    receipt.wrapperVersion !== CLOAK_WRAPPER_VERSION ||
    receipt.browserVersion !== CLOAK_PILOT_BROWSER_VERSION ||
    receipt.releaseChannel !== CLOAK_RELEASE_CHANNEL ||
    receipt.preflightSchemaVersion !== CLOAK_INSTALL_PREFLIGHT_VERSION ||
    receipt.source !== 'cloakbrowser-ensure-binary' ||
    receipt.launchAutoDownload !== false ||
    receipt.wrapperAutoUpdate !== false ||
    receipt.browserAutoUpdate !== false ||
    receipt.fallbackEngine !== 'forbidden' ||
    !path.isAbsolute(receipt.cacheDir) ||
    !path.isAbsolute(receipt.binaryPath) ||
    !isPathInside(receipt.cacheDir, receipt.binaryPath) ||
    !Number.isFinite(Date.parse(receipt.installedAt)) ||
    !Number.isFinite(Date.parse(receipt.verifiedAt)) ||
    !/^[a-f0-9]{64}$/.test(receipt.binarySha256) ||
    !/^[a-f0-9]{64}$/.test(receiptSha256) ||
    receiptHash(payload) !== receiptSha256
  ) {
    throw new CloakInstallationManagerError(
      'receipt_invalid',
      'Cloak installation receipt is invalid or has been modified.',
    )
  }
}

export async function readCloakInstallationReceipt(
  filePath: string,
): Promise<CloakInstallationReceipt> {
  let receipt: CloakInstallationReceipt
  try {
    receipt = JSON.parse(await readFile(path.resolve(filePath), 'utf8')) as CloakInstallationReceipt
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CloakInstallationManagerError(
        'receipt_missing',
        `Cloak installation receipt is missing at ${path.resolve(filePath)}.`,
        error,
      )
    }
    throw new CloakInstallationManagerError(
      'receipt_io_failed',
      `Unable to read Cloak installation receipt at ${path.resolve(filePath)}.`,
      error,
    )
  }
  validateCloakInstallationReceipt(receipt)
  if (process.platform !== 'win32') {
    try {
      const metadata = await stat(path.resolve(filePath))
      if ((metadata.mode & 0o077) !== 0) {
        throw new CloakInstallationManagerError(
          'receipt_invalid',
          `Cloak installation receipt must be private; mode=${(metadata.mode & 0o777).toString(8)}.`,
        )
      }
    } catch (error) {
      if (error instanceof CloakInstallationManagerError) throw error
      throw new CloakInstallationManagerError('receipt_io_failed', 'Unable to inspect receipt permissions.', error)
    }
  }
  return receipt
}

export async function installCloakBrowserFixedVersion(
  request: CloakInstallationRequest,
  dependencies: CloakInstallationManagerDependencies = {},
): Promise<CloakInstallationReceipt> {
  if (request.explicitConsent !== true) {
    throw new CloakInstallationManagerError(
      'explicit_consent_required',
      'Cloak installation requires an explicit user or release-engineering action.',
    )
  }
  const { cacheDir, receiptPath, browserVersion } = resolvePaths(request)
  const expectedBinarySha256 = assertSha256(
    request.expectedBinarySha256,
    'expectedBinarySha256',
  )
  process.env.CLOAKBROWSER_AUTO_UPDATE = 'false'
  process.env.CLOAKBROWSER_VERSION = browserVersion
  process.env.CLOAKBROWSER_RELEASE_CHANNEL = CLOAK_RELEASE_CHANNEL
  process.env.CLOAKBROWSER_CACHE_DIR = cacheDir

  let installedBinaryPath: string
  try {
    installedBinaryPath = path.resolve(
      await (dependencies.ensureBinary ?? defaultEnsureBinary)(
        undefined,
        browserVersion,
        CLOAK_RELEASE_CHANNEL,
      ),
    )
  } catch (error) {
    if (error instanceof CloakInstallationManagerError) throw error
    throw new CloakInstallationManagerError(
      'install_failed',
      `Explicit fixed-version Cloak installation failed: ${error instanceof Error ? error.message : String(error)}`,
      error,
    )
  }

  const preflight = await (dependencies.preflight ?? runCloakInstallPreflight)({
    cacheDir,
    expectedBinarySha256,
    browserVersion,
    environment: request.environment,
  })
  if (path.resolve(preflight.binaryPath) !== installedBinaryPath) {
    throw new CloakInstallationManagerError(
      'receipt_mismatch',
      'Cloak installer returned a binary path that does not match the verified preflight identity.',
    )
  }
  const receipt = buildReceipt(
    preflight,
    (dependencies.now ?? (() => new Date()))().toISOString(),
  )
  try {
    await atomicWritePrivate(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  } catch (error) {
    throw new CloakInstallationManagerError(
      'receipt_io_failed',
      `Unable to atomically persist Cloak installation receipt at ${receiptPath}.`,
      error,
    )
  }
  return receipt
}

export async function verifyCloakBrowserInstallation(
  request: Omit<CloakInstallationRequest, 'explicitConsent'>,
  dependencies: Pick<CloakInstallationManagerDependencies, 'preflight'> = {},
): Promise<{ receipt: CloakInstallationReceipt; preflight: CloakInstallPreflightReceipt }> {
  const { cacheDir, receiptPath, browserVersion } = resolvePaths({
    ...request,
    explicitConsent: false,
  })
  const expectedBinarySha256 = assertSha256(
    request.expectedBinarySha256,
    'expectedBinarySha256',
  )
  const receipt = await readCloakInstallationReceipt(receiptPath)
  const preflight = await (dependencies.preflight ?? runCloakInstallPreflight)({
    cacheDir,
    expectedBinarySha256,
    browserVersion,
    environment: request.environment,
  })
  if (
    receipt.wrapperVersion !== preflight.wrapperVersion ||
    receipt.browserVersion !== preflight.browserVersion ||
    receipt.executableChromiumVersion !== preflight.executableChromiumVersion ||
    receipt.releaseChannel !== preflight.releaseChannel ||
    receipt.platform !== preflight.platform ||
    receipt.tier !== preflight.tier ||
    path.resolve(receipt.cacheDir) !== path.resolve(preflight.cacheDir) ||
    path.resolve(receipt.binaryPath) !== path.resolve(preflight.binaryPath) ||
    receipt.binarySha256 !== preflight.binarySha256.toLowerCase()
  ) {
    throw new CloakInstallationManagerError(
      'receipt_mismatch',
      'Cloak installation receipt does not match the current fixed-version preflight.',
    )
  }
  return { receipt, preflight }
}
