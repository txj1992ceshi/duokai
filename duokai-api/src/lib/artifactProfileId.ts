export function normalizeArtifactProfileId(profileId: unknown): string {
  return String(profileId || '').trim();
}

export function buildArtifactProfileKey(userId: unknown, profileId: unknown, snapshotId?: unknown): string {
  const base = `${String(userId || '').trim()}::${normalizeArtifactProfileId(profileId)}`;
  const suffix = snapshotId === undefined ? '' : `::${String(snapshotId || '').trim()}`;
  return `${base}${suffix}`;
}
