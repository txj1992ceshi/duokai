import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'

import type { ProxyRecord } from '../../src/shared/types.ts'
import {
  ElectronSafeStorageSigningKeyProvider,
  type CloakSignedTrustedIdentityRecord,
  type SafeStorageLike,
} from './cloakBrowserSnapshotSignature.ts'
import { ElectronSafeStorageSigningKeyringProvider } from './cloakBrowserSnapshotKeyLifecycle.ts'
import {
  CloakTransactionRecoveryJournal,
  readCloakTransactionJournal,
  recoverInterruptedCloakProductionTransaction,
} from './cloakBrowserTransactionRecovery.ts'
import {
  acquireLaunchProxy,
  closeAllProxyBridges,
  getProxyBridgeDiagnostics,
} from './proxyBridge.ts'

export interface CloakPackagedDiagnosticInput {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
  temporaryDirectory: string
  safeStorage: SafeStorageLike
  environment?: NodeJS.ProcessEnv
  argv?: string[]
  now?: () => Date
}

export interface CloakPackagedDiagnosticResult {
  schemaVersion: 2
  success: boolean
  packaged: boolean
  startedAt: string
  finishedAt: string
  safeStorage: {
    encryptionAvailable: boolean
    selectedBackend: string
    keyStableAcrossReload: boolean
    sealedKeyMode: string
    plaintextSecretAbsent: boolean
    sealedKeyPath: string
    keyringSchemaVersion: number
    legacyMigrationPassed: boolean
    rotationPassed: boolean
    retiredKeyReadable: boolean
  }
  recovery: {
    interruptedSnapshotRecovered: boolean
    uncommittedRecordRemoved: boolean
    journalCleared: boolean
  }
  proxyBridge: {
    sameEndpointAcrossLeases: boolean
    listenerReachableBeforeRelease: boolean
    referencesAtPeak: number
    referencesAfterFirstRelease: number
    activeBridgesAfterFinalRelease: number
    listenerClosedAfterFinalRelease: boolean
  }
  failures: Array<{ stage: string; message: string }>
}

function isInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const directory = path.dirname(filePath)
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  )
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function probeLoopbackPort(port: number, expectReachable: boolean): Promise<boolean> {
  const reached = await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, 1_000)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
  return expectReachable ? reached : !reached
}

function fixtureProxy(now: string): ProxyRecord {
  return {
    id: 'cloak-packaged-diagnostic-proxy',
    name: 'Cloak packaged diagnostic proxy',
    type: 'http',
    host: '127.0.0.1',
    port: 65534,
    username: '',
    password: '',
    status: 'unknown',
    lastCheckedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

function readCommandLineValue(argv: string[], name: string): string {
  const exact = `--${name}`
  const prefix = `${exact}=`
  const inline = argv.find((argument) => argument.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = argv.indexOf(exact)
  return index >= 0 ? String(argv[index + 1] || '') : ''
}

export async function runCloakPackagedDiagnosticIfRequested(
  input: CloakPackagedDiagnosticInput,
): Promise<{ handled: boolean; success: boolean; outputPath?: string }> {
  const environment = input.environment ?? process.env
  const argv = input.argv ?? process.argv
  const commandLineRequested = argv.includes('--duokai-cloak-packaged-diagnostic')
  if (environment.DUOKAI_CLOAK_PACKAGED_DIAGNOSTIC !== '1' && !commandLineRequested) {
    return { handled: false, success: true }
  }

  const rootValue =
    String(environment.DUOKAI_CLOAK_PACKAGED_DIAGNOSTIC_ROOT || '').trim() ||
    readCommandLineValue(argv, 'duokai-cloak-packaged-diagnostic-root').trim()
  const outputValue =
    String(environment.DUOKAI_CLOAK_PACKAGED_DIAGNOSTIC_OUTPUT || '').trim() ||
    readCommandLineValue(argv, 'duokai-cloak-packaged-diagnostic-output').trim()
  const rootPath = path.resolve(rootValue)
  const outputPath = path.resolve(outputValue)
  if (
    !input.isPackaged ||
    !path.isAbsolute(rootValue) ||
    !path.isAbsolute(outputValue) ||
    !isInside(input.temporaryDirectory, rootPath) ||
    !isInside(rootPath, outputPath)
  ) {
    throw new Error(
      'Packaged Cloak diagnostic requires a packaged app and absolute output paths inside the OS temporary directory.',
    )
  }

  const now = input.now ?? (() => new Date())
  const startedAt = now().toISOString()
  const failures: CloakPackagedDiagnosticResult['failures'] = []
  const keyFilePath = path.join(rootPath, 'sealed-cloak-signing-key.json')
  const result: CloakPackagedDiagnosticResult = {
    schemaVersion: 2,
    success: false,
    packaged: input.isPackaged,
    startedAt,
    finishedAt: startedAt,
    safeStorage: {
      encryptionAvailable: false,
      selectedBackend: '',
      keyStableAcrossReload: false,
      sealedKeyMode: '',
      plaintextSecretAbsent: false,
      sealedKeyPath: keyFilePath,
      keyringSchemaVersion: 0,
      legacyMigrationPassed: false,
      rotationPassed: false,
      retiredKeyReadable: false,
    },
    recovery: {
      interruptedSnapshotRecovered: false,
      uncommittedRecordRemoved: false,
      journalCleared: false,
    },
    proxyBridge: {
      sameEndpointAcrossLeases: false,
      listenerReachableBeforeRelease: false,
      referencesAtPeak: 0,
      referencesAfterFirstRelease: 0,
      activeBridgesAfterFinalRelease: -1,
      listenerClosedAfterFinalRelease: false,
    },
    failures,
  }

  await mkdir(rootPath, { recursive: true })
  try {
    try {
      const legacyProvider = new ElectronSafeStorageSigningKeyProvider({
        keyFilePath,
        loadSafeStorage: async () => input.safeStorage,
        platform: process.platform,
      })
      const legacyKey = await legacyProvider.getActiveKey()
      const keyringProvider = new ElectronSafeStorageSigningKeyringProvider({
        keyFilePath,
        loadSafeStorage: async () => input.safeStorage,
        platform: process.platform,
      })
      const migratedKey = await keyringProvider.getActiveKey()
      await keyringProvider.rotate()
      const rotatedKey = await keyringProvider.getActiveKey()
      const retiredKey = await keyringProvider.getKey(legacyKey.keyId)
      const reloadProvider = new ElectronSafeStorageSigningKeyringProvider({
        keyFilePath,
        loadSafeStorage: async () => input.safeStorage,
        platform: process.platform,
      })
      const reloadedKey = await reloadProvider.getActiveKey()
      const sealedText = await readFile(keyFilePath, 'utf8')
      const sealedJson = JSON.parse(sealedText) as { schemaVersion?: number }
      const keyMode = (await stat(keyFilePath)).mode & 0o777
      result.safeStorage = {
        encryptionAvailable: input.safeStorage.isEncryptionAvailable(),
        selectedBackend: input.safeStorage.getSelectedStorageBackend?.() ?? 'platform-default',
        keyStableAcrossReload:
          rotatedKey.keyId === reloadedKey.keyId && rotatedKey.secret.equals(reloadedKey.secret),
        sealedKeyMode: keyMode.toString(8).padStart(3, '0'),
        plaintextSecretAbsent:
          !sealedText.includes(legacyKey.secret.toString('base64')) &&
          !sealedText.includes(rotatedKey.secret.toString('base64')),
        sealedKeyPath: keyFilePath,
        keyringSchemaVersion: Number(sealedJson.schemaVersion ?? 0),
        legacyMigrationPassed:
          legacyKey.keyId === migratedKey.keyId && legacyKey.secret.equals(migratedKey.secret),
        rotationPassed: rotatedKey.keyId !== legacyKey.keyId,
        retiredKeyReadable:
          retiredKey?.keyId === legacyKey.keyId && retiredKey.secret.equals(legacyKey.secret),
      }
      if (
        !result.safeStorage.encryptionAvailable ||
        !result.safeStorage.keyStableAcrossReload ||
        !result.safeStorage.plaintextSecretAbsent ||
        result.safeStorage.sealedKeyMode !== '600' ||
        result.safeStorage.keyringSchemaVersion !== 2 ||
        !result.safeStorage.legacyMigrationPassed ||
        !result.safeStorage.rotationPassed ||
        !result.safeStorage.retiredKeyReadable
      ) {
        throw new Error('Electron safeStorage keyring packaged assertions failed.')
      }
    } catch (error) {
      failures.push({
        stage: 'safe-storage-keyring',
        message: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      const profileId = 'cloak-packaged-diagnostic-profile'
      const signedRecordPath = path.join(rootPath, 'recovery-trusted-identity.json')
      const journalPath = path.join(rootPath, 'recovery-transaction.json')
      const journal = new CloakTransactionRecoveryJournal({
        profileId,
        signedRecordPath,
        journalPath,
      })
      await journal.begin()
      await journal.transition('snapshot-persistence')
      await writeFile(signedRecordPath, 'uncommitted-record\n', { mode: 0o600 })
      await journal.markSnapshotPersisted({
        schemaVersion: 1,
        snapshot: { profileId, snapshotId: 'packaged-interrupted-snapshot' },
        signature: { payloadSha256: 'a'.repeat(64) },
      } as unknown as CloakSignedTrustedIdentityRecord)
      const recovered = await recoverInterruptedCloakProductionTransaction({
        profileId,
        signedRecordPath,
        journalPath,
      })
      let signedRecordRemoved = false
      try {
        await stat(signedRecordPath)
      } catch (error) {
        signedRecordRemoved = (error as NodeJS.ErrnoException).code === 'ENOENT'
      }
      result.recovery = {
        interruptedSnapshotRecovered: recovered.recovered,
        uncommittedRecordRemoved:
          recovered.removedUncommittedSignedRecord && signedRecordRemoved,
        journalCleared: (await readCloakTransactionJournal(journalPath)) === null,
      }
      if (
        !result.recovery.interruptedSnapshotRecovered ||
        !result.recovery.uncommittedRecordRemoved ||
        !result.recovery.journalCleared
      ) {
        throw new Error('Packaged transaction recovery assertions failed.')
      }
    } catch (error) {
      failures.push({
        stage: 'transaction-recovery',
        message: error instanceof Error ? error.message : String(error),
      })
    }

    try {
      const proxy = fixtureProxy(startedAt)
      const first = await acquireLaunchProxy(proxy)
      const second = await acquireLaunchProxy(proxy)
      const firstServer = first.config?.server || ''
      const secondServer = second.config?.server || ''
      const port = Number(new URL(firstServer).port)
      result.proxyBridge.sameEndpointAcrossLeases = firstServer === secondServer
      result.proxyBridge.listenerReachableBeforeRelease = await probeLoopbackPort(port, true)
      result.proxyBridge.referencesAtPeak = (await getProxyBridgeDiagnostics()).totalLeaseCount
      await first.release()
      result.proxyBridge.referencesAfterFirstRelease = (
        await getProxyBridgeDiagnostics()
      ).totalLeaseCount
      await second.release()
      result.proxyBridge.activeBridgesAfterFinalRelease = (
        await getProxyBridgeDiagnostics()
      ).activeBridgeCount
      result.proxyBridge.listenerClosedAfterFinalRelease = await probeLoopbackPort(port, false)
      if (
        !result.proxyBridge.sameEndpointAcrossLeases ||
        !result.proxyBridge.listenerReachableBeforeRelease ||
        result.proxyBridge.referencesAtPeak !== 2 ||
        result.proxyBridge.referencesAfterFirstRelease !== 1 ||
        result.proxyBridge.activeBridgesAfterFinalRelease !== 0 ||
        !result.proxyBridge.listenerClosedAfterFinalRelease
      ) {
        throw new Error('Packaged proxy bridge lifecycle assertions failed.')
      }
    } catch (error) {
      failures.push({
        stage: 'proxy-bridge',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      await closeAllProxyBridges()
    }
  } finally {
    result.finishedAt = now().toISOString()
    result.success = failures.length === 0
    await atomicWriteJson(outputPath, result)
  }

  return { handled: true, success: result.success, outputPath }
}
