import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDefaultFingerprint, createProfilePayload, normalizeWorkspaceDescriptor } from './factories.ts'
import {
  applyLastKnownGoodAssessment,
  createWorkspaceSnapshot,
  doesWorkspaceSnapshotMatchProfile,
  evaluateLastKnownGoodSnapshot,
  listWorkspaceSnapshots,
  restoreWorkspaceSnapshot,
  rollbackWorkspaceToLastKnownGood,
  updateWorkspaceSnapshotValidation,
} from './workspaceSnapshots.ts'
import type { ProfileRecord } from '../../src/shared/types.ts'

function buildProfile(profileId = 'snapshot-profile'): ProfileRecord {
  const root = mkdtempSync(path.join(os.tmpdir(), `duokai-snapshot-${profileId}-`))
  const workspaceRoot = path.join(root, 'workspaces', profileId)
  const paths = {
    profileDir: path.join(workspaceRoot, 'profile'),
    cacheDir: path.join(workspaceRoot, 'cache'),
    downloadsDir: path.join(workspaceRoot, 'downloads'),
    extensionsDir: path.join(workspaceRoot, 'extensions'),
    metaDir: path.join(workspaceRoot, 'meta'),
  }
  for (const targetPath of Object.values(paths)) {
    mkdirSync(targetPath, { recursive: true })
  }
  writeFileSync(path.join(paths.profileDir, 'storageState.json'), JSON.stringify({ cookies: [] }), 'utf8')

  const fingerprint = createDefaultFingerprint()
  fingerprint.runtimeMetadata.lastStorageStateVersion = 3
  fingerprint.runtimeMetadata.lastStorageStateSyncedAt = '2026-04-03T00:00:00.000Z'
  fingerprint.runtimeMetadata.lastStorageStateDeviceId = 'device-1'

  const payload = createProfilePayload(
    {
      id: profileId,
      name: 'Snapshot Profile',
      proxyId: null,
      groupName: 'Group',
      tags: [],
      notes: '',
      fingerprintConfig: fingerprint,
      workspace: normalizeWorkspaceDescriptor(
        {
          migrationState: 'completed',
          migrationCheckpoints: [{ name: 'migration_completed', completedAt: '2026-04-03T00:00:00.000Z' }],
          templateBinding: {
            templateId: 'template-1',
            templateRevision: 'rev-1',
            templateFingerprintHash: '',
          },
          paths,
        },
        profileId,
        fingerprint,
      ),
    },
    createDefaultFingerprint,
  )

  return {
    ...payload,
    environmentPurpose: payload.environmentPurpose!,
    deviceProfile: payload.deviceProfile!,
    workspace: payload.workspace!,
    status: 'stopped',
    lastStartedAt: null,
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
  }
}

test('createWorkspaceSnapshot writes local snapshot manifest with storage and directory metadata', async () => {
  const profile = buildProfile()
  const snapshot = await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-1',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })

  assert.equal(snapshot.snapshotId, 'snapshot-1')
  assert.equal(snapshot.profileId, profile.id)
  assert.equal(snapshot.storageState.version, 3)
  assert.deepEqual(snapshot.storageState.stateJson, { cookies: [] })
  assert.equal(snapshot.directoryManifest.length, 5)
  assert.equal(snapshot.validatedStartAt, undefined)
})

test('listWorkspaceSnapshots returns newest-first for one profile only', async () => {
  const profile = buildProfile('snapshot-list')
  await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-old',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })
  await new Promise((resolve) => setTimeout(resolve, 5))
  await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-new',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })

  const snapshots = await listWorkspaceSnapshots(profile)
  assert.deepEqual(
    snapshots.map((item) => item.snapshotId),
    ['snapshot-new', 'snapshot-old'],
  )
})

test('updateWorkspaceSnapshotValidation marks snapshot with validatedStartAt', async () => {
  const profile = buildProfile('snapshot-validate')
  await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-validate-1',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })

  const updated = await updateWorkspaceSnapshotValidation(
    profile,
    'snapshot-validate-1',
    '2026-04-03T01:00:00.000Z',
  )
  assert.equal(updated?.validatedStartAt, '2026-04-03T01:00:00.000Z')
})

test('evaluateLastKnownGoodSnapshot returns valid for a matching validated snapshot', async () => {
  const profile = buildProfile('snapshot-good-status')
  const snapshot = await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-good-status-1',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })
  await updateWorkspaceSnapshotValidation(profile, 'snapshot-good-status-1', '2026-04-03T01:00:00.000Z')
  const profileWithGood: ProfileRecord = {
    ...profile,
    workspace: {
      ...profile.workspace!,
      snapshotSummary: {
        ...profile.workspace!.snapshotSummary,
        lastKnownGoodSnapshotId: 'snapshot-good-status-1',
        lastKnownGoodSnapshotAt: '2026-04-03T01:00:00.000Z',
      },
    },
  }

  const assessment = await evaluateLastKnownGoodSnapshot(profileWithGood, {
    storageState: {
      ...snapshot.storageState,
      stateJson: undefined,
    },
  })

  assert.equal(assessment.status, 'valid')
})

test('evaluateLastKnownGoodSnapshot invalidates drifted snapshots and preserves reason metadata', async () => {
  const profile = buildProfile('snapshot-invalidated')
  await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-invalidated-1',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })
  await updateWorkspaceSnapshotValidation(profile, 'snapshot-invalidated-1', '2026-04-03T01:00:00.000Z')
  const profileWithDrift = {
    ...profile,
    workspace: {
      ...profile.workspace!,
      resolvedEnvironment: {
        ...profile.workspace!.resolvedEnvironment,
        timezone: 'Asia/Shanghai',
      },
      snapshotSummary: {
        ...profile.workspace!.snapshotSummary,
        lastKnownGoodSnapshotId: 'snapshot-invalidated-1',
        lastKnownGoodSnapshotAt: '2026-04-03T01:00:00.000Z',
      },
    },
  }

  const assessment = await evaluateLastKnownGoodSnapshot(profileWithDrift, {
    storageState: {
      version: 3,
      stateHash: 'mismatched-hash',
      updatedAt: '2026-04-03T00:00:00.000Z',
      deviceId: 'device-1',
      source: 'local-disk',
    },
  })
  const nextSummary = applyLastKnownGoodAssessment(profileWithDrift.workspace.snapshotSummary, {
    status: 'invalid',
    reason: assessment.reason,
    invalidatedAt: '2026-04-03T02:00:00.000Z',
  })

  assert.equal(assessment.status, 'invalid')
  assert.equal(assessment.reason, 'snapshot:drifted')
  assert.equal(nextSummary.lastKnownGoodStatus, 'invalid')
  assert.equal(nextSummary.lastKnownGoodInvalidationReason, 'snapshot:drifted')
})

test('applyLastKnownGoodAssessment does not auto-promote invalid snapshots back to valid', () => {
  const profile = buildProfile('snapshot-no-autopromote')
  const nextSummary = applyLastKnownGoodAssessment(
    {
      ...profile.workspace!.snapshotSummary,
      lastKnownGoodSnapshotId: 'snapshot-good-1',
      lastKnownGoodSnapshotAt: '2026-04-03T01:00:00.000Z',
      lastKnownGoodStatus: 'invalid',
      lastKnownGoodInvalidatedAt: '2026-04-03T02:00:00.000Z',
      lastKnownGoodInvalidationReason: 'snapshot:drifted',
    },
    {
      status: 'valid',
      reason: '',
    },
  )

  assert.equal(nextSummary.lastKnownGoodStatus, 'invalid')
  assert.equal(nextSummary.lastKnownGoodInvalidationReason, 'snapshot:drifted')
})

test('doesWorkspaceSnapshotMatchProfile compares workspace and storage state metadata', async () => {
  const profile = buildProfile('snapshot-match')
  const snapshot = await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-match-1',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })

  assert.equal(
    doesWorkspaceSnapshotMatchProfile(snapshot, profile, snapshot.storageState),
    true,
  )
  assert.equal(
    doesWorkspaceSnapshotMatchProfile(snapshot, profile, {
      ...snapshot.storageState,
      stateHash: 'different',
    }),
    false,
  )
})

test('restoreWorkspaceSnapshot writes stateJson back to disk and records recovery metadata', async () => {
  const profile = buildProfile('snapshot-restore')
  await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-restore-1',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })
  writeFileSync(path.join(profile.workspace!.paths.profileDir, 'storageState.json'), JSON.stringify({ cookies: [{ name: 'changed' }] }), 'utf8')

  const restored = await restoreWorkspaceSnapshot(profile, 'snapshot-restore-1', {
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    recoveryReason: 'restore:snapshot-restore-1',
  })

  assert.equal(restored.profile.workspace?.identityProfileId, profile.id)
  assert.equal(restored.profile.workspace?.snapshotSummary.lastSnapshotId, 'snapshot-restore-1')
  assert.equal(restored.profile.workspace?.recovery.lastRecoveryReason, 'restore:snapshot-restore-1')
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(profile.workspace!.paths.profileDir, 'storageState.json'), 'utf8')),
    { cookies: [] },
  )
})

test('restoreWorkspaceSnapshot falls back to remote snapshot when local file is missing', async () => {
  const profile = buildProfile('snapshot-remote')
  const snapshot = await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-remote-1',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })
  const localSnapshotPath = path.join(profile.workspace!.paths.metaDir, 'snapshots', 'snapshot-remote-1.json')
  unlinkSync(localSnapshotPath)

  const restored = await restoreWorkspaceSnapshot(profile, 'snapshot-remote-1', {
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    recoveryReason: 'restore:snapshot-remote-1',
    fetchRemoteSnapshot: async () => snapshot,
  })

  assert.equal(restored.snapshot.snapshotId, 'snapshot-remote-1')
  assert.equal(existsSync(localSnapshotPath), true)
})

test('restoreWorkspaceSnapshot rejects legacy snapshots without stateJson', async () => {
  const profile = buildProfile('snapshot-legacy')
  const snapshot = await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-legacy-1',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })
  const legacySnapshot = {
    ...snapshot,
    storageState: {
      ...snapshot.storageState,
      stateJson: undefined,
    },
  }
  writeFileSync(
    path.join(profile.workspace!.paths.metaDir, 'snapshots', 'snapshot-legacy-1.json'),
    JSON.stringify(legacySnapshot, null, 2),
    'utf8',
  )

  await assert.rejects(
    restoreWorkspaceSnapshot(profile, 'snapshot-legacy-1', {
      storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
      recoveryReason: 'restore:snapshot-legacy-1',
    }),
    /not restorable in v1/i,
  )
})

test('rollbackWorkspaceToLastKnownGood restores the referenced snapshot', async () => {
  const profile = buildProfile('snapshot-rollback')
  await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-good-1',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })
  const profileWithGood: ProfileRecord = {
    ...profile,
    workspace: {
      ...profile.workspace!,
      snapshotSummary: {
        ...profile.workspace!.snapshotSummary,
        lastKnownGoodSnapshotId: 'snapshot-good-1',
        lastKnownGoodSnapshotAt: '2026-04-03T01:00:00.000Z',
        lastKnownGoodStatus: 'valid',
      },
    },
  }

  const rolledBack = await rollbackWorkspaceToLastKnownGood(profileWithGood, {
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
  })

  assert.equal(rolledBack.snapshot.snapshotId, 'snapshot-good-1')
  assert.equal(
    rolledBack.profile.workspace?.recovery.lastRecoveryReason,
    'rollback:last_known_good:snapshot-good-1',
  )
})

test('rollbackWorkspaceToLastKnownGood rejects invalidated last known good snapshots', async () => {
  const profile = buildProfile('snapshot-rollback-invalid')
  const profileWithInvalidGood: ProfileRecord = {
    ...profile,
    workspace: {
      ...profile.workspace!,
      snapshotSummary: {
        ...profile.workspace!.snapshotSummary,
        lastKnownGoodSnapshotId: 'snapshot-invalid',
        lastKnownGoodSnapshotAt: '2026-04-03T01:00:00.000Z',
        lastKnownGoodStatus: 'invalid',
        lastKnownGoodInvalidatedAt: '2026-04-03T02:00:00.000Z',
        lastKnownGoodInvalidationReason: 'snapshot:drifted',
      },
    },
  }

  await assert.rejects(
    rollbackWorkspaceToLastKnownGood(profileWithInvalidGood, {
      storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    }),
    /invalidated/i,
  )
})
