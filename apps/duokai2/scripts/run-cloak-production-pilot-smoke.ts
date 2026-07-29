import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'

import type { FingerprintConfig, ProfileProxySettings } from '../src/shared/types.ts'
import { buildCloakFingerprintMapping } from '../electron/services/cloakBrowserFingerprint.ts'
import type {
  CloakBrowserBinaryDescriptor,
  CloakBrowserRuntimeIdentity,
} from '../electron/services/cloakBrowserIdentity.ts'
import { buildCloakNetworkMapping } from '../electron/services/cloakBrowserNetwork.ts'
import {
  buildCloakTrustedIdentitySnapshot,
  type CloakTrustedIdentitySnapshot,
} from '../electron/services/cloakBrowserTrustedSnapshot.ts'
import {
  ElectronSafeStorageSigningKeyProvider,
  readCloakSignedTrustedIdentityRecord,
  signCloakTrustedIdentitySnapshot,
  verifyCloakSignedTrustedIdentityRecord,
  writeCloakSignedTrustedIdentityRecordAtomic,
  type CloakSignedTrustedIdentityRecord,
  type SafeStorageLike,
} from '../electron/services/cloakBrowserSnapshotSignature.ts'
import {
  buildCloakBrowserDeliveryManifest,
  evaluateCloakBrowserDeliveryReadiness,
} from '../electron/services/cloakBrowserDeliveryPolicy.ts'
import {
  CloakProductionTransactionError,
  runCloakProductionTransaction,
  type CloakProductionTransactionDependencies,
  type CloakProductionTransactionStage,
} from '../electron/services/cloakBrowserProductionTransaction.ts'

const PROFILE_ID = 'phase5a-production-pilot-smoke'
const PACKAGE_VERSION = '145.0.7632.109.2'
const RUNTIME_VERSION = '145.0.7632.109'
const NOW = new Date('2026-07-27T01:30:00.000Z')
const BINARY_PATH =
  `/Users/test/.cloakbrowser/chromium-${PACKAGE_VERSION}/Chromium.app/Contents/MacOS/Chromium`

interface SmokeReport {
  success: boolean
  startedAt: string
  finishedAt: string
  signing: {
    algorithm: string
    keyId: string
    sealedKeyCreated: boolean
    plaintextSecretAbsent: boolean
    signedRecordWritten: boolean
    signedRecordReadBack: boolean
    tamperRejected: boolean
    leftoverTemporaryFiles: string[]
  }
  delivery: {
    ready: boolean
    cacheDir: string
    deliveryMode: string
    installTrigger: string
    launchAutoDownload: boolean
    fallbackEngine: string
    missingBinaryBlocked: boolean
  }
  transaction: {
    successPathTrusted: boolean
    successHistory: CloakProductionTransactionStage[]
    successCleanupOrder: string[]
    startupFailureRolledBack: boolean
    startupFailurePersistedTrust: boolean
    startupFailureCleanupOrder: string[]
    publicationFailureSnapshotRolledBack: boolean
    publicationFailureOrder: string[]
    rollbackFailureCaptured: boolean
  }
  limits: string[]
  failures: string[]
}

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
      hardwareSeed: 'phase5a-smoke-stable-seed',
      hardwareProfileId: 'phase5a-smoke-hardware',
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

function binaryDescriptor(installed = true): CloakBrowserBinaryDescriptor {
  return {
    version: PACKAGE_VERSION,
    bundledVersion: PACKAGE_VERSION,
    platform: 'darwin-arm64',
    tier: 'free',
    binaryPath: BINARY_PATH,
    installed,
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
      detail: 'Phase 5A production-pilot smoke fixture',
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
    snapshotId: 'phase5a-smoke-snapshot',
    now: NOW,
  })
}

function fakeSafeStorage(): SafeStorageLike {
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'unknown',
    encryptString: (plainText) => Buffer.from(`sealed:${plainText}`, 'utf8'),
    decryptString: (encrypted) => {
      const text = encrypted.toString('utf8')
      if (!text.startsWith('sealed:')) throw new Error('invalid sealed value')
      return text.slice('sealed:'.length)
    },
  }
}

function transactionDependencies(input: {
  record: CloakSignedTrustedIdentityRecord
  events: string[]
  failAt?: CloakProductionTransactionStage
  rollbackFailure?: boolean
}): CloakProductionTransactionDependencies {
  const maybeFail = (stage: CloakProductionTransactionStage) => {
    if (input.failAt === stage) throw new Error(`injected ${stage} failure`)
  }
  return {
    onTransition: (stage) => input.events.push(`stage:${stage}`),
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
          if (input.rollbackFailure) throw new Error('injected rollback failure')
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

async function run(): Promise<SmokeReport> {
  const startedAt = new Date().toISOString()
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-phase5a-'))
  const keyFilePath = path.join(root, 'keys', 'cloak-signing-key.json')
  const recordFilePath = path.join(root, 'records', 'signed-trusted-identity.json')
  const report: SmokeReport = {
    success: false,
    startedAt,
    finishedAt: '',
    signing: {
      algorithm: '',
      keyId: '',
      sealedKeyCreated: false,
      plaintextSecretAbsent: false,
      signedRecordWritten: false,
      signedRecordReadBack: false,
      tamperRejected: false,
      leftoverTemporaryFiles: [],
    },
    delivery: {
      ready: false,
      cacheDir: '',
      deliveryMode: '',
      installTrigger: '',
      launchAutoDownload: true,
      fallbackEngine: '',
      missingBinaryBlocked: false,
    },
    transaction: {
      successPathTrusted: false,
      successHistory: [],
      successCleanupOrder: [],
      startupFailureRolledBack: false,
      startupFailurePersistedTrust: false,
      startupFailureCleanupOrder: [],
      publicationFailureSnapshotRolledBack: false,
      publicationFailureOrder: [],
      rollbackFailureCaptured: false,
    },
    limits: [
      'The smoke uses an injected safeStorage-compatible test double and does not write to the real macOS Keychain.',
      'The delivery policy validates preinstalled identity but does not implement the production installer or updater.',
      'The transaction uses disposable test resources and does not modify the production proxy bridge, database or profile runtime.',
    ],
    failures: [],
  }

  try {
    const secret = Buffer.alloc(32, 11)
    const provider = new ElectronSafeStorageSigningKeyProvider({
      keyFilePath,
      loadSafeStorage: async () => fakeSafeStorage(),
      platform: 'darwin',
      now: () => NOW,
      randomKey: () => Buffer.from(secret),
    })
    const activeKey = await provider.getActiveKey()
    report.signing.keyId = activeKey.keyId
    report.signing.sealedKeyCreated = true
    const sealedKeyFile = await readFile(keyFilePath, 'utf8')
    report.signing.plaintextSecretAbsent = !sealedKeyFile.includes(secret.toString('base64'))

    const record = await signCloakTrustedIdentitySnapshot(trustedSnapshot(), provider, NOW)
    report.signing.algorithm = record.signature.algorithm
    await writeCloakSignedTrustedIdentityRecordAtomic(recordFilePath, record, provider)
    report.signing.signedRecordWritten = true
    const readBack = await readCloakSignedTrustedIdentityRecord(recordFilePath, provider)
    report.signing.signedRecordReadBack =
      readBack.signature.valueBase64 === record.signature.valueBase64

    const tampered = structuredClone(readBack)
    tampered.signature.valueBase64 = Buffer.alloc(32, 1).toString('base64')
    try {
      await verifyCloakSignedTrustedIdentityRecord(tampered, provider)
    } catch {
      report.signing.tamperRejected = true
    }
    report.signing.leftoverTemporaryFiles = (
      await readdir(path.dirname(recordFilePath))
    ).filter((name) => name.endsWith('.tmp'))

    const identity = runtimeIdentity()
    const manifest = buildCloakBrowserDeliveryManifest(identity, {
      appPath: '/Applications/Duokai.app',
      appResourcesPath: '/Applications/Duokai.app/Contents/Resources',
      temporaryDirectory: '/tmp',
    })
    const readiness = evaluateCloakBrowserDeliveryReadiness(
      manifest,
      identity,
      binaryDescriptor(true),
      {
        appPath: '/Applications/Duokai.app',
        appResourcesPath: '/Applications/Duokai.app/Contents/Resources',
        temporaryDirectory: '/tmp',
      },
    )
    report.delivery.ready = readiness.ready
    report.delivery.cacheDir = manifest.cacheDir
    report.delivery.deliveryMode = manifest.deliveryMode
    report.delivery.installTrigger = manifest.installTrigger
    report.delivery.launchAutoDownload = manifest.launchAutoDownload
    report.delivery.fallbackEngine = manifest.fallbackEngine
    report.delivery.missingBinaryBlocked = !evaluateCloakBrowserDeliveryReadiness(
      manifest,
      identity,
      binaryDescriptor(false),
    ).ready

    const successEvents: string[] = []
    const session = await runCloakProductionTransaction(
      PROFILE_ID,
      transactionDependencies({ record, events: successEvents }),
    )
    report.transaction.successPathTrusted = session.status === 'trusted'
    report.transaction.successHistory = session.history
    await session.close()
    report.transaction.successCleanupOrder = successEvents.filter((event) =>
      event.startsWith('close:'),
    )

    const startupEvents: string[] = []
    try {
      await runCloakProductionTransaction(
        PROFILE_ID,
        transactionDependencies({
          record,
          events: startupEvents,
          failAt: 'startup-verification',
        }),
      )
    } catch (error) {
      report.transaction.startupFailureRolledBack =
        error instanceof CloakProductionTransactionError &&
        error.failedStage === 'startup-verification' &&
        startupEvents.includes('stage:rolled-back')
    }
    report.transaction.startupFailurePersistedTrust =
      startupEvents.includes('persist:snapshot') || startupEvents.includes('publish:trusted')
    report.transaction.startupFailureCleanupOrder = startupEvents.filter((event) =>
      event.startsWith('close:'),
    )

    const publicationEvents: string[] = []
    try {
      await runCloakProductionTransaction(
        PROFILE_ID,
        transactionDependencies({
          record,
          events: publicationEvents,
          failAt: 'trust-publication',
        }),
      )
    } catch {
      const persistIndex = publicationEvents.indexOf('persist:snapshot')
      const rollbackIndex = publicationEvents.indexOf('rollback:snapshot')
      const browserCloseIndex = publicationEvents.indexOf('close:browser')
      report.transaction.publicationFailureSnapshotRolledBack =
        persistIndex >= 0 && rollbackIndex > persistIndex && browserCloseIndex > rollbackIndex
    }
    report.transaction.publicationFailureOrder = publicationEvents

    const rollbackFailureEvents: string[] = []
    try {
      await runCloakProductionTransaction(
        PROFILE_ID,
        transactionDependencies({
          record,
          events: rollbackFailureEvents,
          failAt: 'trust-publication',
          rollbackFailure: true,
        }),
      )
    } catch (error) {
      report.transaction.rollbackFailureCaptured =
        error instanceof CloakProductionTransactionError &&
        error.code === 'rollback_failed' &&
        error.failedStage === 'trust-publication' &&
        error.rollbackErrors.length === 1
    }

    const checks: Array<[string, boolean]> = [
      ['sealedKeyCreated', report.signing.sealedKeyCreated],
      ['plaintextSecretAbsent', report.signing.plaintextSecretAbsent],
      ['signedRecordWritten', report.signing.signedRecordWritten],
      ['signedRecordReadBack', report.signing.signedRecordReadBack],
      ['tamperRejected', report.signing.tamperRejected],
      ['noTemporaryFiles', report.signing.leftoverTemporaryFiles.length === 0],
      ['deliveryReady', report.delivery.ready],
      ['missingBinaryBlocked', report.delivery.missingBinaryBlocked],
      ['launchAutoDownloadDisabled', report.delivery.launchAutoDownload === false],
      ['fallbackForbidden', report.delivery.fallbackEngine === 'forbidden'],
      ['successPathTrusted', report.transaction.successPathTrusted],
      [
        'successCleanupOrder',
        JSON.stringify(report.transaction.successCleanupOrder) ===
          JSON.stringify(['close:browser', 'close:transport']),
      ],
      ['startupFailureRolledBack', report.transaction.startupFailureRolledBack],
      ['startupFailureDidNotPersistTrust', !report.transaction.startupFailurePersistedTrust],
      [
        'startupFailureCleanupOrder',
        JSON.stringify(report.transaction.startupFailureCleanupOrder) ===
          JSON.stringify(['close:browser', 'close:transport']),
      ],
      [
        'publicationFailureSnapshotRolledBack',
        report.transaction.publicationFailureSnapshotRolledBack,
      ],
      ['rollbackFailureCaptured', report.transaction.rollbackFailureCaptured],
    ]
    report.failures = checks
      .filter(([, passed]) => !passed)
      .map(([name]) => `${name} did not pass.`)
    report.success = report.failures.length === 0
  } catch (error) {
    report.failures.push(error instanceof Error ? error.message : String(error))
  } finally {
    await rm(root, { recursive: true, force: true })
    report.finishedAt = new Date().toISOString()
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!report.success) process.exitCode = 1
  return report
}

void run()
