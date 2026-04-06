import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

export type FileArtifactKind =
  | 'storage-state-backup'
  | 'workspace-snapshot'
  | 'import-export-bundle'
  | 'task-output'
  | 'diagnostics'
  | 'runtime-log'
  | 'mongo-backup'
  | 'release-artifact';

export interface FileArtifactMetadata {
  fileRef: string;
  checksum: string;
  size: number;
  contentType: string;
  retentionPolicy: string;
  createdAt: string;
}

export interface WriteJsonArtifactOptions {
  kind: FileArtifactKind;
  ownerId: string;
  objectId: string;
  payload: unknown;
  compress?: boolean;
  contentType?: string;
  retentionPolicy?: string;
}

function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function getFileRepositoryRoot(): string {
  return process.env.DUOKAI_FILE_REPOSITORY_ROOT || '/srv/duokai/files';
}

export function buildArtifactPath(kind: FileArtifactKind, ownerId: string, objectId: string): string {
  return path.join(getFileRepositoryRoot(), kind, ownerId, objectId);
}

export async function writeJsonArtifact(
  options: WriteJsonArtifactOptions
): Promise<FileArtifactMetadata> {
  const createdAt = new Date().toISOString();
  const contentType = options.contentType || 'application/json';
  const retentionPolicy = options.retentionPolicy || 'manual';
  const raw = Buffer.from(JSON.stringify(options.payload, null, 2), 'utf8');
  const body = options.compress === false ? raw : gzipSync(raw);
  const suffix = options.compress === false ? '.json' : '.json.gz';
  const filePath = `${buildArtifactPath(options.kind, options.ownerId, options.objectId)}${suffix}`;
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

export async function readArtifactBuffer(fileRef: string): Promise<Buffer> {
  return await readFile(fileRef);
}
