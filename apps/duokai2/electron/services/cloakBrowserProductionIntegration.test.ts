import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'

import type { FingerprintConfig, ProfileProxySettings } from '../../src/shared/types.ts'
import { buildCloakFingerprintMapping } from './cloakBrowserFingerprint.ts'
import type {
  CloakBrowserBinaryDescriptor,
  CloakBrowserRuntimeIdentity,
} from './cloakBrowserIdentity.ts'
import { buildCloakNetworkMapping } from './cloakBrowserNetwork.ts'
import {
  buildCloakTrustedIdentitySnapshot,
  type CloakTrustedIdentitySnapshot,
} from './cloakBrowserTrustedSnapshot.ts'
import {
  canonicalJson,
  createInMemoryCloakSigningKey,
  ElectronSafeStorageSigningKeyProvider,
  InMemoryCloakSigningKeyProvider,
  readCloakSignedTrustedIdentityRecord,
  signCloakTrustedIdentitySnapshot,
  verifyCloakSignedTrustedIdentityRecord,
  writeCloakSignedTrustedIdentityRecordAtomic,
  CloakSnapshotSignatureError,
  type CloakSignedTrustedIdentityRecord,
  type SafeStorageLike,
} from './cloakBrowserSnapshotSignature.ts'
import {
  buildCloakBrowserDeliveryManifest,
  CloakDeliveryError,
  evaluateCloakBrowserDeliveryReadiness,
  validateCloakBrowserDeliveryManifest,
} from './cloakBrowserDeliveryPolicy.ts'
import {
  CloakProductionTransactionError,
  runCloakProductionTransaction,
  type CloakProductionTransactionDependencies,
  type CloakProductionTransactionStage,
} from './cloakBrowserProductionTransaction.ts'

const PROFILE_ID = 'phase5a-production-pilot-profile'
const PACKAGE_VERSION = '145.0.7632.109.2'
const RUNTIME_VERSION = '145.0.7632.109'
const NOW = new Date('2026-07-27T01:15:00.000Z')
const BINARY_PATH =
  `/Users/test/.cloakbrowser/chromium-${PACKAGE_VERSION}/Chromium.app/Contents/MacOS/Chromium`

function fingerprintConfig(): FingerprintConfig {
  return {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    language: 'en-US',
    timezone: 'America/Los_Angeles',
    resolution: '1440x900',
    webrtcMode: 'proxy-aware',
    basicSettings: {} as FingerprintConfig['basicSettings'],
    proxySettings: { proxyMode: 'direct' } as FingerprintConfig['proxySettings'],
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
      hardwareSeed: 'phase5a-stable-seed',
      hardwareProfileId: 'phase5a-hardware-profile',
    } as FingerprintConfig['runtimeMetadata'],
  }
}

function directProxySettings(): ProfileProxySettings {
  return {
    proxyMode: 'direct',
    ipLookupChannel: 'ipwho.is',
    proxyType: 'http',
    ipProtocol: 'ipv4',
    host: '',
    port: 0,
    username: '',
    password: '',
    udpEnabled: false,
  }
}

function runtimeIdentity(): CloakBrowserRuntimeIdentity {
  return {
    engine: 'cloakbrowser',
    cloakWrapperVersion: '0.5.2',
    requestedChromiumVersion: PACKAGE_VERSION,
    installedChromiumVersion: PACKAGE_VERSION,
    executableChromiumVersion: RUNTIME_VERSION,
    runtimeChromiumVersion: RUNTIME_VERSION,
    chromiumMajor: '145',
    binaryPath: BINARY_PATH,
    binarySha256: '7'.repeat(64),
    tier: 'free',
    releaseChannel: 'stable',
    platform: 'darwin-arm64',
    verifiedAt: NOW.toISOString(),
  }
}

function binaryDescriptor(): CloakBrowserBinaryDescriptor {
  return {
    version: PACKAGE_VERSION,
    bundledVersion: PACKAGE_VERSION,
    platform: 'darwin-arm64',
    tier: 'free',
    binaryPath: BINARY_PATH,
    installed: true,
    cacheDir: '/Users/test/.cloakbrowser',
    downloadUrl: `https://downloads.example.invalid/cloak/${PACKAGE_VERSION}`,
  }
}

function trustedSnapshot(): CloakTrustedIdentitySnapshot {
  const fingerprintMapping = buildCloakFingerprintMapping({
    profileId: PROFILE_ID,
    fingerprintConfig: fingerprintConfig(),
    browserVersion: PACKAGE_VERSION,
    resolvedLocale: 'en-US',
    resolvedTimezone: 'America/Los_Angeles',
    resolvedGeolocation: {
      latitude: 34.0522,
      longitude: -118.2437,
      accuracy: 20,
    },
    verifiedWebRtcIp: '203.0.113.25',
  })
  const networkMapping = buildCloakNetworkMapping({
    profileId: PROFILE_ID,
    proxySettings: directProxySettings(),
    webrtcMode: 'proxy-aware',
    proxy: null,
    egress: {
      ok: true,
      source: 'local',
      ip: '203.0.113.25',
      country: 'United States',
      region: 'California',
      city: 'Los Angeles',
      timezone: 'America/Los_Angeles',
      language: 'en-US',
      geolocation: '34.0522, -118.2437',
      egressPathType: 'direct',
      checkedAt: NOW.toISOString(),
    },
    transport: {
      config: null,
      bridgeActive: false,
      egressPathType: 'direct',
      detail: 'Phase 5A fixture',
    },
    now: NOW,
  })
  return buildCloakTrustedIdentitySnapshot({
    profileId: PROFILE_ID,
    desktopAppVersion: '3.6.8',
    hostEnvironment: 'darwin-arm64',
    runtimeIdentity: runtimeIdentity(),
    fingerprintMapping,
    networkMapping,
    evidence: {
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
    },
    snapshotId: 'phase5a-fixed-snapshot',
    now: NOW,
  })
}

function fakeSafeStorage(options: {
  available?: boolean
  backend?: string
} = {}): SafeStorageLike {
  return {
    isEncryptionAvailable: () => options.available ?? true,
    getSelectedStorageBackend: () => options.backend ?? 'unknown',
    encryptString: (plainText) => Buffer.from(`sealed:${plainText}`, 'utf8'),
    decryptString: (encrypted) => {
      const text = encrypted.toString('utf8')
      if (!text.startsWith('sealed:')) throw new Error('invalid sealed value')
      return text.slice('sealed:'.length)
    },
  }
}

async function signedRecord(): Promise<{
  record: CloakSignedTrustedIdentityRecord
  provider: InMemoryCloakSigningKeyProvider
}> {
  const provider = new InMemoryCloakSigningKeyProvider(
    createInMemoryCloakSigningKey(Buffer.alloc(32, 9), NOW.toISOString()),
  )
  return {
    provider,
    record: await signCloakTrustedIdentitySnapshot(trustedSnapshot(), provider, NOW),
  }
}

test('canonical JSON is stable across object key order', () => {
  assert.equal(canonicalJson({ b: 2, a: { z: 1, y: 2 } }), canonicalJson({ a: { y: 2, z: 1 }, b: 2 }))
})

test('HMAC signed snapshot verifies with the active key', async () => {
  const { record, provider } = await signedRecord()
  await assert.doesNotReject(verifyCloakSignedTrustedIdentityRecord(record, provider))
  assert.equal(record.signature.algorithm, 'HMAC-SHA256')
  assert.equal(record.signature.payloadSha256.length, 64)
})

test('snapshot and signature tampering fail closed', async () => {
  const { record, provider } = await signedRecord()
  const tamperedSnapshot = structuredClone(record)
  tamperedSnapshot.snapshot.desktopAppVersion = '9.9.9'
  await assert.rejects(
    () => verifyCloakSignedTrustedIdentityRecord(tamperedSnapshot, provider),
    (error: unknown) =>
      error instanceof Error && /snapshot hash|signature/i.test(error.message),
  )

  const tamperedSignature = structuredClone(record)
  tamperedSignature.signature.valueBase64 = Buffer.alloc(32, 1).toString('base64')
  await assert.rejects(
    () => verifyCloakSignedTrustedIdentityRecord(tamperedSignature, provider),
    (error: unknown) =>
      error instanceof CloakSnapshotSignatureError && error.code === 'signature_mismatch',
  )

  const tamperedMetadata = structuredClone(record)
  tamperedMetadata.signature.signedAt = '2026-07-27T02:15:00.000Z'
  await assert.rejects(
    () => verifyCloakSignedTrustedIdentityRecord(tamperedMetadata, provider),
    (error: unknown) =>
      error instanceof CloakSnapshotSignatureError && error.code === 'signature_mismatch',
  )
})

test('verification rejects unavailable signing keys', async () => {
  const { record } = await signedRecord()
  const otherProvider = new InMemoryCloakSigningKeyProvider(
    createInMemoryCloakSigningKey(Buffer.alloc(32, 4), NOW.toISOString()),
  )
  await assert.rejects(
    () => verifyCloakSignedTrustedIdentityRecord(record, otherProvider),
    (error: unknown) =>
      error instanceof CloakSnapshotSignatureError && error.code === 'signing_key_unavailable',
  )
})

test('safeStorage provider creates and reloads one sealed key', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-phase5a-key-'))
  const keyPath = path.join(root, 'keys', 'cloak-signing-key.json')
  try {
    const options = {
      keyFilePath: keyPath,
      loadSafeStorage: async () => fakeSafeStorage(),
      platform: 'darwin' as const,
      now: () => NOW,
      randomKey: () => Buffer.alloc(32, 6),
    }
    const first = await new ElectronSafeStorageSigningKeyProvider(options).getActiveKey()
    const second = await new ElectronSafeStorageSigningKeyProvider(options).getActiveKey()
    assert.equal(first.keyId, second.keyId)
    assert.deepEqual(first.secret, second.secret)
    const stored = await readFile(keyPath, 'utf8')
    assert.equal(stored.includes(first.secret.toString('base64')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('safeStorage provider rejects unavailable or plaintext Linux storage', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-phase5a-unsafe-key-'))
  try {
    await assert.rejects(
      () =>
        new ElectronSafeStorageSigningKeyProvider({
          keyFilePath: path.join(root, 'unavailable.json'),
          loadSafeStorage: async () => fakeSafeStorage({ available: false }),
        }).getActiveKey(),
      (error: unknown) =>
        error instanceof CloakSnapshotSignatureError && error.code === 'signing_key_unavailable',
    )
    await assert.rejects(
      () =>
        new ElectronSafeStorageSigningKeyProvider({
          keyFilePath: path.join(root, 'plaintext.json'),
          platform: 'linux',
          loadSafeStorage: async () => fakeSafeStorage({ backend: 'basic_text' }),
        }).getActiveKey(),
      (error: unknown) =>
        error instanceof CloakSnapshotSignatureError && error.code === 'unsafe_key_storage',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('signed record writes atomically and reads back without temporary files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-phase5a-record-'))
  const recordPath = path.join(root, 'trusted', 'signed-record.json')
  try {
    const { record, provider } = await signedRecord()
    await writeCloakSignedTrustedIdentityRecordAtomic(recordPath, record, provider)
    assert.deepEqual(await readCloakSignedTrustedIdentityRecord(recordPath, provider), record)
    assert.deepEqual(await readdir(path.dirname(recordPath)), ['signed-record.json'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('delivery manifest requires explicit preinstall outside the application', () => {
  const identity = runtimeIdentity()
  const descriptor = binaryDescriptor()
  const manifest = buildCloakBrowserDeliveryManifest(identity, {
    appResourcesPath: '/Applications/Duokai.app/Contents/Resources',
    appPath: '/Applications/Duokai.app',
    temporaryDirectory: '/tmp',
  })
  validateCloakBrowserDeliveryManifest(manifest, identity, descriptor, {
    appResourcesPath: '/Applications/Duokai.app/Contents/Resources',
    appPath: '/Applications/Duokai.app',
    temporaryDirectory: '/tmp',
  })
  assert.equal(manifest.cacheDir, '/Users/test/.cloakbrowser')
  assert.equal(manifest.launchAutoDownload, false)
  assert.equal(manifest.fallbackEngine, 'forbidden')
})

test('delivery readiness blocks missing and drifted binaries', () => {
  const identity = runtimeIdentity()
  const manifest = buildCloakBrowserDeliveryManifest(identity)
  const missing = { ...binaryDescriptor(), installed: false }
  const missingDecision = evaluateCloakBrowserDeliveryReadiness(manifest, identity, missing)
  assert.equal(missingDecision.ready, false)
  assert.equal(missingDecision.reasonCode, 'binary_missing')

  const drifted = { ...runtimeIdentity(), binarySha256: '8'.repeat(64) }
  assert.throws(
    () => validateCloakBrowserDeliveryManifest(manifest, drifted, binaryDescriptor()),
    (error: unknown) =>
      error instanceof CloakDeliveryError && error.code === 'binary_identity_mismatch',
  )

  const wrongCache = {
    ...binaryDescriptor(),
    cacheDir: '/Users/test/.different-cloak-cache',
  }
  assert.throws(
    () => validateCloakBrowserDeliveryManifest(manifest, identity, wrongCache),
    (error: unknown) =>
      error instanceof CloakDeliveryError && error.code === 'binary_identity_mismatch',
  )
})

test('delivery policy rejects caches inside app resources or temporary storage', () => {
  const identity = runtimeIdentity()
  const unsafeIdentity = {
    ...identity,
    binaryPath: `/Applications/Duokai.app/Contents/Resources/.cloakbrowser/chromium-${PACKAGE_VERSION}/Chromium.app/Contents/MacOS/Chromium`,
  }
  assert.throws(
    () =>
      buildCloakBrowserDeliveryManifest(unsafeIdentity, {
        appResourcesPath: '/Applications/Duokai.app/Contents/Resources',
      }),
    (error: unknown) =>
      error instanceof CloakDeliveryError && error.code === 'unsafe_cache_location',
  )
})

async function transactionDependencies(input: {
  record: CloakSignedTrustedIdentityRecord
  events: string[]
  failAt?: CloakProductionTransactionStage
  rollbackFailure?: boolean
  cancelledAt?: CloakProductionTransactionStage
}): Promise<CloakProductionTransactionDependencies> {
  let current: CloakProductionTransactionStage = 'unverified'
  const maybeFail = (stage: CloakProductionTransactionStage) => {
    if (input.failAt === stage) throw new Error(`injected ${stage} failure`)
  }
  return {
    onTransition: (stage) => {
      current = stage
      input.events.push(`stage:${stage}`)
    },
    isCancelled: () => input.cancelledAt === current,
    preflightDelivery: async () => {
      maybeFail('delivery-preflight')
      return { ready: true }
    },
    verifyNetwork: async () => {
      maybeFail('network-verification')
      return { egress: '203.0.113.25' }
    },
    acquireTransport: async () => {
      maybeFail('transport-acquisition')
      input.events.push('open:transport')
      return {
        close: async () => {
          input.events.push('close:transport')
        },
      }
    },
    launchBrowser: async () => {
      maybeFail('browser-launch')
      input.events.push('open:browser')
      return {
        close: async () => {
          input.events.push('close:browser')
        },
      }
    },
    verifyRuntime: async () => {
      maybeFail('runtime-verification')
      return runtimeIdentity()
    },
    verifyStartup: async () => {
      maybeFail('startup-verification')
      return { passed: true }
    },
    buildSignedRecord: async () => {
      maybeFail('snapshot-signing')
      return input.record
    },
    persistSignedRecord: async () => {
      maybeFail('snapshot-persistence')
      input.events.push('persist:snapshot')
      return {
        rollback: async () => {
          input.events.push('rollback:snapshot')
          if (input.rollbackFailure) throw new Error('snapshot rollback failed')
        },
      }
    },
    publishTrustedState: async () => {
      maybeFail('trust-publication')
      input.events.push('publish:trusted')
      return {
        rollback: async () => {
          input.events.push('rollback:trusted')
        },
      }
    },
  }
}

test('production transaction publishes trust only after all verification gates', async () => {
  const { record } = await signedRecord()
  const events: string[] = []
  const session = await runCloakProductionTransaction(
    PROFILE_ID,
    await transactionDependencies({ record, events }),
  )
  assert.equal(session.status, 'trusted')
  assert.ok(events.indexOf('persist:snapshot') < events.indexOf('publish:trusted'))
  assert.equal(events.includes('close:browser'), false)
  assert.deepEqual(await session.close(), { cleanupErrors: [] })
  assert.deepEqual(events.slice(-2), ['close:browser', 'close:transport'])
  assert.deepEqual(await session.close(), { cleanupErrors: [] })
})

test('startup failure rolls back browser and transport without persisting trust', async () => {
  const { record } = await signedRecord()
  const events: string[] = []
  const dependencies = await transactionDependencies({
    record,
    events,
    failAt: 'startup-verification',
  })
  await assert.rejects(
    () => runCloakProductionTransaction(PROFILE_ID, dependencies),
    (error: unknown) =>
      error instanceof CloakProductionTransactionError &&
      error.failedStage === 'startup-verification',
  )
  assert.equal(events.includes('persist:snapshot'), false)
  assert.equal(events.includes('publish:trusted'), false)
  assert.deepEqual(events.filter((event) => event.startsWith('close:')), [
    'close:browser',
    'close:transport',
  ])
})

test('startup verification timeout fails closed and releases browser and transport', async () => {
  const { record } = await signedRecord()
  const events: string[] = []
  const dependencies = await transactionDependencies({ record, events })
  dependencies.startupVerificationTimeoutMs = 10
  dependencies.verifyStartup = async () => await new Promise<never>(() => {})

  await assert.rejects(
    () => runCloakProductionTransaction(PROFILE_ID, dependencies),
    (error: unknown) =>
      error instanceof CloakProductionTransactionError &&
      error.failedStage === 'startup-verification' &&
      /timed out after 10ms/.test(error.message),
  )
  assert.equal(events.includes('persist:snapshot'), false)
  assert.equal(events.includes('publish:trusted'), false)
  assert.deepEqual(events.filter((event) => event.startsWith('close:')), [
    'close:browser',
    'close:transport',
  ])
})

test('publication failure reverses snapshot persistence before resource cleanup', async () => {
  const { record } = await signedRecord()
  const events: string[] = []
  const dependencies = await transactionDependencies({
    record,
    events,
    failAt: 'trust-publication',
  })
  await assert.rejects(() => runCloakProductionTransaction(PROFILE_ID, dependencies))
  const rollbackIndex = events.indexOf('rollback:snapshot')
  assert.ok(rollbackIndex > events.indexOf('persist:snapshot'))
  assert.ok(rollbackIndex < events.indexOf('close:browser'))
  assert.deepEqual(events.slice(-2), ['stage:rolled-back', 'stage:failed'])
})

test('rollback failures are preserved without hiding the original failed stage', async () => {
  const { record } = await signedRecord()
  const events: string[] = []
  const dependencies = await transactionDependencies({
    record,
    events,
    failAt: 'trust-publication',
    rollbackFailure: true,
  })
  await assert.rejects(
    () => runCloakProductionTransaction(PROFILE_ID, dependencies),
    (error: unknown) =>
      error instanceof CloakProductionTransactionError &&
      error.code === 'rollback_failed' &&
      error.failedStage === 'trust-publication' &&
      error.rollbackErrors.length === 1,
  )
})

test('cancellation is fail-closed before resource acquisition', async () => {
  const { record } = await signedRecord()
  const events: string[] = []
  const dependencies = await transactionDependencies({
    record,
    events,
    cancelledAt: 'network-verification',
  })
  await assert.rejects(
    () => runCloakProductionTransaction(PROFILE_ID, dependencies),
    (error: unknown) =>
      error instanceof CloakProductionTransactionError && error.code === 'cancelled',
  )
  assert.equal(events.includes('open:transport'), false)
  assert.equal(events.includes('open:browser'), false)
})
