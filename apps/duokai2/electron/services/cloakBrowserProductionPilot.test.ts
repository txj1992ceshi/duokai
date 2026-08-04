import assert from 'node:assert/strict'
import test from 'node:test'

import type { FingerprintConfig, ProfileRecord, ProfileProxySettings } from '../../src/shared/types.ts'
import type { CloakBrowserRuntimeIdentity } from './cloakBrowserIdentity.ts'
import {
  CLOAK_PILOT_BINARY_SHA256,
  CLOAK_PILOT_BROWSER_VERSION,
} from './cloakBrowserInstallPreflight.ts'
import { buildCloakPilotRuntimeProfile } from './cloakBrowserPilotConfig.ts'
import {
  runCloakProductionPilot,
  shouldRebuildExistingCloakSnapshot,
} from './cloakBrowserProductionPilot.ts'
import type { CloakBrowserContextLike } from './cloakBrowserRuntime.ts'
import {
  createInMemoryCloakSigningKey,
  type CloakSnapshotSigningKeyProvider,
  type SafeStorageLike,
} from './cloakBrowserSnapshotSignature.ts'

const NOW = new Date()
const PROFILE_ID = 'phase5b-pilot-test-profile'
const CACHE_DIR = '/Users/test/.cloakbrowser'
const BINARY_PATH = `${CACHE_DIR}/chromium-${CLOAK_PILOT_BROWSER_VERSION}/Chromium.app/Contents/MacOS/Chromium`
const SHA = '8'.repeat(64)

test('legacy fingerprint mapping records are rebuilt instead of trusted', () => {
  assert.equal(
    shouldRebuildExistingCloakSnapshot(
      {
        snapshot: {
          profileId: PROFILE_ID,
          fingerprintMapping: { schemaVersion: 1 },
        },
      },
      PROFILE_ID,
    ),
    true,
  )
  assert.equal(
    shouldRebuildExistingCloakSnapshot(
      {
        snapshot: {
          profileId: PROFILE_ID,
          fingerprintMapping: { schemaVersion: 2 },
        },
      },
      PROFILE_ID,
    ),
    false,
  )
  assert.throws(
    () =>
      shouldRebuildExistingCloakSnapshot(
        {
          snapshot: {
            profileId: 'other-profile',
            fingerprintMapping: { schemaVersion: 1 },
          },
        },
        PROFILE_ID,
      ),
    /different Profile ID/,
  )
})

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

function fingerprintConfig(): FingerprintConfig {
  return {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    language: 'en-US',
    timezone: 'America/Los_Angeles',
    resolution: '1440x900',
    webrtcMode: 'proxy-aware',
    basicSettings: {} as FingerprintConfig['basicSettings'],
    proxySettings: directProxySettings(),
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
      resolutionMode: 'custom',
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
      portScanProtection: true,
      portScanAllowlist: '',
      sslFingerprintMode: 'disabled',
      customPluginFingerprint: 'disabled',
      cpuMode: 'custom',
      cpuCores: 8,
      memoryGb: 8,
      launchArgs: '',
    },
    runtimeMetadata: {
      hardwareSeed: 'phase5b-pilot-stable-seed',
      hardwareProfileId: 'phase5b-pilot-hardware',
    } as FingerprintConfig['runtimeMetadata'],
  }
}

function profile(): ProfileRecord {
  return {
    id: PROFILE_ID,
    name: 'Phase 5B Pilot',
    proxyId: null,
    groupName: 'tests',
    tags: ['cloak-pilot-test'],
    notes: '',
    environmentPurpose: 'operation',
    deviceProfile: {} as ProfileRecord['deviceProfile'],
    fingerprintConfig: fingerprintConfig(),
    status: 'stopped',
    lastStartedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  }
}

function identity(): CloakBrowserRuntimeIdentity {
  return {
    engine: 'cloakbrowser',
    cloakWrapperVersion: '0.5.2',
    requestedChromiumVersion: CLOAK_PILOT_BROWSER_VERSION,
    installedChromiumVersion: CLOAK_PILOT_BROWSER_VERSION,
    executableChromiumVersion: '145.0.7632.109',
    runtimeChromiumVersion: '145.0.7632.109',
    chromiumMajor: '145',
    binaryPath: BINARY_PATH,
    binarySha256: SHA,
    tier: 'free',
    releaseChannel: 'stable',
    platform: 'darwin-arm64',
    verifiedAt: NOW.toISOString(),
  }
}

function signingProvider(): CloakSnapshotSigningKeyProvider {
  const key = createInMemoryCloakSigningKey(Buffer.alloc(32, 7), NOW.toISOString())
  return {
    getActiveKey: async () => key,
    getKey: async (keyId) => (keyId === key.keyId ? key : null),
  }
}

function recoveryDependencies(events: string[] = []) {
  return {
    verifyLiveness: async () => ({
      passed: true as const,
      startedAt: NOW.toISOString(),
      completedAt: new Date(NOW.getTime() + 5_000).toISOString(),
      durationMs: 5_000,
      sampleCount: 3,
      samples: [0, 2_500, 5_000].map((elapsedMs) => ({
        sampledAt: new Date(NOW.getTime() + elapsedMs).toISOString(),
        elapsedMs,
        pageCount: 1,
        browserProduct: 'Chrome/145.0.7632.109',
      })),
    }),
    recoverInterrupted: async () => ({
      recovered: false,
      transactionId: '',
      profileId: PROFILE_ID,
      interruptedStage: '' as const,
      restoredPreviousSignedRecord: false,
      removedUncommittedSignedRecord: false,
      trustedStateRollbackAttempted: false,
    }),
    createRecoveryJournal: () => ({
      begin: async () => {
        events.push('journal-begin')
        return undefined as never
      },
      transition: async (stage: string) => {
        events.push(`journal:${stage}`)
      },
      markSnapshotPersisted: async () => {
        events.push('journal:snapshot-persisted')
      },
      markTrustedStatePublished: async () => {
        events.push('journal:trust-published')
      },
      commit: async () => {
        events.push('journal:commit')
      },
    }),
  }
}

const safeStorage: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value),
  decryptString: (value) => value.toString(),
}

function contextFixture(onClose: () => void): CloakBrowserContextLike {
  return {
    pages: () => [],
    newPage: async () => ({}),
    newCDPSession: async () => ({ send: async () => ({ product: 'Chrome/145.0.7632.109' }) }),
    close: async () => onClose(),
  }
}

function commonInput() {
  const storedProfile = profile()
  const runtimeProfile = buildCloakPilotRuntimeProfile(storedProfile, {
    enabled: true,
    reason: 'enabled',
    profileId: storedProfile.id,
    enabledProfileIds: [storedProfile.id],
    configHash: 'a'.repeat(64),
    configUpdatedAt: NOW.toISOString(),
    cacheDir: CACHE_DIR,
    browserVersion: CLOAK_PILOT_BROWSER_VERSION,
    binarySha256: CLOAK_PILOT_BINARY_SHA256,
  })
  return {
    profile: runtimeProfile.profile,
    pilotCompatibility: runtimeProfile.compatibility,
    proxy: null,
    egress: {
      ok: true,
      source: 'local' as const,
      ip: '203.0.113.25',
      country: 'United States',
      region: 'California',
      city: 'Los Angeles',
      timezone: 'America/Los_Angeles',
      language: 'en-US',
      geolocation: '34.0522, -118.2437',
      egressPathType: 'direct' as const,
      checkedAt: NOW.toISOString(),
    },
    workspace: {
      userDataDir: '/Users/test/profiles/phase5b',
      downloadsDir: '/Users/test/profiles/phase5b/downloads',
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles',
      launchArgs: [],
    },
    cacheDir: CACHE_DIR,
    expectedBinarySha256: SHA,
    desktopAppVersion: '3.6.8',
    hostEnvironment: 'darwin-arm64',
    appPath: '/Applications/Duokai.app',
    resourcesPath: '/Applications/Duokai.app/Contents/Resources',
    temporaryDirectory: '/tmp',
    signingKeyFilePath: '/Users/test/Library/Application Support/Duokai/cloak/key.json',
    signedRecordPath: '/Users/test/profiles/phase5b/trusted.json',
    transactionJournalPath: '/Users/test/profiles/phase5b/transaction.json',
    safeStorage,
  }
}

test('production Pilot commits only after startup evidence and closes browser then transport', async () => {
  const events: string[] = []
  let browserCloseCount = 0
  let transportCloseCount = 0
  const result = await runCloakProductionPilot(
    {
      ...commonInput(),
      verifyStartup: async () => ({
        startupNavigationPassed: true,
        persistentContextPassed: true,
        localeTimezonePassed: true,
        geolocationPassed: true,
        webRtcHostLeakAbsent: true,
        verifiedWebRtcIpObserved: false,
        webRtcCandidateObservation: 'no-candidates',
        detail: { ok: true },
      }),
      publishTrustedState: async () => {
        events.push('publish')
        return {
          rollback: async () => {
            events.push('rollback-publish')
          },
        }
      },
      onTransition: (stage) => {
        events.push(stage)
      },
    },
    {
      ...recoveryDependencies(events),
      preflight: async () => ({
        schemaVersion: 1,
        engine: 'cloakbrowser',
        wrapperVersion: '0.5.2',
        browserVersion: CLOAK_PILOT_BROWSER_VERSION,
        executableChromiumVersion: '145.0.7632.109',
        releaseChannel: 'stable',
        platform: 'darwin-arm64',
        tier: 'free',
        cacheDir: CACHE_DIR,
        binaryPath: BINARY_PATH,
        binarySha256: SHA,
        launchAutoDownload: false,
        fallbackEngine: 'forbidden',
        verifiedAt: NOW.toISOString(),
      }),
      acquireProxy: async () => ({
        config: null,
        bridgeActive: false,
        detail: '',
        egressPathType: 'direct',
        release: async () => {
          transportCloseCount += 1
          events.push('close-transport')
        },
      }),
      launch: async () => ({
        context: contextFixture(() => {
          browserCloseCount += 1
          events.push('close-browser')
        }),
        identity: identity(),
        launchedAt: NOW.toISOString(),
      }),
      createSigningKeyProvider: signingProvider,
      persistRecord: async () => {
        events.push('persist')
        return {
          rollback: async () => {
            events.push('rollback-persist')
          },
        }
      },
    },
  )

  assert.equal(result.session.status, 'trusted')
  assert.equal(events.indexOf('publish') > events.indexOf('startup-verification'), true)
  assert.equal(result.snapshot.evidence.legacyInjectionAbsent, true)
  assert.equal(result.liveness.passed, true)
  assert.equal(result.liveness.sampleCount, 3)
  assert.equal(result.preflight.fallbackEngine, 'forbidden')
  await result.session.close()
  assert.equal(browserCloseCount, 1)
  assert.equal(transportCloseCount, 1)
  assert.deepEqual(events.slice(-2), ['close-browser', 'close-transport'])
})

test('startup verification failure rolls back and never publishes trust', async () => {
  let published = false
  let browserClosed = false
  let transportClosed = false
  await assert.rejects(
    runCloakProductionPilot(
      {
        ...commonInput(),
        verifyStartup: async () => ({
          startupNavigationPassed: false,
          persistentContextPassed: true,
          localeTimezonePassed: true,
          geolocationPassed: true,
          webRtcHostLeakAbsent: true,
          verifiedWebRtcIpObserved: false,
          webRtcCandidateObservation: 'no-candidates',
          detail: { ok: false },
        }),
        publishTrustedState: async () => {
          published = true
          return { rollback: async () => undefined }
        },
      },
      {
        ...recoveryDependencies(),
        preflight: async () => ({
          schemaVersion: 1,
          engine: 'cloakbrowser',
          wrapperVersion: '0.5.2',
          browserVersion: CLOAK_PILOT_BROWSER_VERSION,
          executableChromiumVersion: '145.0.7632.109',
          releaseChannel: 'stable',
          platform: 'darwin-arm64',
          tier: 'free',
          cacheDir: CACHE_DIR,
          binaryPath: BINARY_PATH,
          binarySha256: SHA,
          launchAutoDownload: false,
          fallbackEngine: 'forbidden',
          verifiedAt: NOW.toISOString(),
        }),
        acquireProxy: async () => ({
          config: null,
          bridgeActive: false,
          detail: '',
          egressPathType: 'direct',
          release: async () => {
            transportClosed = true
          },
        }),
        launch: async () => ({
          context: contextFixture(() => {
            browserClosed = true
          }),
          identity: identity(),
          launchedAt: NOW.toISOString(),
        }),
        createSigningKeyProvider: signingProvider,
        persistRecord: async () => ({ rollback: async () => undefined }),
      },
    ),
    /startup-verification/,
  )
  assert.equal(published, false)
  assert.equal(browserClosed, true)
  assert.equal(transportClosed, true)
})

test('sustained liveness failure rolls back and never publishes trust', async () => {
  let published = false
  let browserClosed = false
  let transportClosed = false
  await assert.rejects(
    runCloakProductionPilot(
      {
        ...commonInput(),
        verifyStartup: async () => ({
          startupNavigationPassed: true,
          persistentContextPassed: true,
          localeTimezonePassed: true,
          geolocationPassed: true,
          webRtcHostLeakAbsent: true,
          verifiedWebRtcIpObserved: false,
          webRtcCandidateObservation: 'no-candidates',
          detail: { ok: true },
        }),
        publishTrustedState: async () => {
          published = true
          return { rollback: async () => undefined }
        },
      },
      {
        ...recoveryDependencies(),
        verifyLiveness: async () => {
          throw new Error('Cloak sustained liveness window failed.')
        },
        preflight: async () => ({
          schemaVersion: 1,
          engine: 'cloakbrowser',
          wrapperVersion: '0.5.2',
          browserVersion: CLOAK_PILOT_BROWSER_VERSION,
          executableChromiumVersion: '145.0.7632.109',
          releaseChannel: 'stable',
          platform: 'darwin-arm64',
          tier: 'free',
          cacheDir: CACHE_DIR,
          binaryPath: BINARY_PATH,
          binarySha256: SHA,
          launchAutoDownload: false,
          fallbackEngine: 'forbidden',
          verifiedAt: NOW.toISOString(),
        }),
        acquireProxy: async () => ({
          config: null,
          bridgeActive: false,
          detail: '',
          egressPathType: 'direct',
          release: async () => {
            transportClosed = true
          },
        }),
        launch: async () => ({
          context: contextFixture(() => {
            browserClosed = true
          }),
          identity: identity(),
          launchedAt: NOW.toISOString(),
        }),
        createSigningKeyProvider: signingProvider,
        persistRecord: async () => ({ rollback: async () => undefined }),
      },
    ),
    /liveness window failed/,
  )
  assert.equal(published, false)
  assert.equal(browserClosed, true)
  assert.equal(transportClosed, true)
})

test('tampered existing signed evidence blocks before delivery preflight or browser launch', async () => {
  let preflightCalled = false
  let launchCalled = false
  await assert.rejects(
    runCloakProductionPilot(
      {
        ...commonInput(),
        verifyStartup: async () => {
          throw new Error('startup should not run')
        },
        publishTrustedState: async () => {
          throw new Error('publication should not run')
        },
      },
      {
        ...recoveryDependencies(),
        verifyExistingRecord: async () => {
          throw new Error('Cloak trusted-snapshot signature verification failed.')
        },
        preflight: async () => {
          preflightCalled = true
          throw new Error('preflight should not run')
        },
        launch: async () => {
          launchCalled = true
          throw new Error('launch should not run')
        },
        createSigningKeyProvider: signingProvider,
      },
    ),
    /signature verification failed/,
  )
  assert.equal(preflightCalled, false)
  assert.equal(launchCalled, false)
})
