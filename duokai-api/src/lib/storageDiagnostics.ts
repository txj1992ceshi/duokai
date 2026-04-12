import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

import { ensureFileRepositoryRoot, getFileRepositoryRoot } from './fileRepository.js';
import { hasLegacyWorkspaceSnapshotPayload } from './storageView.js';
import { ProfileStorageStateModel } from '../models/ProfileStorageState.js';
import { WorkspaceSnapshotModel } from '../models/WorkspaceSnapshot.js';

export interface StorageDiagnosticsSummary {
  fileRepositoryRoot: string;
  fileRepositoryReady: boolean;
  fileRepositoryWritable: boolean;
  storageStateBackedByFile: number;
  workspaceSnapshotBackedByFile: number;
  legacyInlinePayloadCount: number;
  storageStateLegacyInlineCount: number;
  workspaceSnapshotLegacyInlineCount: number;
  unreadableFileRefCount: number;
}

function hasInlineStorageStatePayload(value: Record<string, unknown>): boolean {
  return (
    (value.inlineStateJson !== null && value.inlineStateJson !== undefined) ||
    (value.stateJson !== null && value.stateJson !== undefined)
  );
}

export async function collectStorageDiagnosticsSummary(): Promise<StorageDiagnosticsSummary> {
  const fileRepositoryRoot = getFileRepositoryRoot();

  let fileRepositoryReady = false;
  let fileRepositoryWritable = false;
  try {
    const ensuredRoot = await ensureFileRepositoryRoot();
    fileRepositoryReady = ensuredRoot === fileRepositoryRoot;
    await access(fileRepositoryRoot, fsConstants.R_OK | fsConstants.W_OK);
    fileRepositoryWritable = true;
  } catch {
    fileRepositoryReady = false;
    fileRepositoryWritable = false;
  }

  const [storageStates, workspaceSnapshots] = await Promise.all([
    ProfileStorageStateModel.find({}, { fileRef: 1, inlineStateJson: 1, stateJson: 1 }).lean(),
    WorkspaceSnapshotModel.find(
      {},
      { fileRef: 1, manifest: 1, workspaceMetadata: 1, storageState: 1, directoryManifest: 1 }
    ).lean(),
  ]);

  const storageStateBackedByFile = storageStates.filter(
    (item) => String(item.fileRef || '').trim().length > 0
  ).length;
  const storageStateLegacyInlineCount = storageStates.filter((item) =>
    hasInlineStorageStatePayload(item as Record<string, unknown>)
  ).length;

  const workspaceSnapshotBackedByFile = workspaceSnapshots.filter(
    (item) => String(item.fileRef || '').trim().length > 0
  ).length;
  const workspaceSnapshotLegacyInlineCount = workspaceSnapshots.filter((item) =>
    hasLegacyWorkspaceSnapshotPayload(item as Record<string, unknown>)
  ).length;

  const uniqueFileRefs = new Set<string>();
  for (const item of storageStates) {
    const fileRef = String(item.fileRef || '').trim();
    if (fileRef) {
      uniqueFileRefs.add(fileRef);
    }
  }
  for (const item of workspaceSnapshots) {
    const fileRef = String(item.fileRef || '').trim();
    if (fileRef) {
      uniqueFileRefs.add(fileRef);
    }
  }

  let unreadableFileRefCount = 0;
  await Promise.all(
    Array.from(uniqueFileRefs).map(async (fileRef) => {
      try {
        await access(fileRef, fsConstants.R_OK);
      } catch {
        unreadableFileRefCount += 1;
      }
    })
  );

  return {
    fileRepositoryRoot,
    fileRepositoryReady,
    fileRepositoryWritable,
    storageStateBackedByFile,
    workspaceSnapshotBackedByFile,
    legacyInlinePayloadCount: storageStateLegacyInlineCount + workspaceSnapshotLegacyInlineCount,
    storageStateLegacyInlineCount,
    workspaceSnapshotLegacyInlineCount,
    unreadableFileRefCount,
  };
}
