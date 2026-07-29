import { access, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ProfileRecord, ProxyRecord } from '../../src/shared/types.ts'
import type { EgressPathCandidate } from './egressPaths.ts'
import {
  applyCloakFingerprintMappingToLaunchRequest,
  buildCloakFingerprintMapping,
  CLOAK_FINGERPRINT_MAPPING_VERSION,
  type CloakFingerprintMapping,
} from './cloakBrowserFingerprint.ts'
import type { CloakInstallPreflightReceipt } from './cloakBrowserInstallPreflight.ts'
import {
  verifyCloakBrowserInstallation,
  type CloakInstallationReceipt,
} from './cloakBrowserInstallationManager.ts'
import {
  applyCloakNetworkMappingToLaunchRequest,
  buildCloakNetworkMapping,
  type CloakNetworkMapping,
  type CloakVerifiedEgressIdentity,
} from './cloakBrowserNetwork.ts'
import {
  CloakProductionTransactionError,
  runCloakProductionTransaction,
  type CloakProductionSession,
  type CloakProductionTransactionStage,
  type CloakRollbackHandle,
} from './cloakBrowserProductionTransaction.ts'
import {
  CLOAK_PILOT_BROWSER_VERSION,
} from './cloakBrowserInstallPreflight.ts'
import {
  launchCloakPersistentContext,
  type CloakBrowserContextLike,
  type CloakRuntimeLaunchResult,
  type CloakRuntimeLaunchRequest,
} from './cloakBrowserRuntime.ts'
import {
  verifyCloakContextLiveness,
  type CloakLivenessEvidence,
  type CloakLivenessPolicy,
} from './cloakBrowserLiveness.ts'
import {
  readCloakSignedTrustedIdentityRecord,
  signCloakTrustedIdentitySnapshot,
  writeCloakSignedTrustedIdentityRecordAtomic,
  type CloakSignedTrustedIdentityRecord,
  type CloakSnapshotSigningKeyProvider,
  type SafeStorageLike,
} from './cloakBrowserSnapshotSignature.ts'
import {
  buildCloakTrustedIdentitySnapshot,
  type CloakTrustedIdentitySnapshot,
  type CloakTrustedLaunchEvidence,
} from './cloakBrowserTrustedSnapshot.ts'
import {
  acquireLaunchProxy,
  type LaunchProxyLease,
} from './proxyBridge.ts'
import type { CloakPilotCompatibilityReceipt } from './cloakBrowserPilotConfig.ts'
import { ElectronSafeStorageSigningKeyringProvider } from './cloakBrowserSnapshotKeyLifecycle.ts'
import {
  CloakTransactionRecoveryJournal,
  recoverInterruptedCloakProductionTransaction,
  type CloakTransactionJournalRecord,
} from './cloakBrowserTransactionRecovery.ts'

export interface CloakPilotWorkspaceLaunch {
  userDataDir: string
  downloadsDir: string
  viewport: { width: number; height: number } | null
  locale: string
  timezoneId: string
  launchArgs?: string[]
}

export interface CloakPilotStartupVerification {
  startupNavigationPassed: boolean
  persistentContextPassed: boolean
  localeTimezonePassed: boolean
  geolocationPassed: boolean
  webRtcHostLeakAbsent: boolean
  verifiedWebRtcIpObserved: boolean
  webRtcCandidateObservation: CloakTrustedLaunchEvidence['webRtcCandidateObservation']
  detail: unknown
}

export interface CloakProductionPilotInput {
  profile: ProfileRecord
  proxy: ProxyRecord | null
  egress: CloakVerifiedEgressIdentity
  egressPath?: EgressPathCandidate
  workspace: CloakPilotWorkspaceLaunch
  cacheDir: string
  expectedBinarySha256: string
  desktopAppVersion: string
  hostEnvironment: string
  appPath: string
  resourcesPath: string
  temporaryDirectory: string
  signingKeyFilePath: string
  signedRecordPath: string
  transactionJournalPath: string
  safeStorage: SafeStorageLike
  pilotCompatibility: CloakPilotCompatibilityReceipt
  livenessPolicy?: CloakLivenessPolicy
  verifyStartup(input: {
    context: CloakBrowserContextLike
    fingerprintMapping: CloakFingerprintMapping
    networkMapping: CloakNetworkMapping
  }): Promise<CloakPilotStartupVerification>
  publishTrustedState(input: {
    record: CloakSignedTrustedIdentityRecord
    snapshot: CloakTrustedIdentitySnapshot
    startup: CloakPilotStartupVerification
  }): Promise<CloakRollbackHandle>
  rollbackInterruptedTrustedState?: (
    journal: Readonly<CloakTransactionJournalRecord>,
  ) => Promise<void>
  isCancelled?: () => boolean
  onTransition?: (stage: CloakProductionTransactionStage) => void | Promise<void>
}

export interface CloakProductionPilotResult {
  session: CloakProductionSession
  context: CloakBrowserContextLike
  launch: CloakRuntimeLaunchResult
  preflight: CloakInstallPreflightReceipt
  installationReceipt: CloakInstallationReceipt | null
  fingerprintMapping: CloakFingerprintMapping
  networkMapping: CloakNetworkMapping
  startup: CloakPilotStartupVerification
  liveness: CloakLivenessEvidence
  snapshot: CloakTrustedIdentitySnapshot
}

interface CloakTransactionRecoveryJournalLike {
  begin(): Promise<CloakTransactionJournalRecord>
  transition(stage: CloakProductionTransactionStage): Promise<void>
  markSnapshotPersisted(record: CloakSignedTrustedIdentityRecord): Promise<void>
  markTrustedStatePublished(): Promise<void>
  commit(): Promise<void>
}

export interface CloakProductionPilotDependencies {
  verifyInstallation?: typeof verifyCloakBrowserInstallation
  preflight?: (input: {
    cacheDir: string
    expectedBinarySha256: string
    browserVersion: string
    environment: {
      appPath: string
      resourcesPath: string
      temporaryDirectory: string
    }
  }) => Promise<CloakInstallPreflightReceipt>
  acquireProxy?: typeof acquireLaunchProxy
  launch?: typeof launchCloakPersistentContext
  verifyLiveness?: typeof verifyCloakContextLiveness
  createSigningKeyProvider?: (input: CloakProductionPilotInput) => CloakSnapshotSigningKeyProvider
  verifyExistingRecord?: (
    filePath: string,
    provider: CloakSnapshotSigningKeyProvider,
    profileId: string,
  ) => Promise<void>
  persistRecord?: (
    filePath: string,
    record: CloakSignedTrustedIdentityRecord,
    provider: CloakSnapshotSigningKeyProvider,
  ) => Promise<CloakRollbackHandle>
  recoverInterrupted?: typeof recoverInterruptedCloakProductionTransaction
  createRecoveryJournal?: (
    input: CloakProductionPilotInput,
  ) => CloakTransactionRecoveryJournalLike
}

function assertAbsoluteDirectory(value: string, label: string): string {
  if (!path.isAbsolute(value)) {
    throw new Error(`${label} must be absolute.`)
  }
  return path.resolve(value)
}

async function persistRecordWithRollback(
  filePath: string,
  record: CloakSignedTrustedIdentityRecord,
  provider: CloakSnapshotSigningKeyProvider,
): Promise<CloakRollbackHandle> {
  let previous: Buffer | null = null
  try {
    previous = await readFile(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  await writeCloakSignedTrustedIdentityRecordAtomic(filePath, record, provider)
  return {
    rollback: async () => {
      if (previous) {
        await writeFile(filePath, previous, { mode: 0o600 })
      } else {
        await rm(filePath, { force: true })
      }
    },
  }
}

export function shouldRebuildExistingCloakSnapshot(
  value: unknown,
  profileId: string,
): boolean {
  const snapshot =
    value && typeof value === 'object' && 'snapshot' in value
      ? (value as { snapshot?: unknown }).snapshot
      : null
  if (!snapshot || typeof snapshot !== 'object') {
    return false
  }
  const snapshotProfileId = String(
    (snapshot as { profileId?: unknown }).profileId || '',
  ).trim()
  if (snapshotProfileId && snapshotProfileId !== profileId) {
    throw new Error('Existing signed Cloak snapshot belongs to a different Profile ID.')
  }
  const mapping = (snapshot as { fingerprintMapping?: unknown }).fingerprintMapping
  if (!mapping || typeof mapping !== 'object') {
    return false
  }
  const schemaVersion = Number(
    (mapping as { schemaVersion?: unknown }).schemaVersion,
  )
  return (
    Number.isFinite(schemaVersion) &&
    schemaVersion !== CLOAK_FINGERPRINT_MAPPING_VERSION
  )
}

async function verifyExistingRecordIfPresent(
  filePath: string,
  provider: CloakSnapshotSigningKeyProvider,
  profileId: string,
): Promise<void> {
  try {
    await access(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  const rawRecord = JSON.parse(await readFile(filePath, 'utf8')) as unknown
  if (shouldRebuildExistingCloakSnapshot(rawRecord, profileId)) {
    return
  }
  const record = await readCloakSignedTrustedIdentityRecord(filePath, provider)
  if (record.snapshot.profileId !== profileId) {
    throw new Error('Existing signed Cloak snapshot belongs to a different Profile ID.')
  }
}

function runtimeMatchesPreflight(
  launch: CloakRuntimeLaunchResult,
  preflight: CloakInstallPreflightReceipt,
): void {
  const identity = launch.identity
  if (
    identity.engine !== 'cloakbrowser' ||
    identity.requestedChromiumVersion !== preflight.browserVersion ||
    identity.installedChromiumVersion !== preflight.browserVersion ||
    path.resolve(identity.binaryPath) !== path.resolve(preflight.binaryPath) ||
    identity.binarySha256.toLowerCase() !== preflight.binarySha256.toLowerCase() ||
    identity.releaseChannel !== preflight.releaseChannel
  ) {
    throw new Error('Running Cloak identity does not match the install preflight receipt.')
  }
}

function buildLaunchRequest(
  input: CloakProductionPilotInput,
  fingerprintMapping: CloakFingerprintMapping,
  networkMapping: CloakNetworkMapping,
): CloakRuntimeLaunchRequest {
  let request: CloakRuntimeLaunchRequest = {
    userDataDir: assertAbsoluteDirectory(input.workspace.userDataDir, 'userDataDir'),
    downloadsDir: assertAbsoluteDirectory(input.workspace.downloadsDir, 'downloadsDir'),
    cacheDir: assertAbsoluteDirectory(input.cacheDir, 'cacheDir'),
    locale: input.workspace.locale,
    timezoneId: input.workspace.timezoneId,
    fingerprintSeed: fingerprintMapping.fingerprintSeed,
    browserVersion: CLOAK_PILOT_BROWSER_VERSION,
    viewport: input.workspace.viewport,
    deviceMode: input.profile.fingerprintConfig.advanced.deviceMode,
    extraArgs: input.workspace.launchArgs ?? [],
  }
  request = applyCloakFingerprintMappingToLaunchRequest(request, fingerprintMapping)
  return applyCloakNetworkMappingToLaunchRequest(request, networkMapping)
}

export async function runCloakProductionPilot(
  input: CloakProductionPilotInput,
  dependencies: CloakProductionPilotDependencies = {},
): Promise<CloakProductionPilotResult> {
  let preflight: CloakInstallPreflightReceipt | null = null
  let installationReceipt: CloakInstallationReceipt | null = null
  let proxyLease: LaunchProxyLease | null = null
  let launch: CloakRuntimeLaunchResult | null = null
  let fingerprintMapping: CloakFingerprintMapping | null = null
  let networkMapping: CloakNetworkMapping | null = null
  let startup: CloakPilotStartupVerification | null = null
  let liveness: CloakLivenessEvidence | null = null
  let snapshot: CloakTrustedIdentitySnapshot | null = null

  const keyProvider =
    dependencies.createSigningKeyProvider?.(input) ??
    new ElectronSafeStorageSigningKeyringProvider({
      keyFilePath: input.signingKeyFilePath,
      loadSafeStorage: async () => input.safeStorage,
      platform: process.platform,
    })

  await (dependencies.recoverInterrupted ?? recoverInterruptedCloakProductionTransaction)({
    journalPath: input.transactionJournalPath,
    signedRecordPath: input.signedRecordPath,
    profileId: input.profile.id,
    rollbackTrustedState: input.rollbackInterruptedTrustedState,
  })

  await (dependencies.verifyExistingRecord ?? verifyExistingRecordIfPresent)(
    input.signedRecordPath,
    keyProvider,
    input.profile.id,
  )

  const recoveryJournal =
    dependencies.createRecoveryJournal?.(input) ??
    new CloakTransactionRecoveryJournal({
      journalPath: input.transactionJournalPath,
      signedRecordPath: input.signedRecordPath,
      profileId: input.profile.id,
    })
  await recoveryJournal.begin()

  let session: CloakProductionSession
  try {
    session = await runCloakProductionTransaction(input.profile.id, {
    isCancelled: input.isCancelled,
    onTransition: async (stage) => {
      await recoveryJournal.transition(stage)
      await input.onTransition?.(stage)
      if (stage === 'trusted') {
        await recoveryJournal.commit()
      }
    },
    preflightDelivery: async () => {
      const request = {
        cacheDir: input.cacheDir,
        expectedBinarySha256: input.expectedBinarySha256,
        browserVersion: CLOAK_PILOT_BROWSER_VERSION,
        environment: {
          appPath: input.appPath,
          resourcesPath: input.resourcesPath,
          temporaryDirectory: input.temporaryDirectory,
        },
      }
      if (dependencies.preflight) {
        preflight = await dependencies.preflight(request)
      } else {
        const verified = await (dependencies.verifyInstallation ?? verifyCloakBrowserInstallation)(
          request,
        )
        installationReceipt = verified.receipt
        preflight = verified.preflight
      }
      if (!preflight) {
        throw new Error('Cloak installation verification did not return a preflight receipt.')
      }
      return installationReceipt ?? preflight
    },
    verifyNetwork: async () => {
      if (!input.egress.ok) {
        throw new Error('Cloak Pilot requires a successful verified egress identity.')
      }
      return input.egress
    },
    acquireTransport: async () => {
      proxyLease = await (dependencies.acquireProxy ?? acquireLaunchProxy)(input.proxy, {
        egressPath: input.egressPath,
      })
      return { close: proxyLease.release }
    },
    launchBrowser: async () => {
      if (!preflight || !proxyLease) throw new Error('Cloak Pilot preflight or transport is missing.')
      networkMapping = buildCloakNetworkMapping({
        profileId: input.profile.id,
        proxySettings: input.profile.fingerprintConfig.proxySettings,
        webrtcMode: input.profile.fingerprintConfig.webrtcMode,
        proxy: input.proxy,
        egress: input.egress,
        transport: {
          config: proxyLease.config,
          bridgeActive: proxyLease.bridgeActive,
          egressPathType: proxyLease.egressPathType,
          detail: proxyLease.detail,
        },
      })
      fingerprintMapping = buildCloakFingerprintMapping({
        profileId: input.profile.id,
        fingerprintConfig: input.profile.fingerprintConfig,
        browserVersion: CLOAK_PILOT_BROWSER_VERSION,
        resolvedLocale: input.egress.language,
        resolvedTimezone: input.egress.timezone,
        resolvedGeolocation: networkMapping.geolocation,
        verifiedWebRtcIp: networkMapping.verifiedWebRtcIp,
      })
      launch = await (dependencies.launch ?? launchCloakPersistentContext)(
        buildLaunchRequest(input, fingerprintMapping, networkMapping),
      )
      let closed = false
      return {
        close: async () => {
          if (closed) return
          closed = true
          await launch?.context.close()
        },
      }
    },
    verifyRuntime: async () => {
      if (!launch || !preflight) throw new Error('Cloak runtime identity is unavailable.')
      runtimeMatchesPreflight(launch, preflight)
      return launch.identity
    },
    verifyStartup: async () => {
      if (!launch || !fingerprintMapping || !networkMapping) {
        throw new Error('Cloak startup verification prerequisites are unavailable.')
      }
      startup = await input.verifyStartup({
        context: launch.context,
        fingerprintMapping,
        networkMapping,
      })
      if (
        !startup.startupNavigationPassed ||
        !startup.persistentContextPassed ||
        !startup.localeTimezonePassed ||
        !startup.geolocationPassed ||
        !startup.webRtcHostLeakAbsent
      ) {
        throw new Error('Cloak Pilot startup verification did not satisfy the trusted evidence policy.')
      }
      liveness = await (dependencies.verifyLiveness ?? verifyCloakContextLiveness)(
        launch.context,
        input.livenessPolicy,
        { isCancelled: input.isCancelled },
      )
      if (!liveness.passed) {
        throw new Error('Cloak Pilot sustained liveness verification did not pass.')
      }
      return startup
    },
    buildSignedRecord: async () => {
      if (!launch || !fingerprintMapping || !networkMapping || !startup || !liveness) {
        throw new Error('Cloak trusted snapshot prerequisites are unavailable.')
      }
      snapshot = buildCloakTrustedIdentitySnapshot({
        profileId: input.profile.id,
        desktopAppVersion: input.desktopAppVersion,
        hostEnvironment: input.hostEnvironment,
        runtimeIdentity: launch.identity,
        fingerprintMapping,
        networkMapping,
        pilotCompatibility: input.pilotCompatibility,
        evidence: {
          runtimeIdentityPassed: true,
          persistentContextPassed: startup.persistentContextPassed && liveness.passed,
          startupNavigationPassed: startup.startupNavigationPassed,
          networkRoutePassed: input.egress.ok,
          credentialRedactionPassed: true,
          localeTimezonePassed: startup.localeTimezonePassed,
          geolocationPassed: startup.geolocationPassed,
          webRtcHostLeakAbsent: startup.webRtcHostLeakAbsent,
          verifiedWebRtcIpObserved: startup.verifiedWebRtcIpObserved,
          webRtcCandidateObservation: startup.webRtcCandidateObservation,
          legacyInjectionAbsent: true,
        },
      })
      return await signCloakTrustedIdentitySnapshot(snapshot, keyProvider, new Date())
    },
    persistSignedRecord: async (context) => {
      if (!context.signedRecord) throw new Error('Signed Cloak record is unavailable.')
      const rollbackHandle = await (dependencies.persistRecord ?? persistRecordWithRollback)(
        input.signedRecordPath,
        context.signedRecord,
        keyProvider,
      )
      try {
        await recoveryJournal.markSnapshotPersisted(context.signedRecord)
        return rollbackHandle
      } catch (error) {
        await rollbackHandle.rollback()
        throw error
      }
    },
    publishTrustedState: async (context) => {
      if (!context.signedRecord || !snapshot || !startup) {
        throw new Error('Cloak trust publication prerequisites are unavailable.')
      }
      const rollbackHandle = await input.publishTrustedState({
        record: context.signedRecord,
        snapshot,
        startup,
      })
      try {
        await recoveryJournal.markTrustedStatePublished()
        return rollbackHandle
      } catch (error) {
        await rollbackHandle.rollback()
        throw error
      }
    },
    })
  } catch (error) {
    if (
      error instanceof CloakProductionTransactionError &&
      error.rollbackErrors.length === 0
    ) {
      await (dependencies.recoverInterrupted ?? recoverInterruptedCloakProductionTransaction)({
        journalPath: input.transactionJournalPath,
        signedRecordPath: input.signedRecordPath,
        profileId: input.profile.id,
      })
    }
    throw error
  }

  const committed = {
    preflight: preflight as CloakInstallPreflightReceipt | null,
    installationReceipt: installationReceipt as CloakInstallationReceipt | null,
    launch: launch as CloakRuntimeLaunchResult | null,
    fingerprintMapping: fingerprintMapping as CloakFingerprintMapping | null,
    networkMapping: networkMapping as CloakNetworkMapping | null,
    startup: startup as CloakPilotStartupVerification | null,
    liveness: liveness as CloakLivenessEvidence | null,
    snapshot: snapshot as CloakTrustedIdentitySnapshot | null,
  }
  if (
    !committed.preflight ||
    !committed.launch ||
    !committed.fingerprintMapping ||
    !committed.networkMapping ||
    !committed.startup ||
    !committed.liveness ||
    !committed.snapshot
  ) {
    await session.close()
    throw new Error('Cloak Pilot transaction completed without all committed artifacts.')
  }

  return {
    session,
    context: committed.launch.context,
    launch: committed.launch,
    preflight: committed.preflight,
    installationReceipt: committed.installationReceipt,
    fingerprintMapping: committed.fingerprintMapping,
    networkMapping: committed.networkMapping,
    startup: committed.startup,
    liveness: committed.liveness,
    snapshot: committed.snapshot,
  }
}
