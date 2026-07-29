import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  CloakTransactionRecoveryError,
  CloakTransactionRecoveryJournal,
  readCloakTransactionJournal,
  recoverInterruptedCloakProductionTransaction,
} from './cloakBrowserTransactionRecovery.ts'
import type { CloakSignedTrustedIdentityRecord } from './cloakBrowserSnapshotSignature.ts'

function recordFixture(profileId: string, snapshotId: string): CloakSignedTrustedIdentityRecord {
  return {
    schemaVersion: 1,
    snapshot: {
      profileId,
      snapshotId,
    },
    signature: {
      payloadSha256: 'a'.repeat(64),
    },
  } as unknown as CloakSignedTrustedIdentityRecord
}

async function fixture(): Promise<{
  root: string
  journalPath: string
  signedRecordPath: string
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-recovery-'))
  return {
    root,
    journalPath: path.join(root, 'transaction-journal.json'),
    signedRecordPath: path.join(root, 'trusted-identity.json'),
  }
}

test('recovery is idempotent when no interrupted journal exists', async () => {
  const value = await fixture()
  try {
    const first = await recoverInterruptedCloakProductionTransaction({
      journalPath: value.journalPath,
      signedRecordPath: value.signedRecordPath,
      profileId: 'profile-1',
    })
    const second = await recoverInterruptedCloakProductionTransaction({
      journalPath: value.journalPath,
      signedRecordPath: value.signedRecordPath,
      profileId: 'profile-1',
    })
    assert.equal(first.recovered, false)
    assert.deepEqual(second, first)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('interruption after snapshot persistence removes an uncommitted new record', async () => {
  const value = await fixture()
  try {
    const journal = new CloakTransactionRecoveryJournal({
      ...value,
      profileId: 'profile-1',
      transactionId: () => 'tx-remove-new',
      now: () => new Date('2026-07-27T18:00:00.000Z'),
    })
    await journal.begin()
    await journal.transition('snapshot-persistence')
    await writeFile(value.signedRecordPath, 'new-record\n', { mode: 0o600 })
    await journal.markSnapshotPersisted(recordFixture('profile-1', 'snapshot-new'))

    const recovered = await recoverInterruptedCloakProductionTransaction({
      journalPath: value.journalPath,
      signedRecordPath: value.signedRecordPath,
      profileId: 'profile-1',
    })
    assert.equal(recovered.recovered, true)
    assert.equal(recovered.removedUncommittedSignedRecord, true)
    await assert.rejects(readFile(value.signedRecordPath), { code: 'ENOENT' })
    assert.equal(await readCloakTransactionJournal(value.journalPath), null)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('interruption after trust publication restores the previous signed record and rolls trust back', async () => {
  const value = await fixture()
  try {
    await writeFile(value.signedRecordPath, 'previous-record\n', { mode: 0o600 })
    const journal = new CloakTransactionRecoveryJournal({
      ...value,
      profileId: 'profile-1',
      transactionId: () => 'tx-restore-previous',
      now: () => new Date('2026-07-27T18:10:00.000Z'),
    })
    await journal.begin()
    await journal.transition('snapshot-persistence')
    await writeFile(value.signedRecordPath, 'new-record\n', { mode: 0o600 })
    await journal.markSnapshotPersisted(recordFixture('profile-1', 'snapshot-new'))
    await journal.transition('trust-publication')
    await journal.markTrustedStatePublished()
    await journal.transition('trusted')

    let rollbackCalls = 0
    const recovered = await recoverInterruptedCloakProductionTransaction({
      journalPath: value.journalPath,
      signedRecordPath: value.signedRecordPath,
      profileId: 'profile-1',
      rollbackTrustedState: async (interrupted) => {
        rollbackCalls += 1
        assert.equal(interrupted.transactionId, 'tx-restore-previous')
      },
    })
    assert.equal(rollbackCalls, 1)
    assert.equal(recovered.trustedStateRollbackAttempted, true)
    assert.equal(recovered.restoredPreviousSignedRecord, true)
    assert.equal(await readFile(value.signedRecordPath, 'utf8'), 'previous-record\n')
    assert.equal(await readCloakTransactionJournal(value.journalPath), null)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('commit clears the journal while preserving the new trusted record', async () => {
  const value = await fixture()
  try {
    const journal = new CloakTransactionRecoveryJournal({
      ...value,
      profileId: 'profile-1',
      transactionId: () => 'tx-commit',
      now: () => new Date('2026-07-27T18:20:00.000Z'),
    })
    await journal.begin()
    await writeFile(value.signedRecordPath, 'committed-record\n', { mode: 0o600 })
    await journal.markSnapshotPersisted(recordFixture('profile-1', 'snapshot-committed'))
    await journal.markTrustedStatePublished()
    await journal.commit()

    assert.equal(await readCloakTransactionJournal(value.journalPath), null)
    assert.equal(await readFile(value.signedRecordPath, 'utf8'), 'committed-record\n')
    const recovered = await recoverInterruptedCloakProductionTransaction({
      journalPath: value.journalPath,
      signedRecordPath: value.signedRecordPath,
      profileId: 'profile-1',
    })
    assert.equal(recovered.recovered, false)
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})

test('tampered journal fails closed without changing the signed record', async () => {
  const value = await fixture()
  try {
    await writeFile(value.signedRecordPath, 'previous-record\n', { mode: 0o600 })
    const journal = new CloakTransactionRecoveryJournal({
      ...value,
      profileId: 'profile-1',
      transactionId: () => 'tx-tampered',
      now: () => new Date('2026-07-27T18:30:00.000Z'),
    })
    await journal.begin()
    const parsed = JSON.parse(await readFile(value.journalPath, 'utf8')) as Record<string, unknown>
    parsed.stage = 'trusted'
    await writeFile(value.journalPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 })

    await assert.rejects(
      recoverInterruptedCloakProductionTransaction({
        journalPath: value.journalPath,
        signedRecordPath: value.signedRecordPath,
        profileId: 'profile-1',
      }),
      (error: unknown) =>
        error instanceof CloakTransactionRecoveryError && error.code === 'journal_invalid',
    )
    assert.equal(await readFile(value.signedRecordPath, 'utf8'), 'previous-record\n')
  } finally {
    await rm(value.root, { recursive: true, force: true })
  }
})
