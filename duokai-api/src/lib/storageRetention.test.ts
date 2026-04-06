import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStorageRetentionPlan } from './storageRetention.js';

test('buildStorageRetentionPlan keeps current storage-state artifacts and marks stale files', () => {
  const plan = buildStorageRetentionPlan({
    storageStates: [
      { userId: 'u1', profileId: 'p1', fileRef: '/repo/storage-state-backup/u1/p1/v3.json.gz' },
    ],
    workspaceSnapshots: [],
    storageStateFiles: [
      '/repo/storage-state-backup/u1/p1/v1.json.gz',
      '/repo/storage-state-backup/u1/p1/v3.json.gz',
    ],
    snapshotFiles: [],
    snapshotRetentionCount: 3,
  });

  assert.deepEqual(plan.keptStorageStateFileRefs, ['/repo/storage-state-backup/u1/p1/v3.json.gz']);
  assert.deepEqual(plan.staleStorageStateFileRefs, ['/repo/storage-state-backup/u1/p1/v1.json.gz']);
});

test('buildStorageRetentionPlan keeps only recent N snapshots per profile and deletes stale files', () => {
  const plan = buildStorageRetentionPlan({
    storageStates: [],
    workspaceSnapshots: [
      {
        id: 's1',
        userId: 'u1',
        profileId: 'p1',
        snapshotId: 'snap-1',
        fileRef: '/repo/workspace-snapshot/u1/p1/snap-1.json.gz',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 's2',
        userId: 'u1',
        profileId: 'p1',
        snapshotId: 'snap-2',
        fileRef: '/repo/workspace-snapshot/u1/p1/snap-2.json.gz',
        updatedAt: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 's3',
        userId: 'u1',
        profileId: 'p1',
        snapshotId: 'snap-3',
        fileRef: '/repo/workspace-snapshot/u1/p1/snap-3.json.gz',
        updatedAt: '2026-04-03T00:00:00.000Z',
      },
      {
        id: 's4',
        userId: 'u1',
        profileId: 'p2',
        snapshotId: 'snap-4',
        fileRef: '/repo/workspace-snapshot/u1/p2/snap-4.json.gz',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    ],
    storageStateFiles: [],
    snapshotFiles: [
      '/repo/workspace-snapshot/u1/p1/snap-1.json.gz',
      '/repo/workspace-snapshot/u1/p1/snap-2.json.gz',
      '/repo/workspace-snapshot/u1/p1/snap-3.json.gz',
      '/repo/workspace-snapshot/u1/p2/snap-4.json.gz',
      '/repo/workspace-snapshot/u1/p9/orphan.json.gz',
    ],
    snapshotRetentionCount: 2,
  });

  assert.deepEqual(plan.keptSnapshotIds.sort(), ['s2', 's3', 's4']);
  assert.deepEqual(plan.snapshotIdsToDelete, ['s1']);
  assert.deepEqual(plan.snapshotFileRefsToDelete, ['/repo/workspace-snapshot/u1/p1/snap-1.json.gz']);
  assert.deepEqual(
    plan.staleSnapshotFileRefs.sort(),
    [
      '/repo/workspace-snapshot/u1/p1/snap-1.json.gz',
      '/repo/workspace-snapshot/u1/p9/orphan.json.gz',
    ].sort()
  );
});
