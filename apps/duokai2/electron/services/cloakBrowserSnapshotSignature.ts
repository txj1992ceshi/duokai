import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  validateCloakTrustedIdentitySnapshot,
  type CloakTrustedIdentitySnapshot,
} from './cloakBrowserTrustedSnapshot.ts'

export const CLOAK_SIGNED_SNAPSHOT_RECORD_VERSION = 1
export const CLOAK_SNAPSHOT_SIGNATURE_ALGORITHM = 'HMAC-SHA256' as const
export const CLOAK_SIGNING_KEY_FILE_VERSION = 1

export type CloakSnapshotSignatureErrorCode =
  | 'invalid_signed_record'
  | 'signature_mismatch'
  | 'signing_key_unavailable'
  | 'signing_key_mismatch'
  | 'unsafe_key_storage'
  | 'signature_io_failed'

export class CloakSnapshotSignatureError extends Error {
  readonly code: CloakSnapshotSignatureErrorCode

  constructor(code: CloakSnapshotSignatureErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakSnapshotSignatureError'
    this.code = code
  }
}

export interface CloakSnapshotSigningKey {
  keyId: string
  secret: Buffer
  createdAt: string
}

export interface CloakSnapshotSigningKeyProvider {
  getActiveKey(): Promise<CloakSnapshotSigningKey>
  getKey(keyId: string): Promise<CloakSnapshotSigningKey | null>
}

export interface SafeStorageLike {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encrypted: Buffer): string
  getSelectedStorageBackend?(): string
}

export interface CloakSignedSnapshotSignature {
  algorithm: typeof CLOAK_SNAPSHOT_SIGNATURE_ALGORITHM
  keyId: string
  signedAt: string
  payloadSha256: string
  valueBase64: string
}

export interface CloakSignedTrustedIdentityRecord {
  schemaVersion: number
  snapshot: CloakTrustedIdentitySnapshot
  signature: CloakSignedSnapshotSignature
}

export interface ElectronSafeStorageSigningKeyProviderOptions {
  keyFilePath: string
  loadSafeStorage?: () => Promise<SafeStorageLike>
  platform?: NodeJS.Platform
  now?: () => Date
  randomKey?: () => Buffer
}

interface SealedSigningKeyFile {
  schemaVersion: number
  keyId: string
  createdAt: string
  encryptedSecretBase64: string
}

function trim(value: unknown): string {
  return String(value ?? '').trim()
}

function assertSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new CloakSnapshotSignatureError(
      'invalid_signed_record',
      `${label} must be a SHA256 hex digest.`,
    )
  }
}

function assertBase64(value: string, label: string): void {
  if (!value || Buffer.from(value, 'base64').toString('base64') !== value) {
    throw new CloakSnapshotSignatureError(
      'invalid_signed_record',
      `${label} must be canonical base64.`,
    )
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    )
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function snapshotPayload(snapshot: CloakTrustedIdentitySnapshot): Buffer {
  return Buffer.from(
    `duokai-cloak-trusted-identity-v1\n${canonicalJson(snapshot)}`,
    'utf8',
  )
}

function payloadSha256(snapshot: CloakTrustedIdentitySnapshot): string {
  return createHash('sha256').update(snapshotPayload(snapshot)).digest('hex')
}

function signedRecordPayload(
  snapshot: CloakTrustedIdentitySnapshot,
  signature: Omit<CloakSignedSnapshotSignature, 'valueBase64'>,
): Buffer {
  return Buffer.from(
    `duokai-cloak-signed-record-v1\n${canonicalJson({
      schemaVersion: CLOAK_SIGNED_SNAPSHOT_RECORD_VERSION,
      snapshot,
      signature,
    })}`,
    'utf8',
  )
}

function hmacSignature(
  snapshot: CloakTrustedIdentitySnapshot,
  signature: Omit<CloakSignedSnapshotSignature, 'valueBase64'>,
  secret: Buffer,
): Buffer {
  return createHmac('sha256', secret)
    .update(signedRecordPayload(snapshot, signature))
    .digest()
}

function keyIdFor(secret: Buffer): string {
  return `cloak-hmac-${createHash('sha256').update(secret).digest('hex').slice(0, 24)}`
}

function validateKey(key: CloakSnapshotSigningKey): void {
  if (!trim(key.keyId) || !Number.isFinite(Date.parse(key.createdAt))) {
    throw new CloakSnapshotSignatureError(
      'signing_key_unavailable',
      'Cloak snapshot signing-key metadata is invalid.',
    )
  }
  if (!Buffer.isBuffer(key.secret) || key.secret.length < 32) {
    throw new CloakSnapshotSignatureError(
      'signing_key_unavailable',
      'Cloak snapshot signing key must contain at least 256 bits.',
    )
  }
  if (keyIdFor(key.secret) !== key.keyId) {
    throw new CloakSnapshotSignatureError(
      'signing_key_mismatch',
      'Cloak snapshot signing-key ID does not match its secret.',
    )
  }
}

export function createInMemoryCloakSigningKey(
  secret: Buffer = randomBytes(32),
  createdAt = new Date().toISOString(),
): CloakSnapshotSigningKey {
  const key = {
    keyId: keyIdFor(secret),
    secret: Buffer.from(secret),
    createdAt,
  }
  validateKey(key)
  return key
}

export class InMemoryCloakSigningKeyProvider
  implements CloakSnapshotSigningKeyProvider
{
  private readonly keys = new Map<string, CloakSnapshotSigningKey>()
  private activeKeyId: string

  constructor(key: CloakSnapshotSigningKey = createInMemoryCloakSigningKey()) {
    validateKey(key)
    this.keys.set(key.keyId, {
      ...key,
      secret: Buffer.from(key.secret),
    })
    this.activeKeyId = key.keyId
  }

  addKey(key: CloakSnapshotSigningKey, makeActive = false): void {
    validateKey(key)
    this.keys.set(key.keyId, { ...key, secret: Buffer.from(key.secret) })
    if (makeActive) {
      this.activeKeyId = key.keyId
    }
  }

  async getActiveKey(): Promise<CloakSnapshotSigningKey> {
    const key = this.keys.get(this.activeKeyId)
    if (!key) {
      throw new CloakSnapshotSignatureError(
        'signing_key_unavailable',
        'Active Cloak snapshot signing key is unavailable.',
      )
    }
    return { ...key, secret: Buffer.from(key.secret) }
  }

  async getKey(keyId: string): Promise<CloakSnapshotSigningKey | null> {
    const key = this.keys.get(keyId)
    return key ? { ...key, secret: Buffer.from(key.secret) } : null
  }
}

async function defaultLoadSafeStorage(): Promise<SafeStorageLike> {
  const electron = (await import('electron')) as unknown as {
    safeStorage?: SafeStorageLike
  }
  if (!electron.safeStorage) {
    throw new CloakSnapshotSignatureError(
      'signing_key_unavailable',
      'Electron safeStorage is unavailable in the current process.',
    )
  }
  return electron.safeStorage
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const resolvedPath = path.resolve(filePath)
  const directory = path.dirname(resolvedPath)
  const temporaryPath = path.join(
    directory,
    `.${path.basename(resolvedPath)}.${process.pid}.${randomUUID()}.tmp`,
  )
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(temporaryPath, content, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporaryPath, resolvedPath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export class ElectronSafeStorageSigningKeyProvider
  implements CloakSnapshotSigningKeyProvider
{
  private readonly keyFilePath: string
  private readonly loadSafeStorage: () => Promise<SafeStorageLike>
  private readonly platform: NodeJS.Platform
  private readonly now: () => Date
  private readonly randomKey: () => Buffer
  private cachedKey: CloakSnapshotSigningKey | null = null

  constructor(options: ElectronSafeStorageSigningKeyProviderOptions) {
    this.keyFilePath = path.resolve(options.keyFilePath)
    this.loadSafeStorage = options.loadSafeStorage ?? defaultLoadSafeStorage
    this.platform = options.platform ?? process.platform
    this.now = options.now ?? (() => new Date())
    this.randomKey = options.randomKey ?? (() => randomBytes(32))
  }

  private async requireSafeStorage(): Promise<SafeStorageLike> {
    const safeStorage = await this.loadSafeStorage()
    if (!safeStorage.isEncryptionAvailable()) {
      throw new CloakSnapshotSignatureError(
        'signing_key_unavailable',
        'OS-backed encryption is unavailable for the Cloak snapshot signing key.',
      )
    }
    if (
      this.platform === 'linux' &&
      safeStorage.getSelectedStorageBackend?.() === 'basic_text'
    ) {
      throw new CloakSnapshotSignatureError(
        'unsafe_key_storage',
        'Linux basic_text safeStorage is forbidden for the Cloak snapshot signing key.',
      )
    }
    return safeStorage
  }

  private async readExistingKey(
    safeStorage: SafeStorageLike,
  ): Promise<CloakSnapshotSigningKey | null> {
    let parsed: SealedSigningKeyFile
    try {
      parsed = JSON.parse(await readFile(this.keyFilePath, 'utf8')) as SealedSigningKeyFile
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw new CloakSnapshotSignatureError(
        'signature_io_failed',
        `Failed to read the sealed Cloak signing-key file at ${this.keyFilePath}.`,
        error,
      )
    }

    if (
      parsed.schemaVersion !== CLOAK_SIGNING_KEY_FILE_VERSION ||
      !trim(parsed.keyId) ||
      !Number.isFinite(Date.parse(parsed.createdAt))
    ) {
      throw new CloakSnapshotSignatureError(
        'signing_key_unavailable',
        'Sealed Cloak signing-key metadata is invalid.',
      )
    }
    assertBase64(parsed.encryptedSecretBase64, 'encryptedSecretBase64')
    let secret: Buffer
    try {
      const plainText = safeStorage.decryptString(
        Buffer.from(parsed.encryptedSecretBase64, 'base64'),
      )
      secret = Buffer.from(plainText, 'base64')
    } catch (error) {
      throw new CloakSnapshotSignatureError(
        'signing_key_unavailable',
        'OS-backed decryption failed for the Cloak snapshot signing key.',
        error,
      )
    }
    const key = {
      keyId: parsed.keyId,
      secret,
      createdAt: parsed.createdAt,
    }
    validateKey(key)
    return key
  }

  private async createAndPersistKey(
    safeStorage: SafeStorageLike,
  ): Promise<CloakSnapshotSigningKey> {
    const key = createInMemoryCloakSigningKey(
      this.randomKey(),
      this.now().toISOString(),
    )
    let encrypted: Buffer
    try {
      encrypted = safeStorage.encryptString(key.secret.toString('base64'))
    } catch (error) {
      throw new CloakSnapshotSignatureError(
        'signing_key_unavailable',
        'OS-backed encryption failed for the Cloak snapshot signing key.',
        error,
      )
    }
    const sealed: SealedSigningKeyFile = {
      schemaVersion: CLOAK_SIGNING_KEY_FILE_VERSION,
      keyId: key.keyId,
      createdAt: key.createdAt,
      encryptedSecretBase64: encrypted.toString('base64'),
    }
    try {
      await atomicWrite(this.keyFilePath, `${JSON.stringify(sealed, null, 2)}\n`)
    } catch (error) {
      throw new CloakSnapshotSignatureError(
        'signature_io_failed',
        `Failed to atomically persist the sealed Cloak signing key at ${this.keyFilePath}.`,
        error,
      )
    }
    return key
  }

  async getActiveKey(): Promise<CloakSnapshotSigningKey> {
    if (this.cachedKey) {
      return { ...this.cachedKey, secret: Buffer.from(this.cachedKey.secret) }
    }
    const safeStorage = await this.requireSafeStorage()
    const key =
      (await this.readExistingKey(safeStorage)) ??
      (await this.createAndPersistKey(safeStorage))
    this.cachedKey = { ...key, secret: Buffer.from(key.secret) }
    return { ...key, secret: Buffer.from(key.secret) }
  }

  async getKey(keyId: string): Promise<CloakSnapshotSigningKey | null> {
    const key = await this.getActiveKey()
    return key.keyId === keyId ? key : null
  }
}

function validateSignatureMetadata(
  signature: CloakSignedSnapshotSignature,
): void {
  if (
    signature.algorithm !== CLOAK_SNAPSHOT_SIGNATURE_ALGORITHM ||
    !trim(signature.keyId) ||
    !Number.isFinite(Date.parse(signature.signedAt))
  ) {
    throw new CloakSnapshotSignatureError(
      'invalid_signed_record',
      'Cloak trusted-snapshot signature metadata is invalid.',
    )
  }
  assertSha256(signature.payloadSha256, 'signature.payloadSha256')
  assertBase64(signature.valueBase64, 'signature.valueBase64')
  if (Buffer.from(signature.valueBase64, 'base64').length !== 32) {
    throw new CloakSnapshotSignatureError(
      'invalid_signed_record',
      'Cloak trusted-snapshot HMAC must be 256 bits.',
    )
  }
}

export async function signCloakTrustedIdentitySnapshot(
  snapshot: CloakTrustedIdentitySnapshot,
  provider: CloakSnapshotSigningKeyProvider,
  now: Date = new Date(),
): Promise<CloakSignedTrustedIdentityRecord> {
  validateCloakTrustedIdentitySnapshot(snapshot)
  const key = await provider.getActiveKey()
  validateKey(key)
  const signatureMetadata: Omit<CloakSignedSnapshotSignature, 'valueBase64'> = {
    algorithm: CLOAK_SNAPSHOT_SIGNATURE_ALGORITHM,
    keyId: key.keyId,
    signedAt: now.toISOString(),
    payloadSha256: payloadSha256(snapshot),
  }
  const record: CloakSignedTrustedIdentityRecord = {
    schemaVersion: CLOAK_SIGNED_SNAPSHOT_RECORD_VERSION,
    snapshot: structuredClone(snapshot),
    signature: {
      ...signatureMetadata,
      valueBase64: hmacSignature(snapshot, signatureMetadata, key.secret).toString('base64'),
    },
  }
  validateSignatureMetadata(record.signature)
  return record
}

export async function verifyCloakSignedTrustedIdentityRecord(
  record: CloakSignedTrustedIdentityRecord,
  provider: CloakSnapshotSigningKeyProvider,
): Promise<void> {
  if (record.schemaVersion !== CLOAK_SIGNED_SNAPSHOT_RECORD_VERSION) {
    throw new CloakSnapshotSignatureError(
      'invalid_signed_record',
      `Unsupported signed Cloak snapshot schema ${record.schemaVersion}.`,
    )
  }
  validateCloakTrustedIdentitySnapshot(record.snapshot)
  validateSignatureMetadata(record.signature)
  const expectedPayloadHash = payloadSha256(record.snapshot)
  if (expectedPayloadHash !== record.signature.payloadSha256) {
    throw new CloakSnapshotSignatureError(
      'signature_mismatch',
      'Signed Cloak snapshot payload hash does not match the snapshot.',
    )
  }
  const key = await provider.getKey(record.signature.keyId)
  if (!key) {
    throw new CloakSnapshotSignatureError(
      'signing_key_unavailable',
      `Cloak snapshot signing key ${record.signature.keyId} is unavailable.`,
    )
  }
  validateKey(key)
  const {
    valueBase64,
    ...signatureMetadata
  } = record.signature
  const expected = hmacSignature(record.snapshot, signatureMetadata, key.secret)
  const actual = Buffer.from(valueBase64, 'base64')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new CloakSnapshotSignatureError(
      'signature_mismatch',
      'Cloak trusted-snapshot signature verification failed.',
    )
  }
}

export async function writeCloakSignedTrustedIdentityRecordAtomic(
  filePath: string,
  record: CloakSignedTrustedIdentityRecord,
  provider: CloakSnapshotSigningKeyProvider,
): Promise<void> {
  await verifyCloakSignedTrustedIdentityRecord(record, provider)
  try {
    await atomicWrite(path.resolve(filePath), `${JSON.stringify(record, null, 2)}\n`)
  } catch (error) {
    if (error instanceof CloakSnapshotSignatureError) {
      throw error
    }
    throw new CloakSnapshotSignatureError(
      'signature_io_failed',
      `Failed to atomically write signed Cloak snapshot at ${path.resolve(filePath)}.`,
      error,
    )
  }
}

export async function readCloakSignedTrustedIdentityRecord(
  filePath: string,
  provider: CloakSnapshotSigningKeyProvider,
): Promise<CloakSignedTrustedIdentityRecord> {
  let record: CloakSignedTrustedIdentityRecord
  try {
    record = JSON.parse(await readFile(filePath, 'utf8')) as CloakSignedTrustedIdentityRecord
  } catch (error) {
    throw new CloakSnapshotSignatureError(
      'signature_io_failed',
      `Failed to read signed Cloak snapshot at ${path.resolve(filePath)}.`,
      error,
    )
  }
  await verifyCloakSignedTrustedIdentityRecord(record, provider)
  return record
}
