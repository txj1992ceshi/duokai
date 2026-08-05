import os from 'node:os'
import path from 'node:path'

import type { CloakBrowserBinaryDescriptor } from './cloakBrowserIdentity.ts'
import { CLOAK_BROWSER_VERSION } from '../../src/shared/cloakBrowserVersion.ts'
import {
  assertCloakBinaryReady,
  computeBinarySha256,
  readChromiumExecutableVersion,
  type BinaryVersionCommandRunner,
} from './cloakBrowserIdentity.ts'
import {
  CLOAK_RELEASE_CHANNEL,
  CLOAK_WRAPPER_VERSION,
  loadCloakBrowserModule,
  type CloakBrowserModuleLike,
} from './cloakBrowserRuntime.ts'

export const CLOAK_PILOT_BROWSER_VERSION = CLOAK_BROWSER_VERSION
export const CLOAK_PILOT_BINARY_SHA256_BY_HOST = {
  'darwin-arm64': '79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79',
  'win32-x64': 'bf558d54d929dc7719e9a20463500f77ad18f09ba446949acfdf5766034a526f',
} as const
export const CLOAK_INSTALL_PREFLIGHT_VERSION = 1

export type CloakInstallPreflightErrorCode =
  | 'invalid_configuration'
  | 'wrapper_identity_mismatch'
  | 'binary_missing'
  | 'binary_version_mismatch'
  | 'binary_hash_mismatch'
  | 'unsafe_cache_location'

export class CloakInstallPreflightError extends Error {
  readonly code: CloakInstallPreflightErrorCode

  constructor(code: CloakInstallPreflightErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakInstallPreflightError'
    this.code = code
  }
}

export function resolveCloakPilotBinarySha256(
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
): string {
  const hostKey = `${platform}-${architecture}`
  const sha256 = (CLOAK_PILOT_BINARY_SHA256_BY_HOST as Record<string, string>)[hostKey]
  if (!sha256) {
    throw new CloakInstallPreflightError(
      'invalid_configuration',
      `Cloak Pilot has no verified binary SHA256 for host ${hostKey}.`,
    )
  }
  return sha256
}

export const CLOAK_PILOT_BINARY_SHA256 = resolveCloakPilotBinarySha256()

export interface CloakInstallPreflightEnvironment {
  appPath?: string
  resourcesPath?: string
  temporaryDirectory?: string
}

export interface CloakInstallPreflightRequest {
  cacheDir: string
  expectedBinarySha256: string
  browserVersion?: string
  environment?: CloakInstallPreflightEnvironment
}

export interface CloakInstallPreflightReceipt {
  schemaVersion: number
  engine: 'cloakbrowser'
  wrapperVersion: string
  browserVersion: string
  executableChromiumVersion: string
  releaseChannel: 'stable'
  platform: string
  tier: 'free' | 'pro'
  cacheDir: string
  binaryPath: string
  binarySha256: string
  launchAutoDownload: false
  fallbackEngine: 'forbidden'
  verifiedAt: string
}

export interface CloakInstallPreflightDependencies {
  loadModule?: () => Promise<CloakBrowserModuleLike>
  assertBinaryReady?: (descriptor: CloakBrowserBinaryDescriptor) => Promise<void>
  runBinaryVersionCommand?: BinaryVersionCommandRunner
  hashBinary?: (binaryPath: string) => Promise<string>
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

function assertSafeCache(
  cacheDir: string,
  environment: CloakInstallPreflightEnvironment,
): void {
  if (!path.isAbsolute(cacheDir)) {
    throw new CloakInstallPreflightError(
      'unsafe_cache_location',
      'Cloak Pilot cache directory must be absolute.',
    )
  }
  for (const protectedRoot of [
    environment.appPath,
    environment.resourcesPath,
    environment.temporaryDirectory ?? os.tmpdir(),
  ]) {
    if (protectedRoot && isPathInside(protectedRoot, cacheDir)) {
      throw new CloakInstallPreflightError(
        'unsafe_cache_location',
        `Cloak Pilot cache directory cannot be inside ${path.resolve(protectedRoot)}.`,
      )
    }
  }
}

function assertDescriptor(
  descriptor: CloakBrowserBinaryDescriptor,
  browserVersion: string,
  cacheDir: string,
): void {
  if (
    descriptor.version !== browserVersion ||
    !trim(descriptor.bundledVersion) ||
    !trim(descriptor.platform) ||
    !['free', 'pro'].includes(descriptor.tier)
  ) {
    throw new CloakInstallPreflightError(
      'wrapper_identity_mismatch',
      'Cloak wrapper binary descriptor does not match the fixed Pilot identity.',
    )
  }
  const cacheRoot = path.resolve(cacheDir)
  const descriptorCacheDir = path.resolve(descriptor.cacheDir)
  const expectedBinaryDirectoryName =
    `chromium-${browserVersion}${descriptor.tier === 'pro' ? '-pro' : ''}`
  if (
    path.dirname(descriptorCacheDir) !== cacheRoot ||
    path.basename(descriptorCacheDir) !== expectedBinaryDirectoryName
  ) {
    throw new CloakInstallPreflightError(
      'wrapper_identity_mismatch',
      `Cloak wrapper cache mismatch: expected version directory ${path.join(cacheRoot, expectedBinaryDirectoryName)}, received ${descriptorCacheDir}.`,
    )
  }
  if (!isPathInside(descriptorCacheDir, descriptor.binaryPath)) {
    throw new CloakInstallPreflightError(
      'unsafe_cache_location',
      'Cloak Chromium binary must be located inside the managed cache directory.',
    )
  }
}

function assertSha256(value: string): string {
  const normalized = trim(value).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new CloakInstallPreflightError(
      'invalid_configuration',
      'DUOKAI_CLOAK_PILOT_BINARY_SHA256 must be an exact SHA256 hex digest.',
    )
  }
  return normalized
}

export async function runCloakInstallPreflight(
  request: CloakInstallPreflightRequest,
  dependencies: CloakInstallPreflightDependencies = {},
): Promise<CloakInstallPreflightReceipt> {
  const browserVersion = trim(request.browserVersion || CLOAK_PILOT_BROWSER_VERSION)
  const cacheDir = path.resolve(trim(request.cacheDir))
  if (!trim(request.cacheDir) || browserVersion !== CLOAK_PILOT_BROWSER_VERSION) {
    throw new CloakInstallPreflightError(
      'invalid_configuration',
      `Cloak Pilot requires cacheDir and fixed browser version ${CLOAK_PILOT_BROWSER_VERSION}.`,
    )
  }
  const expectedSha256 = assertSha256(request.expectedBinarySha256)
  assertSafeCache(cacheDir, request.environment ?? {})

  try {
    process.env.CLOAKBROWSER_AUTO_UPDATE = 'false'
    process.env.CLOAKBROWSER_VERSION = browserVersion
    process.env.CLOAKBROWSER_RELEASE_CHANNEL = CLOAK_RELEASE_CHANNEL
    process.env.CLOAKBROWSER_CACHE_DIR = cacheDir
    const cloakBrowser = await (dependencies.loadModule ?? loadCloakBrowserModule)()
    const descriptor = cloakBrowser.binaryInfo(browserVersion, CLOAK_RELEASE_CHANNEL)
    assertDescriptor(descriptor, browserVersion, cacheDir)
    await (dependencies.assertBinaryReady ?? assertCloakBinaryReady)(descriptor)
    const executable = await readChromiumExecutableVersion(
      descriptor.binaryPath,
      dependencies.runBinaryVersionCommand,
    )
    if (executable.runtimeBaseVersion !== browserVersion.split('.').slice(0, 4).join('.')) {
      throw new CloakInstallPreflightError(
        'binary_version_mismatch',
        `Cloak Chromium executable version ${executable.fullVersion} does not match ${browserVersion}.`,
      )
    }
    const binarySha256 = await (dependencies.hashBinary ?? computeBinarySha256)(descriptor.binaryPath)
    if (binarySha256.toLowerCase() !== expectedSha256) {
      throw new CloakInstallPreflightError(
        'binary_hash_mismatch',
        `Cloak Chromium SHA256 mismatch at ${descriptor.binaryPath}.`,
      )
    }
    return {
      schemaVersion: CLOAK_INSTALL_PREFLIGHT_VERSION,
      engine: 'cloakbrowser',
      wrapperVersion: CLOAK_WRAPPER_VERSION,
      browserVersion,
      executableChromiumVersion: executable.fullVersion,
      releaseChannel: CLOAK_RELEASE_CHANNEL,
      platform: descriptor.platform,
      tier: descriptor.tier,
      cacheDir,
      binaryPath: path.resolve(descriptor.binaryPath),
      binarySha256,
      launchAutoDownload: false,
      fallbackEngine: 'forbidden',
      verifiedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    }
  } catch (error) {
    if (error instanceof CloakInstallPreflightError) {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    const code = /not installed|not executable/i.test(message) ? 'binary_missing' : 'wrapper_identity_mismatch'
    throw new CloakInstallPreflightError(code, `Cloak install preflight failed: ${message}`, error)
  }
}
