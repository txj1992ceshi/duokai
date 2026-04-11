import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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

export async function ensureFileRepositoryRoot(): Promise<string> {
  const root = getFileRepositoryRoot();
  try {
    await mkdir(root, { recursive: true });
  } catch (error) {
    const details = error as NodeJS.ErrnoException;
    const reason = details.code ? `${details.code}: ${details.message}` : String(error);
    throw new Error(`Failed to prepare file repository root "${root}". ${reason}`, {
      cause: error,
    });
  }
  return root;
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
  const root = await ensureFileRepositoryRoot();
  const filePath = `${path.join(root, options.kind, options.ownerId, options.objectId)}${suffix}`;
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, body);
  } catch (error) {
    const details = error as NodeJS.ErrnoException;
    const reason = details.code ? `${details.code}: ${details.message}` : String(error);
    throw new Error(
      `Failed to write file artifact under repository root "${root}" at "${filePath}". ${reason}`,
      { cause: error }
    );
  }
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

async function collectArtifactFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return await collectArtifactFiles(fullPath);
      }
      return [fullPath];
    })
  );
  return files.flat();
}

export async function listArtifactFiles(kind: FileArtifactKind): Promise<string[]> {
  const root = path.join(getFileRepositoryRoot(), kind);
  try {
    return await collectArtifactFiles(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function deleteArtifactFile(fileRef: string): Promise<boolean> {
  const normalized = String(fileRef || '').trim();
  if (!normalized) {
    return false;
  }
  try {
    await rm(normalized, { force: true });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}
