export function shouldIncludeArtifactContent(input: unknown): boolean {
  const normalized = String(input || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'full';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function compactStorageStatePayload(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  const next = { ...value };
  if ('inlineStateJson' in next) {
    next.inlineStateJson = null;
  }
  if ('stateJson' in next) {
    next.stateJson = null;
  }
  return next;
}

export function compactWorkspaceSnapshotManifest(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const next: Record<string, unknown> = {};
  for (const key of [
    'schemaVersion',
    'createdBy',
    'workspaceIdentityProfileId',
    'templateFingerprintHash',
    'templateRevision',
    'configFingerprintHash',
    'proxyFingerprintHash',
    'trustedSnapshotStatus',
    'storageStateVersion',
    'storageStateHash',
    'workspaceStateHash',
  ]) {
    if (key in value) {
      next[key] = value[key];
    }
  }
  return next;
}

export function compactWorkspaceMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const next: Record<string, unknown> = {};
  for (const key of [
    'identityProfileId',
    'migrationState',
    'migrationCheckpoints',
    'templateBinding',
    'resolvedEnvironment',
  ]) {
    if (key in value) {
      next[key] = value[key];
    }
  }

  if (isRecord(value.healthSummary)) {
    next.healthSummary = value.healthSummary;
  }
  if (isRecord(value.consistencySummary)) {
    next.consistencySummary = value.consistencySummary;
  }

  return next;
}

export function compactWorkspaceSnapshotDocument(
  value: Record<string, unknown>
): Record<string, unknown> {
  return {
    manifest: compactWorkspaceSnapshotManifest(value.manifest),
    workspaceMetadata: compactWorkspaceMetadata(value.workspaceMetadata),
    storageState: compactStorageStatePayload(value.storageState),
    directoryManifest: [],
    healthSummary: isRecord(value.healthSummary) ? value.healthSummary : {},
    consistencySummary: isRecord(value.consistencySummary) ? value.consistencySummary : {},
  };
}
