import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'

import type {
  FingerprintConfig,
  ProfileProxySettings,
  ProxyRecord,
} from '../../src/shared/types.ts'
import {
  buildCloakFingerprintMapping,
  type CloakFingerprintMapping,
} from './cloakBrowserFingerprint.ts'
import type { CloakBrowserRuntimeIdentity } from './cloakBrowserIdentity.ts'
import {
  buildCloakNetworkMapping,
  type CloakNetworkMapping,
} from './cloakBrowserNetwork.ts'
import {
  buildCloakTrustedIdentitySnapshot,
  CloakTrustedSnapshotError,
  evaluateCloakTrustedIdentitySnapshotReuse,
  readCloakTrustedIdentitySnapshot,
  validateCloakTrustedIdentitySnapshot,
  writeCloakTrustedIdentitySnapshotAtomic,
  type BuildCloakTrustedIdentitySnapshotInput,
  type CloakTrustedLaunchEvidence,
  type CloakTrustedIdentitySnapshot,
} from './cloakBrowserTrustedSnapshot.ts'

const PROFILE_ID = 'phase4-profile-alpha'
const CLOAK_PACKAGE_VERSION = '145.0.7632.109.2'
const CLOAK_RUNTIME_VERSION = '145.0.7632.109'
const VERIFIED_EGRESS_IP = '203.0.113.25'
const SENTINEL_USERNAME = 'phase4-sentinel-user'
const SENTINEL_PASSWORD = 'phase4-sentinel-password'
const NOW = new Date('2026-07-27T00:00:00.000Z')

function buildFingerprintConfig(): FingerprintConfig {
  return {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    language: 'en-US',
    timezone: 'America/Los_Angeles',
    resolution: '1440x900',
    webrtcMode: 'proxy-aware',
    basicSettings: {} as FingerprintConfig['basicSettings'],
    proxySettings: {
      proxyMode: 'custom',
    } as FingerprintConfig['proxySettings'],
    commonSettings: {
      randomizeFingerprintOnLaunch: false,
    } as FingerprintConfig['commonSettings'],
    advanced: {
      browserKernel: 'chrome',
      browserKernelVersion: '145',
      deviceMode: 'desktop',
      operatingSystem: 'macOS',
      operatingSystemVersion: '15.5.0',
      browserVersion: '145',
      autoLanguageFromIp: true,
      autoInterfaceLanguageFromIp: true,
      interfaceLanguage: 'en-US',
      autoTimezoneFromIp: true,
      autoGeolocationFromIp: true,
      geolocationPermission: 'allow',
      geolocation: '',
      windowWidth: 1440,
      windowHeight: 900,
      fontMode: 'system',
      canvasMode: 'custom',
      webglImageMode: 'custom',
      webglMetadataMode: 'custom',
      webglVendor: 'Apple Inc.',
      webglRenderer: 'Apple M4 Pro',
      audioContextMode: 'custom',
      mediaDevicesMode: 'custom',
      speechVoicesMode: 'custom',
      doNotTrackEnabled: false,
      clientRectsMode: 'custom',
      deviceInfoMode: 'custom',
      deviceName: '',
      hostIp: '',
      macAddress: '',
      cpuCores: 8,
      memoryGb: 8,
    } as FingerprintConfig['advanced'],
    runtimeMetadata: {
      hardwareSeed: 'phase4-stable-hardware-seed',
      hardwareProfileId: 'phase4-hardware-profile',
    } as FingerprintConfig['runtimeMetadata'],
  }
}

function buildFingerprintMapping(
  mutate?: (config: FingerprintConfig) => void,
): CloakFingerprintMapping {
  const fingerprintConfig = buildFingerprintConfig()
  mutate?.(fingerprintConfig)
  return buildCloakFingerprintMapping({
    profileId: PROFILE_ID,
    fingerprintConfig,
    browserVersion: CLOAK_PACKAGE_VERSION,
    resolvedLocale: 'en-US',
    resolvedTimezone: 'America/Los_Angeles',
    resolvedGeolocation: {
      latitude: 34.0522,
      longitude: -118.2437,
      accuracy: 20,
    },
    verifiedWebRtcIp: VERIFIED_EGRESS_IP,
  })
}

function buildProxySettings(): ProfileProxySettings {
  return {
    proxyMode: 'custom',
    ipLookupChannel: 'ipwho.is',
    proxyType: 'http',
    ipProtocol: 'ipv4',
    host: 'phase4-upstream.invalid',
    port: 48080,
    username: SENTINEL_USERNAME,
    password: SENTINEL_PASSWORD,
    udpEnabled: false,
  }
}

function buildProxyRecord(): ProxyRecord {
  return {
    id: 'phase4-proxy-fixture',
    name: 'Phase 4 proxy fixture',
    type: 'http',
    host: 'phase4-upstream.invalid',
    port: 48080,
    username: SENTINEL_USERNAME,
    password: SENTINEL_PASSWORD,
    status: 'online',
    lastCheckedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  }
}

function buildNetworkMapping(
  webrtcMode: 'proxy-aware' | 'disabled' = 'proxy-aware',
  language = 'en-US',
): CloakNetworkMapping {
  return buildCloakNetworkMapping({
    profileId: PROFILE_ID,
    proxySettings: buildProxySettings(),
    webrtcMode,
    proxy: buildProxyRecord(),
    egress: {
      ok: true,
      source: 'proxy',
      ip: VERIFIED_EGRESS_IP,
      country: 'United States',
      region: 'California',
      city: 'Los Angeles',
      timezone: 'America/Los_Angeles',
      language,
      geolocation: '34.0522, -118.2437',
      egressPathType: 'direct',
      checkedAt: NOW.toISOString(),
    },
    transport: {
      config: {
        server: 'http://127.0.0.1:48081',
        bypass: '<-loopback>',
      },
      bridgeActive: true,
      egressPathType: 'direct',
      detail: 'Phase 4 loopback proxy fixture',
    },
    now: NOW,
  })
}

function buildRuntimeIdentity(): CloakBrowserRuntimeIdentity {
  return {
    engine: 'cloakbrowser',
    cloakWrapperVersion: '0.5.2',
    requestedChromiumVersion: CLOAK_PACKAGE_VERSION,
    installedChromiumVersion: CLOAK_PACKAGE_VERSION,
    executableChromiumVersion: CLOAK_RUNTIME_VERSION,
    runtimeChromiumVersion: CLOAK_RUNTIME_VERSION,
    chromiumMajor: '145',
    binaryPath:
      '/Users/test/.cloakbrowser/chromium-145.0.7632.109.2/Chromium.app/Contents/MacOS/Chromium',
    binarySha256: 'a'.repeat(64),
    tier: 'free',
    releaseChannel: 'stable',
    platform: 'darwin-arm64',
    verifiedAt: NOW.toISOString(),
  }
}

function buildEvidence(
  overrides: Partial<CloakTrustedLaunchEvidence> = {},
): CloakTrustedLaunchEvidence {
  return {
    runtimeIdentityPassed: true,
    persistentContextPassed: true,
    startupNavigationPassed: true,
    networkRoutePassed: true,
    credentialRedactionPassed: true,
    localeTimezonePassed: true,
    geolocationPassed: true,
    webRtcHostLeakAbsent: true,
    verifiedWebRtcIpObserved: false,
    webRtcCandidateObservation: 'no-candidates',
    legacyInjectionAbsent: true,
    ...overrides,
  }
}

function buildInput(
  overrides: Partial<BuildCloakTrustedIdentitySnapshotInput> = {},
): BuildCloakTrustedIdentitySnapshotInput {
  return {
    profileId: PROFILE_ID,
    desktopAppVersion: '3.6.8',
    hostEnvironment: 'macOS-arm64',
    runtimeIdentity: buildRuntimeIdentity(),
    fingerprintMapping: buildFingerprintMapping(),
    networkMapping: buildNetworkMapping(),
    evidence: buildEvidence(),
    snapshotId: 'phase4-fixed-snapshot',
    now: NOW,
    ...overrides,
  }
}

function cloneSnapshot(snapshot: CloakTrustedIdentitySnapshot): CloakTrustedIdentitySnapshot {
  return structuredClone(snapshot)
}

test('trusted snapshot atomically binds runtime, fingerprint and network identity', () => {
  const first = buildCloakTrustedIdentitySnapshot(buildInput())
  const second = buildCloakTrustedIdentitySnapshot(buildInput())

  validateCloakTrustedIdentitySnapshot(first)
  assert.equal(first.snapshotHash, second.snapshotHash)
  assert.equal(first.runtimeIdentity.binarySha256, 'a'.repeat(64))
  assert.equal(first.fingerprintMapping.mappingHash.length, 64)
  assert.equal(first.networkMapping.mappingHash.length, 64)
  assert.equal(first.networkMapping.transportClass, 'loopback-http-bridge')
  assert.equal('launchProxy' in first.networkMapping, false)
  assert.equal(first.policy.engineFallback, 'forbidden')
  assert.equal(first.policy.wrapperAutoUpdate, 'disabled')
  assert.equal(first.policy.legacyInitScript, 'forbidden')
})

test('snapshot serialization excludes upstream proxy credentials and temporary bridge details', () => {
  const snapshot = buildCloakTrustedIdentitySnapshot(buildInput())
  const serialized = JSON.stringify(snapshot)

  assert.equal(serialized.includes(SENTINEL_USERNAME), false)
  assert.equal(serialized.includes(SENTINEL_PASSWORD), false)
  assert.equal(serialized.includes('127.0.0.1:48081'), false)
  assert.equal(serialized.includes('phase4-upstream.invalid:48080'), true)
})

test('snapshot payload tampering is detected by the aggregate hash', () => {
  const snapshot = cloneSnapshot(buildCloakTrustedIdentitySnapshot(buildInput()))
  snapshot.runtimeIdentity.binarySha256 = 'b'.repeat(64)

  assert.throws(
    () => validateCloakTrustedIdentitySnapshot(snapshot),
    (error: unknown) =>
      error instanceof CloakTrustedSnapshotError &&
      error.code === 'snapshot_hash_mismatch',
  )
})

test('tampered component mapping hashes fail closed before snapshot creation', () => {
  const fingerprintMapping = buildFingerprintMapping()
  fingerprintMapping.mappingHash = '0'.repeat(64)
  assert.throws(
    () => buildCloakTrustedIdentitySnapshot(buildInput({ fingerprintMapping })),
    (error: unknown) =>
      error instanceof CloakTrustedSnapshotError &&
      error.code === 'fingerprint_mapping_mismatch',
  )

  const networkMapping = buildNetworkMapping()
  networkMapping.mappingHash = '1'.repeat(64)
  assert.throws(
    () => buildCloakTrustedIdentitySnapshot(buildInput({ networkMapping })),
    (error: unknown) =>
      error instanceof CloakTrustedSnapshotError &&
      error.code === 'network_mapping_mismatch',
  )
})

test('runtime binary and Chromium identity mismatches fail closed', () => {
  const runtimeIdentity = buildRuntimeIdentity()
  runtimeIdentity.runtimeChromiumVersion = '146.0.0.0'

  assert.throws(
    () => buildCloakTrustedIdentitySnapshot(buildInput({ runtimeIdentity })),
    (error: unknown) =>
      error instanceof CloakTrustedSnapshotError &&
      error.code === 'runtime_identity_mismatch',
  )
})

test('cross-layer locale and WebRTC policy drift is rejected', () => {
  assert.throws(
    () =>
      buildCloakTrustedIdentitySnapshot(
        buildInput({ networkMapping: buildNetworkMapping('proxy-aware', 'fr-FR') }),
      ),
    (error: unknown) =>
      error instanceof CloakTrustedSnapshotError &&
      error.code === 'cross_identity_mismatch',
  )

  assert.throws(
    () =>
      buildCloakTrustedIdentitySnapshot(
        buildInput({ networkMapping: buildNetworkMapping('disabled') }),
      ),
    (error: unknown) =>
      error instanceof CloakTrustedSnapshotError &&
      error.code === 'cross_identity_mismatch',
  )
})

test('incomplete launch evidence cannot produce a trusted snapshot', () => {
  assert.throws(
    () =>
      buildCloakTrustedIdentitySnapshot(
        buildInput({ evidence: buildEvidence({ networkRoutePassed: false }) }),
      ),
    (error: unknown) =>
      error instanceof CloakTrustedSnapshotError &&
      error.code === 'incomplete_verification_evidence',
  )

  assert.throws(
    () =>
      buildCloakTrustedIdentitySnapshot(
        buildInput({
          evidence: buildEvidence({
            verifiedWebRtcIpObserved: false,
            webRtcCandidateObservation: 'not-required',
          }),
        }),
      ),
    (error: unknown) =>
      error instanceof CloakTrustedSnapshotError &&
      error.code === 'incomplete_verification_evidence',
  )
})

test('reuse accepts an exact identity and rejects runtime, mapping and age drift', () => {
  const input = buildInput()
  const snapshot = buildCloakTrustedIdentitySnapshot(input)
  const context = {
    profileId: PROFILE_ID,
    desktopAppVersion: '3.6.8',
    hostEnvironment: 'macOS-arm64',
    runtimeIdentity: buildRuntimeIdentity(),
    fingerprintMapping: buildFingerprintMapping(),
    networkMapping: buildNetworkMapping(),
    now: new Date(NOW.getTime() + 60_000),
  }

  assert.deepEqual(evaluateCloakTrustedIdentitySnapshotReuse(snapshot, context), {
    usable: true,
    status: 'trusted',
    reason: '',
  })

  const oldMappingSnapshot = cloneSnapshot(snapshot)
  oldMappingSnapshot.fingerprintMapping.schemaVersion = 1
  const oldMappingDecision = evaluateCloakTrustedIdentitySnapshotReuse(
    oldMappingSnapshot,
    context,
  )
  assert.equal(oldMappingDecision.usable, false)
  assert.equal(oldMappingDecision.status, 'stale')
  assert.match(oldMappingDecision.reason, /must be rebuilt as schema/)

  const changedRuntime = buildRuntimeIdentity()
  changedRuntime.binarySha256 = 'c'.repeat(64)
  const runtimeDecision = evaluateCloakTrustedIdentitySnapshotReuse(snapshot, {
    ...context,
    runtimeIdentity: changedRuntime,
  })
  assert.equal(runtimeDecision.usable, false)
  assert.equal(runtimeDecision.status, 'invalid')
  assert.match(runtimeDecision.reason, /binarySha256/)

  const changedFingerprint = buildFingerprintMapping((config) => {
    config.runtimeMetadata.hardwareSeed = 'different-hardware-seed'
  })
  const mappingDecision = evaluateCloakTrustedIdentitySnapshotReuse(snapshot, {
    ...context,
    fingerprintMapping: changedFingerprint,
  })
  assert.equal(mappingDecision.usable, false)
  assert.equal(mappingDecision.status, 'stale')

  const ageDecision = evaluateCloakTrustedIdentitySnapshotReuse(snapshot, {
    ...context,
    now: new Date(NOW.getTime() + 10_000),
    maxSnapshotAgeMs: 1_000,
  })
  assert.equal(ageDecision.usable, false)
  assert.equal(ageDecision.status, 'stale')
})

test('atomic write can be read back without leftover temporary files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-trust-test-'))
  const snapshotPath = path.join(root, 'trusted', 'identity.json')
  const snapshot = buildCloakTrustedIdentitySnapshot(buildInput())
  try {
    await writeCloakTrustedIdentitySnapshotAtomic(snapshotPath, snapshot)
    const readBack = await readCloakTrustedIdentitySnapshot(snapshotPath)
    assert.deepEqual(readBack, snapshot)
    assert.deepEqual(await readdir(path.dirname(snapshotPath)), ['identity.json'])
    assert.equal((await readFile(snapshotPath, 'utf8')).endsWith('\n'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('tampered snapshot files are rejected on read', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-trust-tamper-'))
  const snapshotPath = path.join(root, 'identity.json')
  const snapshot = buildCloakTrustedIdentitySnapshot(buildInput())
  try {
    await writeCloakTrustedIdentitySnapshotAtomic(snapshotPath, snapshot)
    const tampered = cloneSnapshot(snapshot)
    tampered.desktopAppVersion = '9.9.9'
    await writeFile(snapshotPath, JSON.stringify(tampered), 'utf8')
    await assert.rejects(
      () => readCloakTrustedIdentitySnapshot(snapshotPath),
      (error: unknown) =>
        error instanceof CloakTrustedSnapshotError &&
        error.code === 'snapshot_hash_mismatch',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
