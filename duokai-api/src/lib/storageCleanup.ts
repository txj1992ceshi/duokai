import { connectMongo } from './mongodb.js';
import { buildStorageRetentionPlan } from './storageRetention.js';
import { deleteArtifactFile, listArtifactFiles } from './fileRepository.js';
import { normalizeArtifactProfileId } from './artifactProfileId.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';
import { WorkspaceSnapshotModel } from '../models/WorkspaceSnapshot.js';

export interface StorageCleanupResult {
  storageStatesKept: number;
  staleStorageStateFilesDeleted: number;
  snapshotsKept: number;
  snapshotsDeleted: number;
  staleSnapshotFilesDeleted: number;
  dryRun: boolean;
}

function getSnapshotRetentionCount(): number {
  const parsed = Number(process.env.DUOKAI_SNAPSHOT_RETENTION_COUNT || 5);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 5;
}

export async function cleanupStorageArtifacts(options: { dryRun?: boolean } = {}): Promise<StorageCleanupResult> {
  await connectMongo();

  const [storageStates, workspaceSnapshots, storageStateFiles, snapshotFiles] = await Promise.all([
    ProfileStorageStateModel.find({}, { userId: 1, profileId: 1, fileRef: 1 }).lean(),
    WorkspaceSnapshotModel.find({}, { userId: 1, profileId: 1, snapshotId: 1, fileRef: 1, updatedAt: 1 }).lean(),
    listArtifactFiles('storage-state-backup'),
    listArtifactFiles('workspace-snapshot'),
  ]);

  const plan = buildStorageRetentionPlan({
    storageStates: storageStates.map((item) => ({
      userId: String(item.userId || ''),
      profileId: normalizeArtifactProfileId(item.profileId),
      fileRef: String(item.fileRef || ''),
    })),
    workspaceSnapshots: workspaceSnapshots.map((item) => ({
      id: String(item._id || ''),
      userId: String(item.userId || ''),
      profileId: normalizeArtifactProfileId(item.profileId),
      snapshotId: String(item.snapshotId || ''),
      fileRef: String(item.fileRef || ''),
      updatedAt: item.updatedAt || null,
    })),
    storageStateFiles,
    snapshotFiles,
    snapshotRetentionCount: getSnapshotRetentionCount(),
  });

  if (!options.dryRun) {
    await Promise.all(plan.staleStorageStateFileRefs.map((fileRef) => deleteArtifactFile(fileRef)));
    await Promise.all(plan.staleSnapshotFileRefs.map((fileRef) => deleteArtifactFile(fileRef)));
    if (plan.snapshotIdsToDelete.length > 0) {
      await WorkspaceSnapshotModel.deleteMany({ _id: { $in: plan.snapshotIdsToDelete } });
    }
  }

  return {
    storageStatesKept: plan.keptStorageStateFileRefs.length,
    staleStorageStateFilesDeleted: plan.staleStorageStateFileRefs.length,
    snapshotsKept: plan.keptSnapshotIds.length,
    snapshotsDeleted: plan.snapshotIdsToDelete.length,
    staleSnapshotFilesDeleted: plan.staleSnapshotFileRefs.length,
    dryRun: !!options.dryRun,
  };
}
