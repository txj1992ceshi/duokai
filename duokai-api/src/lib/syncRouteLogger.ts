import { getFileRepositoryRoot } from './fileRepository.js';

export type SyncRouteProfileSource = 'mongo' | 'config' | 'missing';
export type SyncRouteProfileIdType = 'objectId' | 'uuid-or-config';

export function resolveProfileIdType(profileId: string): SyncRouteProfileIdType {
  return /^[a-fA-F0-9]{24}$/.test(String(profileId || '').trim()) ? 'objectId' : 'uuid-or-config';
}

export function logSyncRouteEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  details: Record<string, unknown>
): void {
  const payload = {
    event,
    ...details,
  };
  const line = `[duokai-api][sync] ${JSON.stringify(payload)}`;
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.info(line);
}

export function buildArtifactContext(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fileRepositoryRoot: getFileRepositoryRoot(),
    ...extra,
  };
}
