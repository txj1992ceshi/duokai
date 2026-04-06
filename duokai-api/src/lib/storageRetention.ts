export interface StorageStateRetentionRecord {
  userId: string;
  profileId: string;
  fileRef: string;
}

export interface WorkspaceSnapshotRetentionRecord {
  id: string;
  userId: string;
  profileId: string;
  snapshotId: string;
  fileRef: string;
  updatedAt?: string | Date | null;
}

export interface StorageRetentionPlan {
  keptStorageStateFileRefs: string[];
  staleStorageStateFileRefs: string[];
  keptSnapshotIds: string[];
  keptSnapshotFileRefs: string[];
  snapshotIdsToDelete: string[];
  snapshotFileRefsToDelete: string[];
  staleSnapshotFileRefs: string[];
}

function normalizePath(value: unknown): string {
  return String(value || '').trim();
}

function normalizeTimestamp(value: string | Date | null | undefined): number {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  }
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function buildStorageRetentionPlan(options: {
  storageStates: StorageStateRetentionRecord[];
  workspaceSnapshots: WorkspaceSnapshotRetentionRecord[];
  storageStateFiles: string[];
  snapshotFiles: string[];
  snapshotRetentionCount: number;
}): StorageRetentionPlan {
  const snapshotRetentionCount = Math.max(1, Math.floor(options.snapshotRetentionCount || 0) || 1);
  const keptStorageStateFileRefs = Array.from(
    new Set(options.storageStates.map((item) => normalizePath(item.fileRef)).filter(Boolean))
  );
  const staleStorageStateFileRefs = Array.from(
    new Set(options.storageStateFiles.map(normalizePath).filter(Boolean))
  ).filter((fileRef) => !keptStorageStateFileRefs.includes(fileRef));

  const snapshotsByProfile = new Map<string, WorkspaceSnapshotRetentionRecord[]>();
  for (const snapshot of options.workspaceSnapshots) {
    const key = `${normalizePath(snapshot.userId)}:${normalizePath(snapshot.profileId)}`;
    const list = snapshotsByProfile.get(key) || [];
    list.push(snapshot);
    snapshotsByProfile.set(key, list);
  }

  const keptSnapshotIds = new Set<string>();
  const keptSnapshotFileRefs = new Set<string>();
  const snapshotIdsToDelete = new Set<string>();
  const snapshotFileRefsToDelete = new Set<string>();

  for (const snapshots of snapshotsByProfile.values()) {
    const sorted = [...snapshots].sort((left, right) => {
      const timestampDelta = normalizeTimestamp(right.updatedAt) - normalizeTimestamp(left.updatedAt);
      if (timestampDelta !== 0) {
        return timestampDelta;
      }
      return normalizePath(right.snapshotId).localeCompare(normalizePath(left.snapshotId));
    });
    sorted.forEach((snapshot, index) => {
      const fileRef = normalizePath(snapshot.fileRef);
      if (index < snapshotRetentionCount) {
        keptSnapshotIds.add(normalizePath(snapshot.id));
        if (fileRef) {
          keptSnapshotFileRefs.add(fileRef);
        }
        return;
      }
      snapshotIdsToDelete.add(normalizePath(snapshot.id));
      if (fileRef) {
        snapshotFileRefsToDelete.add(fileRef);
      }
    });
  }

  const staleSnapshotFileRefs = Array.from(
    new Set(options.snapshotFiles.map(normalizePath).filter(Boolean))
  ).filter((fileRef) => !keptSnapshotFileRefs.has(fileRef));

  return {
    keptStorageStateFileRefs,
    staleStorageStateFileRefs,
    keptSnapshotIds: Array.from(keptSnapshotIds).filter(Boolean),
    keptSnapshotFileRefs: Array.from(keptSnapshotFileRefs),
    snapshotIdsToDelete: Array.from(snapshotIdsToDelete).filter(Boolean),
    snapshotFileRefsToDelete: Array.from(snapshotFileRefsToDelete),
    staleSnapshotFileRefs,
  };
}
