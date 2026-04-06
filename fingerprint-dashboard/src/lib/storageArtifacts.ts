import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function getFileRepositoryRoot(): string {
  return process.env.DUOKAI_FILE_REPOSITORY_ROOT || '/srv/duokai/files';
}

function buildArtifactPath(kind: string, ownerId: string, objectId: string): string {
  return path.join(getFileRepositoryRoot(), kind, ownerId, objectId);
}

export async function writeJsonArtifact(options: {
  kind: 'storage-state-backup' | 'workspace-snapshot';
  ownerId: string;
  objectId: string;
  payload: unknown;
  retentionPolicy?: string;
  contentType?: string;
}) {
  const createdAt = new Date().toISOString();
  const contentType = options.contentType || 'application/json';
  const retentionPolicy = options.retentionPolicy || 'manual';
  const raw = Buffer.from(JSON.stringify(options.payload, null, 2), 'utf8');
  const body = gzipSync(raw);
  const filePath = `${buildArtifactPath(options.kind, options.ownerId, options.objectId)}.json.gz`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
  return {
    fileRef: filePath,
    checksum: computeSha256(body),
    size: body.byteLength,
    contentType,
    retentionPolicy,
    createdAt,
  };
}

export async function readJsonArtifact(fileRef: string): Promise<unknown | null> {
  const normalized = String(fileRef || '').trim();
  if (!normalized) {
    return null;
  }
  const buffer = await readFile(normalized);
  const body = normalized.endsWith('.gz') ? gunzipSync(buffer) : buffer;
  return JSON.parse(body.toString('utf8')) as unknown;
}

export async function resolveStorageStateJson(options: {
  inlineStateJson?: unknown;
  stateJson?: unknown;
  fileRef?: string;
}) {
  if (options.inlineStateJson !== undefined && options.inlineStateJson !== null) {
    return options.inlineStateJson;
  }
  if (options.stateJson !== undefined && options.stateJson !== null) {
    return options.stateJson;
  }
  const artifact = await readJsonArtifact(String(options.fileRef || '').trim());
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return artifact;
  }
  return ('stateJson' in artifact ? (artifact as Record<string, unknown>).stateJson : artifact) ?? null;
}

export async function resolveWorkspaceSnapshotArtifact(fileRef: string) {
  const artifact = await readJsonArtifact(String(fileRef || '').trim());
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return null;
  }
  return artifact as Record<string, unknown>;
}
