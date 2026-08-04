import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { CloakProductionTransactionStage } from './cloakBrowserProductionTransaction.ts'
import type { CloakSignedTrustedIdentityRecord } from './cloakBrowserSnapshotSignature.ts'

export const CLOAK_TRANSACTION_JOURNAL_VERSION = 1

export type CloakTransactionRecoveryErrorCode =
  | 'invalid_configuration'
  | 'journal_invalid'
  | 'journal_io_failed'
  | 'recovery_failed'

export class CloakTransactionRecoveryError extends Error {
  readonly code: CloakTransactionRecoveryErrorCode

  constructor(code: CloakTransactionRecoveryErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakTransactionRecoveryError'
    this.code = code
  }
}

export interface CloakTransactionJournalRecord {
  schemaVersion: typeof CLOAK_TRANSACTION_JOURNAL_VERSION
  transactionId: string
  profileId: string
  signedRecordPath: string
  status: 'active'
  stage: CloakProductionTransactionStage
  startedAt: string
  updatedAt: string
  previousSignedRecordBase64: string | null
  snapshotPersisted: boolean
  trustedStatePublished: boolean
  newSnapshotId: string
  newPayloadSha256: string
  journalSha256: string
}

export interface CloakTransactionRecoveryJournalOptions {
  journalPath: string
  signedRecordPath: string
  profileId: string
  now?: () => Date
  transactionId?: () => string
}

export interface CloakInterruptedTransactionRecoveryInput {
  journalPath: string
  signedRecordPath: string
  profileId: string
  rollbackTrustedState?: (
    journal: Readonly<CloakTransactionJournalRecord>,
  ) => Promise<void>
}

export interface CloakInterruptedTransactionRecoveryResult {
  recovered: boolean
  transactionId: string
  profileId: string
  interruptedStage: CloakProductionTransactionStage | ''
  restoredPreviousSignedRecord: boolean
  removedUncommittedSignedRecord: boolean
  trustedStateRollbackAttempted: boolean
}

function trim(value: unknown): string {
  return String(value ?? '').trim()
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    )
  }
  return value
}

function journalHash(
  journal: Omit<CloakTransactionJournalRecord, 'journalSha256'>,
): string {
  return createHash('sha256')
    .update(`duokai-cloak-transaction-journal-v1\n${JSON.stringify(canonicalize(journal))}`)
    .digest('hex')
}

function isCanonicalBase64(value: string): boolean {
  return value === '' || Buffer.from(value, 'base64').toString('base64') === value
}

function assertAbsolutePath(value: string, label: string): string {
  if (!trim(value) || !path.isAbsolute(value)) {
    throw new CloakTransactionRecoveryError(
      'invalid_configuration',
      `${label} must be an absolute path.`,
    )
  }
  return path.resolve(value)
}

function assertProfileId(value: string): string {
  const profileId = trim(value)
  if (
    !profileId ||
    profileId === '*' ||
    profileId.includes('\0') ||
    profileId.includes('\r') ||
    profileId.includes('\n')
  ) {
    throw new CloakTransactionRecoveryError(
      'invalid_configuration',
      'Cloak transaction journal requires one concrete Profile ID.',
    )
  }
  return profileId
}

function journalPayload(
  journal: CloakTransactionJournalRecord,
): Omit<CloakTransactionJournalRecord, 'journalSha256'> {
  const payload = { ...journal }
  Reflect.deleteProperty(payload, 'journalSha256')
  return payload
}

function validateJournal(journal: CloakTransactionJournalRecord): void {
  const { journalSha256, ...payload } = journal
  if (
    journal.schemaVersion !== CLOAK_TRANSACTION_JOURNAL_VERSION ||
    !trim(journal.transactionId) ||
    !trim(journal.profileId) ||
    !path.isAbsolute(journal.signedRecordPath) ||
    journal.status !== 'active' ||
    !trim(journal.stage) ||
    !Number.isFinite(Date.parse(journal.startedAt)) ||
    !Number.isFinite(Date.parse(journal.updatedAt)) ||
    (journal.previousSignedRecordBase64 !== null &&
      !isCanonicalBase64(journal.previousSignedRecordBase64)) ||
    typeof journal.snapshotPersisted !== 'boolean' ||
    typeof journal.trustedStatePublished !== 'boolean' ||
    (journal.newSnapshotId !== '' && !trim(journal.newSnapshotId)) ||
    (journal.newPayloadSha256 !== '' && !/^[a-f0-9]{64}$/.test(journal.newPayloadSha256)) ||
    !/^[a-f0-9]{64}$/.test(journalSha256) ||
    journalHash(payload) !== journalSha256
  ) {
    throw new CloakTransactionRecoveryError(
      'journal_invalid',
      'Cloak transaction journal is invalid or has been modified.',
    )
  }
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

async function removeAndSync(filePath: string): Promise<void> {
  const resolvedPath = path.resolve(filePath)
  await rm(resolvedPath, { force: true })
  const directory = path.dirname(resolvedPath)
  try {
    await fsyncDirectory(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function readOptionalBytes(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function readCloakTransactionJournal(
  journalPath: string,
): Promise<CloakTransactionJournalRecord | null> {
  const resolvedPath = assertAbsolutePath(journalPath, 'journalPath')
  let journal: CloakTransactionJournalRecord
  try {
    journal = JSON.parse(await readFile(resolvedPath, 'utf8')) as CloakTransactionJournalRecord
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new CloakTransactionRecoveryError(
      'journal_io_failed',
      `Unable to read Cloak transaction journal at ${resolvedPath}.`,
      error,
    )
  }
  validateJournal(journal)
  if (process.platform !== 'win32') {
    try {
      const metadata = await stat(resolvedPath)
      if ((metadata.mode & 0o077) !== 0) {
        throw new CloakTransactionRecoveryError(
          'journal_invalid',
          `Cloak transaction journal must be private; mode=${(metadata.mode & 0o777).toString(8)}.`,
        )
      }
    } catch (error) {
      if (error instanceof CloakTransactionRecoveryError) throw error
      throw new CloakTransactionRecoveryError(
        'journal_io_failed',
        `Unable to inspect Cloak transaction journal at ${resolvedPath}.`,
        error,
      )
    }
  }
  return journal
}

export class CloakTransactionRecoveryJournal {
  private readonly journalPath: string
  private readonly signedRecordPath: string
  private readonly profileId: string
  private readonly now: () => Date
  private readonly transactionId: () => string
  private journal: CloakTransactionJournalRecord | null = null
  private serial: Promise<void> = Promise.resolve()

  constructor(options: CloakTransactionRecoveryJournalOptions) {
    this.journalPath = assertAbsolutePath(options.journalPath, 'journalPath')
    this.signedRecordPath = assertAbsolutePath(options.signedRecordPath, 'signedRecordPath')
    this.profileId = assertProfileId(options.profileId)
    this.now = options.now ?? (() => new Date())
    this.transactionId = options.transactionId ?? (() => randomUUID())
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

  private async persist(journal: Omit<CloakTransactionJournalRecord, 'journalSha256'>): Promise<void> {
    const complete: CloakTransactionJournalRecord = {
      ...journal,
      journalSha256: journalHash(journal),
    }
    validateJournal(complete)
    try {
      await atomicWritePrivate(this.journalPath, `${JSON.stringify(complete, null, 2)}\n`)
    } catch (error) {
      throw new CloakTransactionRecoveryError(
        'journal_io_failed',
        `Unable to persist Cloak transaction journal at ${this.journalPath}.`,
        error,
      )
    }
    this.journal = complete
  }

  async begin(): Promise<CloakTransactionJournalRecord> {
    return await this.withLock(async () => {
      if (this.journal) {
        throw new CloakTransactionRecoveryError(
          'invalid_configuration',
          'Cloak transaction journal has already begun.',
        )
      }
      const existing = await readCloakTransactionJournal(this.journalPath)
      if (existing) {
        throw new CloakTransactionRecoveryError(
          'journal_invalid',
          'An interrupted Cloak transaction must be recovered before beginning another launch.',
        )
      }
      const timestamp = this.now().toISOString()
      const previous = await readOptionalBytes(this.signedRecordPath)
      await this.persist({
        schemaVersion: CLOAK_TRANSACTION_JOURNAL_VERSION,
        transactionId: this.transactionId(),
        profileId: this.profileId,
        signedRecordPath: this.signedRecordPath,
        status: 'active',
        stage: 'unverified',
        startedAt: timestamp,
        updatedAt: timestamp,
        previousSignedRecordBase64: previous?.toString('base64') ?? null,
        snapshotPersisted: false,
        trustedStatePublished: false,
        newSnapshotId: '',
        newPayloadSha256: '',
      })
      return structuredClone(this.journal!)
    })
  }

  async transition(stage: CloakProductionTransactionStage): Promise<void> {
    await this.withLock(async () => {
      if (!this.journal) {
        throw new CloakTransactionRecoveryError(
          'invalid_configuration',
          'Cloak transaction journal has not begun.',
        )
      }
      const payload = journalPayload(this.journal)
      await this.persist({
        ...payload,
        stage,
        updatedAt: this.now().toISOString(),
      })
    })
  }

  async markSnapshotPersisted(record: CloakSignedTrustedIdentityRecord): Promise<void> {
    await this.withLock(async () => {
      if (!this.journal) {
        throw new CloakTransactionRecoveryError(
          'invalid_configuration',
          'Cloak transaction journal has not begun.',
        )
      }
      if (record.snapshot.profileId !== this.profileId) {
        throw new CloakTransactionRecoveryError(
          'journal_invalid',
          'Persisted Cloak snapshot Profile ID does not match its transaction journal.',
        )
      }
      const payload = journalPayload(this.journal)
      await this.persist({
        ...payload,
        snapshotPersisted: true,
        newSnapshotId: record.snapshot.snapshotId,
        newPayloadSha256: record.signature.payloadSha256.toLowerCase(),
        updatedAt: this.now().toISOString(),
      })
    })
  }

  async markTrustedStatePublished(): Promise<void> {
    await this.withLock(async () => {
      if (!this.journal?.snapshotPersisted) {
        throw new CloakTransactionRecoveryError(
          'journal_invalid',
          'Cloak trusted state cannot be journaled before signed snapshot persistence.',
        )
      }
      const payload = journalPayload(this.journal)
      await this.persist({
        ...payload,
        trustedStatePublished: true,
        updatedAt: this.now().toISOString(),
      })
    })
  }

  async commit(): Promise<void> {
    await this.withLock(async () => {
      if (!this.journal?.snapshotPersisted || !this.journal.trustedStatePublished) {
        throw new CloakTransactionRecoveryError(
          'journal_invalid',
          'Cloak transaction cannot commit before snapshot persistence and trust publication.',
        )
      }
      try {
        await removeAndSync(this.journalPath)
      } catch (error) {
        throw new CloakTransactionRecoveryError(
          'journal_io_failed',
          `Unable to clear committed Cloak transaction journal at ${this.journalPath}.`,
          error,
        )
      }
      this.journal = null
    })
  }
}

export async function recoverInterruptedCloakProductionTransaction(
  input: CloakInterruptedTransactionRecoveryInput,
): Promise<CloakInterruptedTransactionRecoveryResult> {
  const journalPath = assertAbsolutePath(input.journalPath, 'journalPath')
  const signedRecordPath = assertAbsolutePath(input.signedRecordPath, 'signedRecordPath')
  const profileId = assertProfileId(input.profileId)
  const journal = await readCloakTransactionJournal(journalPath)
  if (!journal) {
    return {
      recovered: false,
      transactionId: '',
      profileId,
      interruptedStage: '',
      restoredPreviousSignedRecord: false,
      removedUncommittedSignedRecord: false,
      trustedStateRollbackAttempted: false,
    }
  }
  if (
    journal.profileId !== profileId ||
    path.resolve(journal.signedRecordPath) !== signedRecordPath
  ) {
    throw new CloakTransactionRecoveryError(
      'journal_invalid',
      'Interrupted Cloak transaction journal does not match the requested Profile and signed-record path.',
    )
  }

  let trustedStateRollbackAttempted = false
  let restoredPreviousSignedRecord = false
  let removedUncommittedSignedRecord = false
  try {
    if (journal.trustedStatePublished || journal.stage === 'trust-publication' || journal.stage === 'trusted') {
      trustedStateRollbackAttempted = true
      await input.rollbackTrustedState?.(journal)
    }
    if (journal.previousSignedRecordBase64 !== null) {
      await atomicWritePrivate(
        signedRecordPath,
        Buffer.from(journal.previousSignedRecordBase64, 'base64').toString('utf8'),
      )
      restoredPreviousSignedRecord = true
    } else {
      await removeAndSync(signedRecordPath)
      removedUncommittedSignedRecord = true
    }
    await removeAndSync(journalPath)
  } catch (error) {
    throw new CloakTransactionRecoveryError(
      'recovery_failed',
      `Unable to recover interrupted Cloak transaction ${journal.transactionId}.`,
      error,
    )
  }
  return {
    recovered: true,
    transactionId: journal.transactionId,
    profileId,
    interruptedStage: journal.stage,
    restoredPreviousSignedRecord,
    removedUncommittedSignedRecord,
    trustedStateRollbackAttempted,
  }
}
