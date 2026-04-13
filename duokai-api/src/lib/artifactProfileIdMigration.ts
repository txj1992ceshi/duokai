import { connectMongo } from './mongodb.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';
import { WorkspaceSnapshotModel } from '../models/WorkspaceSnapshot.js';
import { buildArtifactProfileKey, normalizeArtifactProfileId } from './artifactProfileId.js';

type DuplicateConflict = {
  collection: 'ProfileStorageState' | 'WorkspaceSnapshot';
  key: string;
  ids: string[];
};

export interface ArtifactProfileIdMigrationResult {
  storageStatesScanned: number;
  storageStatesUpdated: number;
  workspaceSnapshotsScanned: number;
  workspaceSnapshotsUpdated: number;
  duplicateConflicts: DuplicateConflict[];
  dryRun: boolean;
}

function normalizeDocumentId(value: unknown): string {
  return String(value || '').trim();
}

export async function migrateArtifactProfileIds(
  options: { dryRun?: boolean } = {},
): Promise<ArtifactProfileIdMigrationResult> {
  await connectMongo();

  const storageCollection = ProfileStorageStateModel.collection;
  const snapshotCollection = WorkspaceSnapshotModel.collection;

  const [storageStates, workspaceSnapshots] = await Promise.all([
    storageCollection.find({}, { projection: { _id: 1, userId: 1, profileId: 1 } }).toArray(),
    snapshotCollection.find({}, { projection: { _id: 1, userId: 1, profileId: 1, snapshotId: 1 } }).toArray(),
  ]);

  const duplicateConflicts: DuplicateConflict[] = [];

  const storageKeyMap = new Map<string, string[]>();
  for (const item of storageStates) {
    const key = buildArtifactProfileKey(item.userId, item.profileId);
    const ids = storageKeyMap.get(key) || [];
    ids.push(normalizeDocumentId(item._id));
    storageKeyMap.set(key, ids);
  }
  for (const [key, ids] of storageKeyMap.entries()) {
    if (ids.length > 1) {
      duplicateConflicts.push({
        collection: 'ProfileStorageState',
        key,
        ids,
      });
    }
  }

  const snapshotKeyMap = new Map<string, string[]>();
  for (const item of workspaceSnapshots) {
    const key = buildArtifactProfileKey(item.userId, item.profileId, item.snapshotId);
    const ids = snapshotKeyMap.get(key) || [];
    ids.push(normalizeDocumentId(item._id));
    snapshotKeyMap.set(key, ids);
  }
  for (const [key, ids] of snapshotKeyMap.entries()) {
    if (ids.length > 1) {
      duplicateConflicts.push({
        collection: 'WorkspaceSnapshot',
        key,
        ids,
      });
    }
  }

  if (duplicateConflicts.length > 0) {
    if (!options.dryRun) {
      throw new Error(
        `Found ${duplicateConflicts.length} duplicate artifact profileId conflicts. Resolve them before running the migration.`,
      );
    }
    return {
      storageStatesScanned: storageStates.length,
      storageStatesUpdated: 0,
      workspaceSnapshotsScanned: workspaceSnapshots.length,
      workspaceSnapshotsUpdated: 0,
      duplicateConflicts,
      dryRun: true,
    };
  }

  let storageStatesUpdated = 0;
  let workspaceSnapshotsUpdated = 0;

  if (!options.dryRun) {
    for (const item of storageStates) {
      const normalizedProfileId = normalizeArtifactProfileId(item.profileId);
      if (typeof item.profileId === 'string' && item.profileId.trim() === normalizedProfileId) {
        continue;
      }
      await storageCollection.updateOne(
        { _id: item._id },
        { $set: { profileId: normalizedProfileId } },
      );
      storageStatesUpdated += 1;
    }

    for (const item of workspaceSnapshots) {
      const normalizedProfileId = normalizeArtifactProfileId(item.profileId);
      if (typeof item.profileId === 'string' && item.profileId.trim() === normalizedProfileId) {
        continue;
      }
      await snapshotCollection.updateOne(
        { _id: item._id },
        { $set: { profileId: normalizedProfileId } },
      );
      workspaceSnapshotsUpdated += 1;
    }

    await Promise.all([
      storageCollection.dropIndexes().catch(() => undefined),
      snapshotCollection.dropIndexes().catch(() => undefined),
    ]);
    await Promise.all([
      ProfileStorageStateModel.syncIndexes(),
      WorkspaceSnapshotModel.syncIndexes(),
    ]);
  } else {
    storageStatesUpdated = storageStates.filter((item) => typeof item.profileId !== 'string').length;
    workspaceSnapshotsUpdated = workspaceSnapshots.filter((item) => typeof item.profileId !== 'string').length;
  }

  return {
    storageStatesScanned: storageStates.length,
    storageStatesUpdated,
    workspaceSnapshotsScanned: workspaceSnapshots.length,
    workspaceSnapshotsUpdated,
    duplicateConflicts,
    dryRun: !!options.dryRun,
  };
}
