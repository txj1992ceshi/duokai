import { apiFetch } from '@/lib/api-client';
import type { WorkspaceSnapshotRecord } from '@/lib/dashboard-types';

export async function listWorkspaceSnapshots(
  profileId: string
): Promise<WorkspaceSnapshotRecord[]> {
  const res = await apiFetch(`/api/workspace-snapshots/${profileId}`);
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Failed to fetch workspace snapshots');
  }

  return Array.isArray(data.snapshots) ? (data.snapshots as WorkspaceSnapshotRecord[]) : [];
}
