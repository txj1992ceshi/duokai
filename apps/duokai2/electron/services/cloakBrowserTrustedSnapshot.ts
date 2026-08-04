import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  validateCloakRuntimeIdentity,
  type CloakBrowserRuntimeIdentity,
} from './cloakBrowserIdentity.ts'
import {
  CLOAK_FINGERPRINT_MAPPING_VERSION,
  type CloakFingerprintMapping,
} from './cloakBrowserFingerprint.ts'
import {
  CLOAK_NETWORK_MAPPING_VERSION,
  type CloakNetworkMapping,
} from './cloakBrowserNetwork.ts'
import {
  validateCloakPilotCompatibilityReceipt,
  type CloakPilotCompatibilityReceipt,
} from './cloakBrowserPilotConfig.ts'

export const CLOAK_TRUSTED_IDENTITY_SNAPSHOT_VERSION = 1
export const DEFAULT_CLOAK_TRUSTED_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1_000

export type CloakTrustedSnapshotErrorCode =
  | 'invalid_snapshot'
  | 'snapshot_hash_mismatch'
  | 'runtime_identity_mismatch'
  | 'fingerprint_mapping_mismatch'
  | 'network_mapping_mismatch'
  | 'cross_identity_mismatch'
  | 'incomplete_verification_evidence'
  | 'unsafe_snapshot_content'
  | 'snapshot_io_failed'

export class CloakTrustedSnapshotError extends Error {
  readonly code: CloakTrustedSnapshotErrorCode

  constructor(code: CloakTrustedSnapshotErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakTrustedSnapshotError'
    this.code = code
  }
}

export type CloakWebRtcCandidateObservation =
  | 'verified-ip-observed'
  | 'no-candidates'
  | 'disabled'
  | 'not-required'

export interface CloakTrustedLaunchEvidence {
  runtimeIdentityPassed: boolean
  persistentContextPassed: boolean
  startupNavigationPassed: boolean
  networkRoutePassed: boolean
  credentialRedactionPassed: boolean
  localeTimezonePassed: boolean
  geolocationPassed: boolean
  webRtcHostLeakAbsent: boolean
  verifiedWebRtcIpObserved: boolean
  webRtcCandidateObservation: CloakWebRtcCandidateObservation
  legacyInjectionAbsent: boolean
}

export interface CloakTrustedSnapshotPolicy {
  engineFallback: 'forbidden'
  wrapperAutoUpdate: 'disabled'
  browserAutoUpdate: 'disabled'
  wrapperGeoIpResolution: 'disabled'
  legacyInitScript: 'forbidden'
  upstreamCredentialExposure: 'forbidden'
}

export type CloakTrustedNetworkMapping = Omit<CloakNetworkMapping, 'launchProxy'> & {
  transportClass: 'direct' | 'loopback-http-bridge'
}

export interface CloakTrustedIdentitySnapshot {
  schemaVersion: number
  snapshotId: string
  profileId: string
  verificationLevel: 'full'
  status: 'trusted'
  createdAt: string
  desktopAppVersion: string
  hostEnvironment: string
  runtimeIdentity: CloakBrowserRuntimeIdentity
  fingerprintMapping: CloakFingerprintMapping
  networkMapping: CloakTrustedNetworkMapping
  policy: CloakTrustedSnapshotPolicy
  evidence: CloakTrustedLaunchEvidence
  pilotCompatibility?: CloakPilotCompatibilityReceipt
  compatibilityWarnings: string[]
  snapshotHash: string
}

export interface BuildCloakTrustedIdentitySnapshotInput {
  profileId: string
  desktopAppVersion: string
  hostEnvironment: string
  runtimeIdentity: CloakBrowserRuntimeIdentity
  fingerprintMapping: CloakFingerprintMapping
  networkMapping: CloakNetworkMapping
  evidence: CloakTrustedLaunchEvidence
  pilotCompatibility?: CloakPilotCompatibilityReceipt
  snapshotId?: string
  now?: Date
}

export interface CloakTrustedSnapshotReuseContext {
  profileId: string
  desktopAppVersion: string
  hostEnvironment: string
  runtimeIdentity: CloakBrowserRuntimeIdentity
  fingerprintMapping: CloakFingerprintMapping
  networkMapping: CloakNetworkMapping
  now?: Date
  maxSnapshotAgeMs?: number
}

export interface CloakTrustedSnapshotReuseDecision {
  usable: boolean
  status: 'trusted' | 'stale' | 'invalid'
  reason: string
}

const SNAPSHOT_POLICY: CloakTrustedSnapshotPolicy = {
  engineFallback: 'forbidden',
  wrapperAutoUpdate: 'disabled',
  browserAutoUpdate: 'disabled',
  wrapperGeoIpResolution: 'disabled',
  legacyInitScript: 'forbidden',
  upstreamCredentialExposure: 'forbidden',
}

const NETWORK_ARGUMENT_KEYS = new Set([
  '--fingerprint-webrtc-ip',
  '--disable-webrtc',
  '--force-webrtc-ip-handling-policy',
  '--webrtc-ip-handling-policy',
])

function trim(value: unknown): string {
  return String(value ?? '').trim()
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function assertSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new CloakTrustedSnapshotError(
      'invalid_snapshot',
      `${label} must be a SHA256 hex digest.`,
    )
  }
}

function runtimeBaseVersion(version: string): string {
  return trim(version).split('.').slice(0, 4).join('.')
}

function withoutKeys<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  const result = { ...value }
  for (const key of keys) Reflect.deleteProperty(result, key)
  return result
}

function fingerprintHash(mapping: CloakFingerprintMapping): string {
  return hashJson(withoutKeys(mapping, ['mappingHash'] as const))
}

function networkHash(
  mapping: CloakNetworkMapping | CloakTrustedNetworkMapping,
): string {
  const source = mapping as CloakNetworkMapping & {
    transportClass?: CloakTrustedNetworkMapping['transportClass']
  }
  return hashJson(
    withoutKeys(source, ['mappingHash', 'launchProxy', 'transportClass'] as const),
  )
}

function validateFingerprintMapping(mapping: CloakFingerprintMapping): void {
  if (mapping.schemaVersion !== CLOAK_FINGERPRINT_MAPPING_VERSION) {
    throw new CloakTrustedSnapshotError(
      'fingerprint_mapping_mismatch',
      `Unsupported Cloak fingerprint mapping schema ${mapping.schemaVersion}.`,
    )
  }
  assertSha256(mapping.mappingHash, 'fingerprintMapping.mappingHash')
  if (fingerprintHash(mapping) !== mapping.mappingHash) {
    throw new CloakTrustedSnapshotError(
      'fingerprint_mapping_mismatch',
      'Cloak fingerprint mapping hash does not match its payload.',
    )
  }
  if (mapping.legacyInitScriptPolicy !== 'forbidden') {
    throw new CloakTrustedSnapshotError(
      'fingerprint_mapping_mismatch',
      'A trusted Cloak fingerprint mapping must forbid the legacy init script.',
    )
  }
}

function validateNetworkMapping(
  mapping: CloakNetworkMapping | CloakTrustedNetworkMapping,
): void {
  if (mapping.schemaVersion !== CLOAK_NETWORK_MAPPING_VERSION) {
    throw new CloakTrustedSnapshotError(
      'network_mapping_mismatch',
      `Unsupported Cloak network mapping schema ${mapping.schemaVersion}.`,
    )
  }
  assertSha256(mapping.mappingHash, 'networkMapping.mappingHash')
  if (networkHash(mapping) !== mapping.mappingHash) {
    throw new CloakTrustedSnapshotError(
      'network_mapping_mismatch',
      'Cloak network mapping hash does not match its credential-free payload.',
    )
  }
  if (mapping.proxyRequired && mapping.proxyMode === 'direct') {
    throw new CloakTrustedSnapshotError(
      'network_mapping_mismatch',
      'A proxy-required network identity cannot use direct proxy mode.',
    )
  }
  if (!mapping.proxyRequired && mapping.proxyMode !== 'direct') {
    throw new CloakTrustedSnapshotError(
      'network_mapping_mismatch',
      'A direct network identity cannot declare a proxy mode.',
    )
  }
}

function mappedNetworkArgs(mapping: CloakFingerprintMapping): string[] {
  return mapping.mappedFingerprintArgs.filter((argument) =>
    NETWORK_ARGUMENT_KEYS.has(argument.split('=')[0] || argument),
  )
}

function sameArguments(left: string[], right: string[]): boolean {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort())
}

function geolocationMatches(
  fingerprint: CloakFingerprintMapping['geolocation'],
  network: CloakTrustedNetworkMapping['geolocation'],
): boolean {
  if (!fingerprint && !network) {
    return true
  }
  if (!fingerprint || !network) {
    return false
  }
  return (
    Math.abs(fingerprint.latitude - network.latitude) < 0.000001 &&
    Math.abs(fingerprint.longitude - network.longitude) < 0.000001
  )
}

function validateCrossIdentity(
  profileId: string,
  runtimeIdentity: CloakBrowserRuntimeIdentity,
  fingerprintMapping: CloakFingerprintMapping,
  networkMapping: CloakNetworkMapping | CloakTrustedNetworkMapping,
): void {
  if (
    profileId !== fingerprintMapping.profileId ||
    profileId !== networkMapping.profileId
  ) {
    throw new CloakTrustedSnapshotError(
      'cross_identity_mismatch',
      'Trusted snapshot profileId must match both mapping profile IDs.',
    )
  }
  if (
    runtimeIdentity.chromiumMajor !== fingerprintMapping.chromiumMajor ||
    runtimeBaseVersion(runtimeIdentity.runtimeChromiumVersion) !== fingerprintMapping.chromiumVersion
  ) {
    throw new CloakTrustedSnapshotError(
      'cross_identity_mismatch',
      'Cloak runtime Chromium identity does not match the fingerprint mapping.',
    )
  }
  if (
    fingerprintMapping.locale !== networkMapping.egress.language ||
    fingerprintMapping.timezone !== networkMapping.egress.timezone
  ) {
    throw new CloakTrustedSnapshotError(
      'cross_identity_mismatch',
      'Fingerprint locale/timezone does not match the verified network identity.',
    )
  }
  if (!geolocationMatches(fingerprintMapping.geolocation, networkMapping.geolocation)) {
    throw new CloakTrustedSnapshotError(
      'cross_identity_mismatch',
      'Fingerprint geolocation does not match the verified network identity.',
    )
  }
  if (!sameArguments(mappedNetworkArgs(fingerprintMapping), networkMapping.mappedNetworkArgs)) {
    throw new CloakTrustedSnapshotError(
      'cross_identity_mismatch',
      'Fingerprint and network mappings do not declare the same WebRTC policy.',
    )
  }
}

function validateEvidence(
  mapping: CloakNetworkMapping | CloakTrustedNetworkMapping,
  evidence: CloakTrustedLaunchEvidence,
): void {
  const required = [
    ['runtimeIdentityPassed', evidence.runtimeIdentityPassed],
    ['persistentContextPassed', evidence.persistentContextPassed],
    ['startupNavigationPassed', evidence.startupNavigationPassed],
    ['networkRoutePassed', evidence.networkRoutePassed],
    ['credentialRedactionPassed', evidence.credentialRedactionPassed],
    ['localeTimezonePassed', evidence.localeTimezonePassed],
    ['geolocationPassed', evidence.geolocationPassed],
    ['webRtcHostLeakAbsent', evidence.webRtcHostLeakAbsent],
    ['legacyInjectionAbsent', evidence.legacyInjectionAbsent],
  ].filter(([, passed]) => !passed)
  if (required.length > 0) {
    throw new CloakTrustedSnapshotError(
      'incomplete_verification_evidence',
      `Trusted Cloak evidence is incomplete: ${required.map(([name]) => name).join(', ')}.`,
    )
  }

  if (mapping.webrtcMode === 'disabled') {
    if (evidence.webRtcCandidateObservation !== 'disabled' || evidence.verifiedWebRtcIpObserved) {
      throw new CloakTrustedSnapshotError(
        'incomplete_verification_evidence',
        'Disabled WebRTC must be recorded with the disabled candidate observation.',
      )
    }
    return
  }

  if (evidence.verifiedWebRtcIpObserved) {
    if (
      evidence.webRtcCandidateObservation !== 'verified-ip-observed' ||
      !mapping.verifiedWebRtcIp
    ) {
      throw new CloakTrustedSnapshotError(
        'incomplete_verification_evidence',
        'Observed WebRTC substitution requires a verified IP and matching observation state.',
      )
    }
    return
  }

  if (!['no-candidates', 'not-required'].includes(evidence.webRtcCandidateObservation)) {
    throw new CloakTrustedSnapshotError(
      'incomplete_verification_evidence',
      'Unobserved WebRTC substitution must explicitly record no-candidates or not-required.',
    )
  }
  if (mapping.proxyRequired && evidence.webRtcCandidateObservation === 'not-required') {
    throw new CloakTrustedSnapshotError(
      'incomplete_verification_evidence',
      'A proxy-bound WebRTC identity cannot mark candidate verification as not-required.',
    )
  }
}

function validateSnapshotPolicy(policy: CloakTrustedSnapshotPolicy): void {
  if (JSON.stringify(policy) !== JSON.stringify(SNAPSHOT_POLICY)) {
    throw new CloakTrustedSnapshotError(
      'unsafe_snapshot_content',
      'Trusted Cloak snapshot policy is missing one or more fail-closed protections.',
    )
  }
}

function snapshotPayload(
  snapshot: CloakTrustedIdentitySnapshot,
): Omit<CloakTrustedIdentitySnapshot, 'snapshotHash'> {
  return withoutKeys(snapshot, ['snapshotHash'] as const)
}

function snapshotHash(snapshot: CloakTrustedIdentitySnapshot): string {
  return hashJson(snapshotPayload(snapshot))
}

function buildWarnings(
  fingerprintMapping: CloakFingerprintMapping,
  networkMapping: CloakNetworkMapping,
  evidence: CloakTrustedLaunchEvidence,
): string[] {
  const warnings = new Set([
    ...fingerprintMapping.compatibilityWarnings,
    ...networkMapping.compatibilityWarnings,
  ])
  if (
    !evidence.verifiedWebRtcIpObserved &&
    evidence.webRtcCandidateObservation === 'no-candidates'
  ) {
    warnings.add(
      'No ICE candidates were produced, so host-address non-leakage was verified but page-level replacement with the verified WebRTC IP was not directly observed.',
    )
  }
  return [...warnings]
}

export function validateCloakTrustedIdentitySnapshot(
  snapshot: CloakTrustedIdentitySnapshot,
): void {
  if (
    snapshot.schemaVersion !== CLOAK_TRUSTED_IDENTITY_SNAPSHOT_VERSION ||
    snapshot.verificationLevel !== 'full' ||
    snapshot.status !== 'trusted' ||
    !trim(snapshot.snapshotId) ||
    !trim(snapshot.profileId) ||
    !trim(snapshot.desktopAppVersion) ||
    !trim(snapshot.hostEnvironment) ||
    !Number.isFinite(Date.parse(snapshot.createdAt))
  ) {
    throw new CloakTrustedSnapshotError(
      'invalid_snapshot',
      'Trusted Cloak identity snapshot metadata is invalid.',
    )
  }
  assertSha256(snapshot.snapshotHash, 'snapshotHash')
  if (snapshotHash(snapshot) !== snapshot.snapshotHash) {
    throw new CloakTrustedSnapshotError(
      'snapshot_hash_mismatch',
      'Trusted Cloak identity snapshot hash does not match its payload.',
    )
  }
  try {
    validateCloakRuntimeIdentity(snapshot.runtimeIdentity)
  } catch (error) {
    throw new CloakTrustedSnapshotError(
      'runtime_identity_mismatch',
      error instanceof Error ? error.message : 'Cloak runtime identity is invalid.',
      error,
    )
  }
  validateFingerprintMapping(snapshot.fingerprintMapping)
  validateNetworkMapping(snapshot.networkMapping)
  validateCrossIdentity(
    snapshot.profileId,
    snapshot.runtimeIdentity,
    snapshot.fingerprintMapping,
    snapshot.networkMapping,
  )
  validateSnapshotPolicy(snapshot.policy)
  validateEvidence(snapshot.networkMapping, snapshot.evidence)
  if (snapshot.pilotCompatibility) {
    try {
      validateCloakPilotCompatibilityReceipt(snapshot.pilotCompatibility)
    } catch (error) {
      throw new CloakTrustedSnapshotError(
        'invalid_snapshot',
        error instanceof Error ? error.message : 'Cloak Pilot compatibility receipt is invalid.',
        error,
      )
    }
    if (snapshot.pilotCompatibility.profileId !== snapshot.profileId) {
      throw new CloakTrustedSnapshotError(
        'cross_identity_mismatch',
        'Cloak Pilot compatibility receipt belongs to a different Profile ID.',
      )
    }
    if (
      snapshot.pilotCompatibility.effectiveChromiumMajor !==
      snapshot.runtimeIdentity.chromiumMajor
    ) {
      throw new CloakTrustedSnapshotError(
        'cross_identity_mismatch',
        'Cloak Pilot compatibility receipt does not match the running Chromium major.',
      )
    }
  }
}

export function buildCloakTrustedIdentitySnapshot(
  input: BuildCloakTrustedIdentitySnapshotInput,
): CloakTrustedIdentitySnapshot {
  const profileId = trim(input.profileId)
  const desktopAppVersion = trim(input.desktopAppVersion)
  const hostEnvironment = trim(input.hostEnvironment)
  if (!profileId || !desktopAppVersion || !hostEnvironment) {
    throw new CloakTrustedSnapshotError(
      'invalid_snapshot',
      'profileId, desktopAppVersion and hostEnvironment are required.',
    )
  }
  try {
    validateCloakRuntimeIdentity(input.runtimeIdentity)
  } catch (error) {
    throw new CloakTrustedSnapshotError(
      'runtime_identity_mismatch',
      error instanceof Error ? error.message : 'Cloak runtime identity is invalid.',
      error,
    )
  }
  validateFingerprintMapping(input.fingerprintMapping)
  validateNetworkMapping(input.networkMapping)
  validateCrossIdentity(
    profileId,
    input.runtimeIdentity,
    input.fingerprintMapping,
    input.networkMapping,
  )
  validateEvidence(input.networkMapping, input.evidence)

  const { launchProxy, ...stableNetworkMapping } = input.networkMapping
  const withoutHash: Omit<CloakTrustedIdentitySnapshot, 'snapshotHash'> = {
    schemaVersion: CLOAK_TRUSTED_IDENTITY_SNAPSHOT_VERSION,
    snapshotId: trim(input.snapshotId) || randomUUID(),
    profileId,
    verificationLevel: 'full',
    status: 'trusted',
    createdAt: (input.now ?? new Date()).toISOString(),
    desktopAppVersion,
    hostEnvironment,
    runtimeIdentity: { ...input.runtimeIdentity },
    fingerprintMapping: structuredClone(input.fingerprintMapping),
    networkMapping: {
      ...structuredClone(stableNetworkMapping),
      transportClass: launchProxy ? 'loopback-http-bridge' : 'direct',
    },
    policy: { ...SNAPSHOT_POLICY },
    evidence: { ...input.evidence },
    ...(input.pilotCompatibility
      ? { pilotCompatibility: structuredClone(input.pilotCompatibility) }
      : {}),
    compatibilityWarnings: buildWarnings(
      input.fingerprintMapping,
      input.networkMapping,
      input.evidence,
    ),
  }
  const snapshot: CloakTrustedIdentitySnapshot = {
    ...withoutHash,
    snapshotHash: hashJson(withoutHash),
  }
  validateCloakTrustedIdentitySnapshot(snapshot)
  return snapshot
}

export function evaluateCloakTrustedIdentitySnapshotReuse(
  snapshot: CloakTrustedIdentitySnapshot | null,
  context: CloakTrustedSnapshotReuseContext,
): CloakTrustedSnapshotReuseDecision {
  if (!snapshot) {
    return { usable: false, status: 'stale', reason: 'Trusted Cloak identity snapshot is missing.' }
  }
  if (snapshot.fingerprintMapping.schemaVersion !== CLOAK_FINGERPRINT_MAPPING_VERSION) {
    return {
      usable: false,
      status: 'stale',
      reason: `Trusted Cloak fingerprint mapping schema ${snapshot.fingerprintMapping.schemaVersion} must be rebuilt as schema ${CLOAK_FINGERPRINT_MAPPING_VERSION}.`,
    }
  }
  try {
    validateCloakTrustedIdentitySnapshot(snapshot)
  } catch (error) {
    return {
      usable: false,
      status: 'invalid',
      reason: error instanceof Error ? error.message : 'Trusted Cloak identity snapshot is invalid.',
    }
  }

  try {
    validateCloakRuntimeIdentity(context.runtimeIdentity)
    validateFingerprintMapping(context.fingerprintMapping)
    validateNetworkMapping(context.networkMapping)
    validateCrossIdentity(
      context.profileId,
      context.runtimeIdentity,
      context.fingerprintMapping,
      context.networkMapping,
    )
  } catch (error) {
    return {
      usable: false,
      status: 'invalid',
      reason: error instanceof Error ? error.message : 'Current Cloak identity is invalid.',
    }
  }

  if (snapshot.profileId !== context.profileId) {
    return { usable: false, status: 'invalid', reason: 'Trusted Cloak profile identity changed.' }
  }
  if (snapshot.hostEnvironment !== trim(context.hostEnvironment)) {
    return { usable: false, status: 'invalid', reason: 'Desktop host environment changed.' }
  }
  if (snapshot.desktopAppVersion !== trim(context.desktopAppVersion)) {
    return { usable: false, status: 'stale', reason: 'Desktop application version changed.' }
  }

  const runtimeFields: Array<keyof CloakBrowserRuntimeIdentity> = [
    'engine',
    'cloakWrapperVersion',
    'requestedChromiumVersion',
    'installedChromiumVersion',
    'executableChromiumVersion',
    'runtimeChromiumVersion',
    'chromiumMajor',
    'binaryPath',
    'binarySha256',
    'tier',
    'releaseChannel',
    'platform',
  ]
  const runtimeDrift = runtimeFields.find(
    (field) => snapshot.runtimeIdentity[field] !== context.runtimeIdentity[field],
  )
  if (runtimeDrift) {
    return {
      usable: false,
      status: 'invalid',
      reason: `Cloak runtime identity changed at ${runtimeDrift}.`,
    }
  }
  if (snapshot.fingerprintMapping.mappingHash !== context.fingerprintMapping.mappingHash) {
    return { usable: false, status: 'stale', reason: 'Cloak fingerprint mapping changed.' }
  }
  if (snapshot.networkMapping.mappingHash !== context.networkMapping.mappingHash) {
    return { usable: false, status: 'stale', reason: 'Cloak network mapping changed.' }
  }

  const maxAgeMs = context.maxSnapshotAgeMs ?? DEFAULT_CLOAK_TRUSTED_SNAPSHOT_MAX_AGE_MS
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return { usable: false, status: 'invalid', reason: 'Snapshot max age policy is invalid.' }
  }
  const ageMs = (context.now ?? new Date()).getTime() - Date.parse(snapshot.createdAt)
  if (ageMs < -30_000 || ageMs > maxAgeMs) {
    return { usable: false, status: 'stale', reason: 'Trusted Cloak identity snapshot is stale.' }
  }

  return { usable: true, status: 'trusted', reason: '' }
}

export async function writeCloakTrustedIdentitySnapshotAtomic(
  filePath: string,
  snapshot: CloakTrustedIdentitySnapshot,
): Promise<void> {
  validateCloakTrustedIdentitySnapshot(snapshot)
  const resolvedPath = path.resolve(filePath)
  const directory = path.dirname(resolvedPath)
  const temporaryPath = path.join(
    directory,
    `.${path.basename(resolvedPath)}.${process.pid}.${randomUUID()}.tmp`,
  )
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporaryPath, resolvedPath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw new CloakTrustedSnapshotError(
      'snapshot_io_failed',
      `Failed to atomically write trusted Cloak identity snapshot at ${resolvedPath}.`,
      error,
    )
  }
}

export async function readCloakTrustedIdentitySnapshot(
  filePath: string,
): Promise<CloakTrustedIdentitySnapshot> {
  try {
    const snapshot = JSON.parse(await readFile(filePath, 'utf8')) as CloakTrustedIdentitySnapshot
    validateCloakTrustedIdentitySnapshot(snapshot)
    return snapshot
  } catch (error) {
    if (error instanceof CloakTrustedSnapshotError) {
      throw error
    }
    throw new CloakTrustedSnapshotError(
      'snapshot_io_failed',
      `Failed to read trusted Cloak identity snapshot from ${path.resolve(filePath)}.`,
      error,
    )
  }
}
