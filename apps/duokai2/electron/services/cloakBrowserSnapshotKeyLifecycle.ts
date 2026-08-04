import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  CLOAK_SIGNING_KEY_FILE_VERSION,
  CloakSnapshotSignatureError,
  createInMemoryCloakSigningKey,
  type CloakSnapshotSigningKey,
  type CloakSnapshotSigningKeyProvider,
  type SafeStorageLike,
} from './cloakBrowserSnapshotSignature.ts'

export const CLOAK_SIGNING_KEYRING_FILE_VERSION = 2
export const DEFAULT_CLOAK_RETIRED_SIGNING_KEY_LIMIT = 2

export type CloakSigningKeyStatus = 'active' | 'retired'

interface SealedKeyringEntry {
  keyId: string
  createdAt: string
  status: CloakSigningKeyStatus
  retiredAt?: string
  encryptedSecretBase64: string
}

interface SealedSigningKeyringFile {
  schemaVersion: typeof CLOAK_SIGNING_KEYRING_FILE_VERSION
  activeKeyId: string
  updatedAt: string
  keys: SealedKeyringEntry[]
}

interface LegacySealedSigningKeyFile {
  schemaVersion: typeof CLOAK_SIGNING_KEY_FILE_VERSION
  keyId: string
  createdAt: string
  encryptedSecretBase64: string
}

export interface CloakSigningKeyringMetadata {
  schemaVersion: typeof CLOAK_SIGNING_KEYRING_FILE_VERSION
  activeKeyId: string
  updatedAt: string
  keys: Array<{
    keyId: string
    createdAt: string
    status: CloakSigningKeyStatus
    retiredAt?: string
  }>
}

export interface ElectronSafeStorageSigningKeyringProviderOptions {
  keyFilePath: string
  loadSafeStorage?: () => Promise<SafeStorageLike>
  platform?: NodeJS.Platform
  now?: () => Date
  randomKey?: () => Buffer
  maxRetiredKeys?: number
}

function trim(value: unknown): string {
  return String(value ?? '').trim()
}

function assertCanonicalBase64(value: string, label: string): void {
  if (!value || Buffer.from(value, 'base64').toString('base64') !== value) {
    throw new CloakSnapshotSignatureError(
      'signing_key_unavailable',
      `${label} must be canonical base64.`,
    )
  }
}

function assertDate(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new CloakSnapshotSignatureError(
      'signing_key_unavailable',
      `${label} must be an ISO timestamp.`,
    )
  }
}

async function defaultLoadSafeStorage(): Promise<SafeStorageLike> {
  const electron = (await import('electron')) as unknown as { safeStorage?: SafeStorageLike }
  if (!electron.safeStorage) {
    throw new CloakSnapshotSignatureError(
      'signing_key_unavailable',
      'Electron safeStorage is unavailable in the current process.',
    )
  }
  return electron.safeStorage
}

async function fsyncDirectory(directoryPath: string): Promise<void> {
  if (process.platform === 'win32') return
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
    const handle = await open(temporaryPath, 'r+')
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

function cloneRing(ring: SealedSigningKeyringFile): SealedSigningKeyringFile {
  return {
    ...ring,
    keys: ring.keys.map((key) => ({ ...key })),
  }
}

function validateRing(ring: SealedSigningKeyringFile): void {
  if (
    ring.schemaVersion !== CLOAK_SIGNING_KEYRING_FILE_VERSION ||
    !trim(ring.activeKeyId) ||
    !Array.isArray(ring.keys) ||
    ring.keys.length === 0
  ) {
    throw new CloakSnapshotSignatureError(
      'signing_key_unavailable',
      'Sealed Cloak signing-key keyring metadata is invalid.',
    )
  }
  assertDate(ring.updatedAt, 'keyring.updatedAt')
  const ids = new Set<string>()
  let activeCount = 0
  for (const entry of ring.keys) {
    if (!trim(entry.keyId) || ids.has(entry.keyId)) {
      throw new CloakSnapshotSignatureError(
        'signing_key_unavailable',
        'Sealed Cloak signing-key keyring contains a missing or duplicate key ID.',
      )
    }
    ids.add(entry.keyId)
    assertDate(entry.createdAt, `keyring.keys[${entry.keyId}].createdAt`)
    assertCanonicalBase64(
      entry.encryptedSecretBase64,
      `keyring.keys[${entry.keyId}].encryptedSecretBase64`,
    )
    if (entry.status === 'active') {
      activeCount += 1
      if (entry.retiredAt !== undefined) {
        throw new CloakSnapshotSignatureError(
          'signing_key_unavailable',
          'Active Cloak signing key cannot have retiredAt metadata.',
        )
      }
    } else if (entry.status === 'retired') {
      if (!entry.retiredAt) {
        throw new CloakSnapshotSignatureError(
          'signing_key_unavailable',
          'Retired Cloak signing key must have retiredAt metadata.',
        )
      }
      assertDate(entry.retiredAt, `keyring.keys[${entry.keyId}].retiredAt`)
    } else {
      throw new CloakSnapshotSignatureError(
        'signing_key_unavailable',
        'Unsupported Cloak signing-key status.',
      )
    }
  }
  const active = ring.keys.find((entry) => entry.keyId === ring.activeKeyId)
  if (!active || active.status !== 'active' || activeCount !== 1) {
    throw new CloakSnapshotSignatureError(
      'signing_key_unavailable',
      'Cloak signing-key keyring must contain exactly one matching active key.',
    )
  }
}

function metadataFor(ring: SealedSigningKeyringFile): CloakSigningKeyringMetadata {
  return {
    schemaVersion: CLOAK_SIGNING_KEYRING_FILE_VERSION,
    activeKeyId: ring.activeKeyId,
    updatedAt: ring.updatedAt,
    keys: ring.keys.map(({ keyId, createdAt, status, retiredAt }) => ({
      keyId,
      createdAt,
      status,
      ...(retiredAt ? { retiredAt } : {}),
    })),
  }
}

export class ElectronSafeStorageSigningKeyringProvider
  implements CloakSnapshotSigningKeyProvider
{
  private readonly keyFilePath: string
  private readonly loadSafeStorage: () => Promise<SafeStorageLike>
  private readonly platform: NodeJS.Platform
  private readonly now: () => Date
  private readonly randomKey: () => Buffer
  private readonly maxRetiredKeys: number
  private cachedRing: SealedSigningKeyringFile | null = null
  private serial: Promise<void> = Promise.resolve()

  constructor(options: ElectronSafeStorageSigningKeyringProviderOptions) {
    this.keyFilePath = path.resolve(options.keyFilePath)
    this.loadSafeStorage = options.loadSafeStorage ?? defaultLoadSafeStorage
    this.platform = options.platform ?? process.platform
    this.now = options.now ?? (() => new Date())
    this.randomKey = options.randomKey ?? (() => randomBytes(32))
    const maxRetiredKeys = options.maxRetiredKeys ?? DEFAULT_CLOAK_RETIRED_SIGNING_KEY_LIMIT
    if (!Number.isSafeInteger(maxRetiredKeys) || maxRetiredKeys < 0) {
      throw new CloakSnapshotSignatureError(
        'signing_key_unavailable',
        'Cloak maxRetiredKeys must be a non-negative safe integer.',
      )
    }
    this.maxRetiredKeys = maxRetiredKeys
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.serial
    let release!: () => void
    this.serial = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  private async requireSafeStorage(): Promise<SafeStorageLike> {
    const safeStorage = await this.loadSafeStorage()
    if (!safeStorage.isEncryptionAvailable()) {
      throw new CloakSnapshotSignatureError(
        'signing_key_unavailable',
        'OS-backed encryption is unavailable for the Cloak snapshot signing keyring.',
      )
    }
    if (
      this.platform === 'linux' &&
      safeStorage.getSelectedStorageBackend?.() === 'basic_text'
    ) {
      throw new CloakSnapshotSignatureError(
        'unsafe_key_storage',
        'Linux basic_text safeStorage is forbidden for the Cloak snapshot signing keyring.',
      )
    }
    return safeStorage
  }

  private decryptEntry(
    safeStorage: SafeStorageLike,
    entry: SealedKeyringEntry,
  ): CloakSnapshotSigningKey {
    let secret: Buffer
    try {
      secret = Buffer.from(
        safeStorage.decryptString(Buffer.from(entry.encryptedSecretBase64, 'base64')),
        'base64',
      )
    } catch (error) {
      throw new CloakSnapshotSignatureError(
        'signing_key_unavailable',
        `OS-backed decryption failed for Cloak signing key ${entry.keyId}.`,
        error,
      )
    }
    const key = createInMemoryCloakSigningKey(secret, entry.createdAt)
    if (key.keyId !== entry.keyId) {
      throw new CloakSnapshotSignatureError(
        'signing_key_mismatch',
        `Cloak signing key ${entry.keyId} does not match its sealed secret.`,
      )
    }
    return key
  }

  private createEntry(
    safeStorage: SafeStorageLike,
    createdAt: string,
  ): { entry: SealedKeyringEntry; key: CloakSnapshotSigningKey } {
    const key = createInMemoryCloakSigningKey(this.randomKey(), createdAt)
    let encrypted: Buffer
    try {
      encrypted = safeStorage.encryptString(key.secret.toString('base64'))
    } catch (error) {
      throw new CloakSnapshotSignatureError(
        'signing_key_unavailable',
        'OS-backed encryption failed for a new Cloak snapshot signing key.',
        error,
      )
    }
    return {
      key,
      entry: {
        keyId: key.keyId,
        createdAt: key.createdAt,
        status: 'active',
        encryptedSecretBase64: encrypted.toString('base64'),
      },
    }
  }

  private async persistRing(ring: SealedSigningKeyringFile): Promise<void> {
    validateRing(ring)
    try {
      await atomicWritePrivate(this.keyFilePath, `${JSON.stringify(ring, null, 2)}\n`)
    } catch (error) {
      throw new CloakSnapshotSignatureError(
        'signature_io_failed',
        `Failed to atomically persist the sealed Cloak signing-key keyring at ${this.keyFilePath}.`,
        error,
      )
    }
    this.cachedRing = cloneRing(ring)
  }

  private async assertPrivateFile(): Promise<void> {
    if (this.platform === 'win32') return
    try {
      const metadata = await stat(this.keyFilePath)
      if ((metadata.mode & 0o077) !== 0) {
        throw new CloakSnapshotSignatureError(
          'unsafe_key_storage',
          `Cloak signing-key keyring must be private; mode=${(metadata.mode & 0o777).toString(8)}.`,
        )
      }
    } catch (error) {
      if (error instanceof CloakSnapshotSignatureError) throw error
      throw new CloakSnapshotSignatureError(
        'signature_io_failed',
        `Unable to inspect Cloak signing-key keyring permissions at ${this.keyFilePath}.`,
        error,
      )
    }
  }

  private async loadOrCreateRing(
    safeStorage: SafeStorageLike,
  ): Promise<SealedSigningKeyringFile> {
    if (this.cachedRing) return cloneRing(this.cachedRing)
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(this.keyFilePath, 'utf8')) as unknown
      await this.assertPrivateFile()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        const timestamp = this.now().toISOString()
        const { entry } = this.createEntry(safeStorage, timestamp)
        const ring: SealedSigningKeyringFile = {
          schemaVersion: CLOAK_SIGNING_KEYRING_FILE_VERSION,
          activeKeyId: entry.keyId,
          updatedAt: timestamp,
          keys: [entry],
        }
        await this.persistRing(ring)
        return cloneRing(ring)
      }
      if (error instanceof CloakSnapshotSignatureError) throw error
      throw new CloakSnapshotSignatureError(
        'signature_io_failed',
        `Failed to read the sealed Cloak signing-key keyring at ${this.keyFilePath}.`,
        error,
      )
    }

    const candidate = raw as
      | Partial<SealedSigningKeyringFile>
      | Partial<LegacySealedSigningKeyFile>
    if (candidate.schemaVersion === CLOAK_SIGNING_KEY_FILE_VERSION) {
      const legacy = candidate as LegacySealedSigningKeyFile
      if (!trim(legacy.keyId) || !trim(legacy.createdAt)) {
        throw new CloakSnapshotSignatureError(
          'signing_key_unavailable',
          'Legacy sealed Cloak signing-key metadata is invalid.',
        )
      }
      assertDate(legacy.createdAt, 'legacy.createdAt')
      assertCanonicalBase64(legacy.encryptedSecretBase64, 'legacy.encryptedSecretBase64')
      const entry: SealedKeyringEntry = {
        keyId: legacy.keyId,
        createdAt: legacy.createdAt,
        status: 'active',
        encryptedSecretBase64: legacy.encryptedSecretBase64,
      }
      this.decryptEntry(safeStorage, entry)
      const ring: SealedSigningKeyringFile = {
        schemaVersion: CLOAK_SIGNING_KEYRING_FILE_VERSION,
        activeKeyId: entry.keyId,
        updatedAt: this.now().toISOString(),
        keys: [entry],
      }
      await this.persistRing(ring)
      return cloneRing(ring)
    }

    const ring = candidate as SealedSigningKeyringFile
    validateRing(ring)
    this.cachedRing = cloneRing(ring)
    return cloneRing(ring)
  }

  async getActiveKey(): Promise<CloakSnapshotSigningKey> {
    return await this.withLock(async () => {
      const safeStorage = await this.requireSafeStorage()
      const ring = await this.loadOrCreateRing(safeStorage)
      const entry = ring.keys.find((key) => key.keyId === ring.activeKeyId)
      if (!entry) {
        throw new CloakSnapshotSignatureError(
          'signing_key_unavailable',
          'Active Cloak signing key is missing from the keyring.',
        )
      }
      return this.decryptEntry(safeStorage, entry)
    })
  }

  async getKey(keyId: string): Promise<CloakSnapshotSigningKey | null> {
    return await this.withLock(async () => {
      const safeStorage = await this.requireSafeStorage()
      const ring = await this.loadOrCreateRing(safeStorage)
      const entry = ring.keys.find((key) => key.keyId === keyId)
      return entry ? this.decryptEntry(safeStorage, entry) : null
    })
  }

  async rotate(): Promise<CloakSigningKeyringMetadata> {
    return await this.withLock(async () => {
      const safeStorage = await this.requireSafeStorage()
      const ring = await this.loadOrCreateRing(safeStorage)
      const timestamp = this.now().toISOString()
      for (const entry of ring.keys) {
        if (entry.keyId === ring.activeKeyId) {
          entry.status = 'retired'
          entry.retiredAt = timestamp
        }
      }
      const { entry: active } = this.createEntry(safeStorage, timestamp)
      const retired = ring.keys
        .filter((entry) => entry.status === 'retired')
        .sort((left, right) =>
          String(right.retiredAt ?? right.createdAt).localeCompare(
            String(left.retiredAt ?? left.createdAt),
          ),
        )
        .slice(0, this.maxRetiredKeys)
      const next: SealedSigningKeyringFile = {
        schemaVersion: CLOAK_SIGNING_KEYRING_FILE_VERSION,
        activeKeyId: active.keyId,
        updatedAt: timestamp,
        keys: [active, ...retired],
      }
      await this.persistRing(next)
      return metadataFor(next)
    })
  }

  async reset(): Promise<CloakSigningKeyringMetadata> {
    return await this.withLock(async () => {
      const safeStorage = await this.requireSafeStorage()
      const timestamp = this.now().toISOString()
      const { entry } = this.createEntry(safeStorage, timestamp)
      const next: SealedSigningKeyringFile = {
        schemaVersion: CLOAK_SIGNING_KEYRING_FILE_VERSION,
        activeKeyId: entry.keyId,
        updatedAt: timestamp,
        keys: [entry],
      }
      await this.persistRing(next)
      return metadataFor(next)
    })
  }

  async getMetadata(): Promise<CloakSigningKeyringMetadata> {
    return await this.withLock(async () => {
      const safeStorage = await this.requireSafeStorage()
      return metadataFor(await this.loadOrCreateRing(safeStorage))
    })
  }
}
