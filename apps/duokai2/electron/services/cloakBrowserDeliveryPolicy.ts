import path from 'node:path'

import type {
  CloakBrowserBinaryDescriptor,
  CloakBrowserRuntimeIdentity,
} from './cloakBrowserIdentity.ts'
import { validateCloakRuntimeIdentity } from './cloakBrowserIdentity.ts'

export const CLOAK_DELIVERY_MANIFEST_VERSION = 1

export type CloakDeliveryErrorCode =
  | 'invalid_delivery_manifest'
  | 'binary_missing'
  | 'binary_identity_mismatch'
  | 'unsafe_cache_location'
  | 'unsupported_delivery_mode'

export class CloakDeliveryError extends Error {
  readonly code: CloakDeliveryErrorCode

  constructor(code: CloakDeliveryErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakDeliveryError'
    this.code = code
  }
}

export interface CloakBrowserDeliveryManifest {
  schemaVersion: number
  engine: 'cloakbrowser'
  wrapperVersion: string
  browserPackageVersion: string
  runtimeChromiumVersion: string
  releaseChannel: 'stable'
  platform: string
  binarySha256: string
  cacheDir: string
  binaryPath: string
  deliveryMode: 'managed-cache-preinstalled'
  installTrigger: 'explicit-preflight'
  launchAutoDownload: false
  wrapperAutoUpdate: false
  browserAutoUpdate: false
  fallbackEngine: 'forbidden'
  verifiedAt: string
}

export interface CloakDeliveryEnvironment {
  appResourcesPath?: string
  appPath?: string
  temporaryDirectory?: string
}

export interface CloakDeliveryReadiness {
  ready: boolean
  status: 'ready' | 'blocked'
  reasonCode: CloakDeliveryErrorCode | ''
  reason: string
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

function assertSafeCacheLocation(
  cacheDir: string,
  environment: CloakDeliveryEnvironment,
): void {
  if (!path.isAbsolute(cacheDir)) {
    throw new CloakDeliveryError(
      'unsafe_cache_location',
      'Cloak browser cache directory must be absolute.',
    )
  }
  for (const protectedRoot of [
    environment.appResourcesPath,
    environment.appPath,
    environment.temporaryDirectory,
  ]) {
    if (protectedRoot && isPathInside(protectedRoot, cacheDir)) {
      throw new CloakDeliveryError(
        'unsafe_cache_location',
        `Cloak browser cache cannot be stored inside ${path.resolve(protectedRoot)}.`,
      )
    }
  }
}

function resolveManagedCacheDir(identity: CloakBrowserRuntimeIdentity): string {
  const packageDirectoryName = `chromium-${identity.installedChromiumVersion}`
  let current = path.dirname(path.resolve(identity.binaryPath))
  while (true) {
    if (path.basename(current) === packageDirectoryName) {
      return path.dirname(current)
    }
    const parent = path.dirname(current)
    if (parent === current) {
      throw new CloakDeliveryError(
        'unsafe_cache_location',
        `Unable to locate ${packageDirectoryName} above the Cloak browser binary.`,
      )
    }
    current = parent
  }
}

export function buildCloakBrowserDeliveryManifest(
  identity: CloakBrowserRuntimeIdentity,
  environment: CloakDeliveryEnvironment = {},
): CloakBrowserDeliveryManifest {
  validateCloakRuntimeIdentity(identity)
  const cacheDir = resolveManagedCacheDir(identity)
  assertSafeCacheLocation(cacheDir, environment)
  return {
    schemaVersion: CLOAK_DELIVERY_MANIFEST_VERSION,
    engine: 'cloakbrowser',
    wrapperVersion: identity.cloakWrapperVersion,
    browserPackageVersion: identity.installedChromiumVersion,
    runtimeChromiumVersion: identity.runtimeChromiumVersion,
    releaseChannel: 'stable',
    platform: identity.platform,
    binarySha256: identity.binarySha256,
    cacheDir,
    binaryPath: identity.binaryPath,
    deliveryMode: 'managed-cache-preinstalled',
    installTrigger: 'explicit-preflight',
    launchAutoDownload: false,
    wrapperAutoUpdate: false,
    browserAutoUpdate: false,
    fallbackEngine: 'forbidden',
    verifiedAt: identity.verifiedAt,
  }
}

export function validateCloakBrowserDeliveryManifest(
  manifest: CloakBrowserDeliveryManifest,
  identity: CloakBrowserRuntimeIdentity,
  descriptor: CloakBrowserBinaryDescriptor,
  environment: CloakDeliveryEnvironment = {},
): void {
  if (
    manifest.schemaVersion !== CLOAK_DELIVERY_MANIFEST_VERSION ||
    manifest.engine !== 'cloakbrowser' ||
    manifest.deliveryMode !== 'managed-cache-preinstalled' ||
    manifest.installTrigger !== 'explicit-preflight' ||
    manifest.launchAutoDownload !== false ||
    manifest.wrapperAutoUpdate !== false ||
    manifest.browserAutoUpdate !== false ||
    manifest.fallbackEngine !== 'forbidden' ||
    !Number.isFinite(Date.parse(manifest.verifiedAt))
  ) {
    throw new CloakDeliveryError(
      'invalid_delivery_manifest',
      'Cloak browser delivery manifest does not satisfy the production fail-closed policy.',
    )
  }
  assertSafeCacheLocation(manifest.cacheDir, environment)
  validateCloakRuntimeIdentity(identity)
  if (!descriptor.installed || !trim(descriptor.binaryPath) || !trim(descriptor.cacheDir)) {
    throw new CloakDeliveryError(
      'binary_missing',
      `Cloak Chromium ${descriptor.version} is not preinstalled in a managed cache.`,
    )
  }
  const mismatches = [
    ['wrapperVersion', manifest.wrapperVersion, identity.cloakWrapperVersion],
    ['browserPackageVersion', manifest.browserPackageVersion, identity.installedChromiumVersion],
    ['runtimeChromiumVersion', manifest.runtimeChromiumVersion, identity.runtimeChromiumVersion],
    ['releaseChannel', manifest.releaseChannel, identity.releaseChannel],
    ['platform', manifest.platform, identity.platform],
    ['binarySha256', manifest.binarySha256, identity.binarySha256],
    ['binaryPath', path.resolve(manifest.binaryPath), path.resolve(identity.binaryPath)],
    ['descriptorVersion', manifest.browserPackageVersion, descriptor.version],
    ['descriptorCacheDir', path.resolve(manifest.cacheDir), path.resolve(descriptor.cacheDir)],
    ['descriptorBinaryPath', path.resolve(manifest.binaryPath), path.resolve(descriptor.binaryPath)],
  ].find(([, expected, actual]) => expected !== actual)
  if (mismatches) {
    throw new CloakDeliveryError(
      'binary_identity_mismatch',
      `Cloak delivery identity mismatch at ${mismatches[0]}: expected ${mismatches[1]}, received ${mismatches[2]}.`,
    )
  }
  if (!isPathInside(manifest.cacheDir, manifest.binaryPath)) {
    throw new CloakDeliveryError(
      'unsafe_cache_location',
      'Cloak browser binary must be located inside the managed cache directory.',
    )
  }
}

export function evaluateCloakBrowserDeliveryReadiness(
  manifest: CloakBrowserDeliveryManifest,
  identity: CloakBrowserRuntimeIdentity,
  descriptor: CloakBrowserBinaryDescriptor,
  environment: CloakDeliveryEnvironment = {},
): CloakDeliveryReadiness {
  try {
    validateCloakBrowserDeliveryManifest(manifest, identity, descriptor, environment)
    return {
      ready: true,
      status: 'ready',
      reasonCode: '',
      reason: '',
    }
  } catch (error) {
    return {
      ready: false,
      status: 'blocked',
      reasonCode:
        error instanceof CloakDeliveryError
          ? error.code
          : 'invalid_delivery_manifest',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
