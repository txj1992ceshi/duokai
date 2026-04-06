import { gunzipSync } from 'node:zlib';
import { readArtifactBuffer, writeJsonArtifact, type FileArtifactMetadata } from './fileRepository.js';

function normalizeMaybeObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export async function readJsonArtifactPayload(fileRef: string): Promise<unknown | null> {
  const normalized = String(fileRef || '').trim();
  if (!normalized) {
    return null;
  }
  const buffer = await readArtifactBuffer(normalized);
  const body = normalized.endsWith('.gz') ? gunzipSync(buffer) : buffer;
  return JSON.parse(body.toString('utf8')) as unknown;
}

export async function writeStorageStateArtifact(options: {
  userId: string;
  profileId: string;
  version: number;
  stateJson: unknown;
  stateHash: string;
  deviceId: string;
  source: string;
}): Promise<FileArtifactMetadata> {
  return await writeJsonArtifact({
    kind: 'storage-state-backup',
    ownerId: options.userId,
    objectId: `${options.profileId}/v${options.version}`,
    retentionPolicy: 'latest-only',
    payload: {
      profileId: options.profileId,
      version: options.version,
      stateHash: options.stateHash,
      deviceId: options.deviceId,
      source: options.source,
      stateJson: options.stateJson,
    },
  });
}

export async function resolveStorageStateJson(options: {
  inlineStateJson?: unknown;
  stateJson?: unknown;
  fileRef?: string;
}): Promise<unknown | null> {
  if (options.inlineStateJson !== undefined && options.inlineStateJson !== null) {
    return options.inlineStateJson;
  }
  if (options.stateJson !== undefined && options.stateJson !== null) {
    return options.stateJson;
  }
  const artifact = await readJsonArtifactPayload(String(options.fileRef || '').trim());
  if (artifact === null) {
    return null;
  }
  const parsed = normalizeMaybeObject(artifact);
  return parsed && 'stateJson' in parsed ? parsed.stateJson ?? null : artifact;
}

export async function writeWorkspaceSnapshotArtifact(options: {
  userId: string;
  profileId: string;
  snapshotId: string;
  payload: Record<string, unknown>;
}): Promise<FileArtifactMetadata> {
  return await writeJsonArtifact({
    kind: 'workspace-snapshot',
    ownerId: options.userId,
    objectId: `${options.profileId}/${options.snapshotId}`,
    retentionPolicy: 'recent-n',
    payload: options.payload,
  });
}

export async function resolveWorkspaceSnapshotArtifact(fileRef: string): Promise<Record<string, unknown> | null> {
  const artifact = await readJsonArtifactPayload(fileRef);
  return normalizeMaybeObject(artifact);
}
