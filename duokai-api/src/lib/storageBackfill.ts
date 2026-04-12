import { connectMongo } from './mongodb.js';
import {
  resolveStorageStateJson,
  writeStorageStateArtifact,
  writeWorkspaceSnapshotArtifact,
} from './storageArtifacts.js';
import { compactWorkspaceSnapshotDocument } from './storageView.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';
import { WorkspaceSnapshotModel } from '../models/WorkspaceSnapshot.js';

export interface StorageBackfillResult {
  storageStatesScanned: number;
  storageStatesBackfilled: number;
  storageStatesCompacted: number;
  storageStateFailures: number;
  workspaceSnapshotsScanned: number;
  workspaceSnapshotsBackfilled: number;
  workspaceSnapshotsCompacted: number;
  workspaceSnapshotFailures: number;
  dryRun: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasInlineStorageStatePayload(value: Record<string, unknown>): boolean {
  return value.inlineStateJson !== null && value.inlineStateJson !== undefined
    || value.stateJson !== null && value.stateJson !== undefined;
}

function hasWorkspaceSnapshotPayload(value: Record<string, unknown>): boolean {
  return (
    (isRecord(value.manifest) && Object.keys(value.manifest).length > 0) ||
    (isRecord(value.workspaceMetadata) && Object.keys(value.workspaceMetadata).length > 0) ||
    (isRecord(value.storageState) && Object.keys(value.storageState).length > 0) ||
    (Array.isArray(value.directoryManifest) && value.directoryManifest.length > 0)
  );
}

function buildSnapshotArtifactPayload(snapshot: Record<string, unknown>) {
  return {
    snapshotId: String(snapshot.snapshotId || ''),
    profileId: String(snapshot.profileId || ''),
    templateRevision: String(snapshot.templateRevision || ''),
    templateFingerprintHash: String(snapshot.templateFingerprintHash || ''),
    manifest: isRecord(snapshot.manifest) ? snapshot.manifest : {},
    workspaceMetadata: isRecord(snapshot.workspaceMetadata) ? snapshot.workspaceMetadata : {},
    storageState: isRecord(snapshot.storageState) ? snapshot.storageState : {},
    directoryManifest: Array.isArray(snapshot.directoryManifest) ? snapshot.directoryManifest : [],
    healthSummary: isRecord(snapshot.healthSummary) ? snapshot.healthSummary : {},
    consistencySummary: isRecord(snapshot.consistencySummary) ? snapshot.consistencySummary : {},
    validatedStartAt: String(snapshot.validatedStartAt || ''),
    createdAt: snapshot.createdAt || '',
    updatedAt: snapshot.updatedAt || '',
  };
}

export async function backfillStorageArtifacts(
  options: { dryRun?: boolean } = {}
): Promise<StorageBackfillResult> {
  await connectMongo();

  const [storageStates, workspaceSnapshots] = await Promise.all([
    ProfileStorageStateModel.find(
      {},
      {
        userId: 1,
        profileId: 1,
        version: 1,
        deviceId: 1,
        source: 1,
        stateHash: 1,
        fileRef: 1,
        checksum: 1,
        size: 1,
        contentType: 1,
        retentionPolicy: 1,
        inlineStateJson: 1,
        stateJson: 1,
      }
    ).lean(),
    WorkspaceSnapshotModel.find(
      {},
      {
        userId: 1,
        profileId: 1,
        snapshotId: 1,
        templateRevision: 1,
        templateFingerprintHash: 1,
        manifest: 1,
        workspaceManifestRef: 1,
        storageStateRef: 1,
        workspaceMetadata: 1,
        storageState: 1,
        directoryManifest: 1,
        healthSummary: 1,
        consistencySummary: 1,
        validatedStartAt: 1,
        fileRef: 1,
        checksum: 1,
        size: 1,
        contentType: 1,
        retentionPolicy: 1,
        createdAt: 1,
        updatedAt: 1,
      }
    ).lean(),
  ]);

  let storageStatesBackfilled = 0;
  let storageStatesCompacted = 0;
  let storageStateFailures = 0;
  for (const item of storageStates) {
    try {
      const record = item as Record<string, unknown>;
      const hasInlinePayload = hasInlineStorageStatePayload(record);
      const hasFileRef = String(record.fileRef || '').trim().length > 0;
      if (!hasInlinePayload) {
        continue;
      }

      const resolvedStateJson = await resolveStorageStateJson({
        inlineStateJson: record.inlineStateJson,
        stateJson: record.stateJson,
        fileRef: String(record.fileRef || ''),
      });
      const version = Math.max(1, Number(record.version || 1));

      let artifact:
        | {
            fileRef: string;
            checksum: string;
            size: number;
            contentType: string;
            retentionPolicy: string;
          }
        | null = null;
      if (!hasFileRef && resolvedStateJson !== null) {
        if (!options.dryRun) {
          artifact = await writeStorageStateArtifact({
            userId: String(record.userId || ''),
            profileId: String(record.profileId || ''),
            version,
            stateJson: resolvedStateJson,
            stateHash: String(record.stateHash || ''),
            deviceId: String(record.deviceId || ''),
            source: String(record.source || 'desktop') || 'desktop',
          });
        }
        storageStatesBackfilled += 1;
      }

      if (!options.dryRun) {
        await ProfileStorageStateModel.updateOne(
          { _id: record._id },
          {
            $set: {
              inlineStateJson: null,
              stateJson: null,
              ...(artifact
                ? {
                    fileRef: artifact.fileRef,
                    checksum: artifact.checksum,
                    size: artifact.size,
                    contentType: artifact.contentType,
                    retentionPolicy: artifact.retentionPolicy,
                    version,
                  }
                : {}),
            },
          }
        );
      }
      storageStatesCompacted += 1;
    } catch (error) {
      storageStateFailures += 1;
      console.warn(
        `[backfill:storage] failed compacting storage state ${String((item as Record<string, unknown>)._id || '')}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  let workspaceSnapshotsBackfilled = 0;
  let workspaceSnapshotsCompacted = 0;
  let workspaceSnapshotFailures = 0;
  for (const item of workspaceSnapshots) {
    try {
      const record = item as Record<string, unknown>;
      const hasPayload = hasWorkspaceSnapshotPayload(record);
      const hasFileRef = String(record.fileRef || '').trim().length > 0;
      if (!hasPayload) {
        continue;
      }

      let artifact:
        | {
            fileRef: string;
            checksum: string;
            size: number;
            contentType: string;
            retentionPolicy: string;
          }
        | null = null;
      if (!hasFileRef) {
        if (!options.dryRun) {
          artifact = await writeWorkspaceSnapshotArtifact({
            userId: String(record.userId || ''),
            profileId: String(record.profileId || ''),
            snapshotId: String(record.snapshotId || ''),
            payload: buildSnapshotArtifactPayload(record),
          });
        }
        workspaceSnapshotsBackfilled += 1;
      }

      if (!options.dryRun) {
        await WorkspaceSnapshotModel.updateOne(
          { _id: record._id },
          {
            $set: {
              ...compactWorkspaceSnapshotDocument(record),
              ...(artifact
                ? {
                    fileRef: artifact.fileRef,
                    checksum: artifact.checksum,
                    size: artifact.size,
                    contentType: artifact.contentType,
                    retentionPolicy: artifact.retentionPolicy,
                  }
                : {}),
            },
          }
        );
      }
      workspaceSnapshotsCompacted += 1;
    } catch (error) {
      workspaceSnapshotFailures += 1;
      console.warn(
        `[backfill:storage] failed compacting workspace snapshot ${String((item as Record<string, unknown>)._id || '')}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return {
    storageStatesScanned: storageStates.length,
    storageStatesBackfilled,
    storageStatesCompacted,
    storageStateFailures,
    workspaceSnapshotsScanned: workspaceSnapshots.length,
    workspaceSnapshotsBackfilled,
    workspaceSnapshotsCompacted,
    workspaceSnapshotFailures,
    dryRun: !!options.dryRun,
  };
}
