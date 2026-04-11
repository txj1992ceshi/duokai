import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import {
  ensureFileRepositoryRoot,
  getFileRepositoryRoot,
  writeJsonArtifact,
} from './fileRepository.js';

test('writeJsonArtifact creates missing repository root and writes compressed json artifact', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'duokai-file-repo-'));
  process.env.DUOKAI_FILE_REPOSITORY_ROOT = path.join(root, 'nested', 'artifacts');

  const ensuredRoot = await ensureFileRepositoryRoot();
  const artifact = await writeJsonArtifact({
    kind: 'storage-state-backup',
    ownerId: 'user-1',
    objectId: 'profile-1/v1',
    payload: { ok: true, version: 1 },
  });

  assert.equal(ensuredRoot, getFileRepositoryRoot());
  assert.match(artifact.fileRef, /storage-state-backup/);
  const payload = JSON.parse(gunzipSync(readFileSync(artifact.fileRef)).toString('utf8')) as {
    ok: boolean;
    version: number;
  };
  assert.deepEqual(payload, { ok: true, version: 1 });
});

test('writeJsonArtifact reports repository root details when artifact path is not writable', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'duokai-file-repo-error-'));
  const invalidRoot = path.join(root, 'repo-file');
  writeFileSync(invalidRoot, 'not-a-directory', 'utf8');
  process.env.DUOKAI_FILE_REPOSITORY_ROOT = invalidRoot;

  await assert.rejects(
    () =>
      writeJsonArtifact({
        kind: 'storage-state-backup',
        ownerId: 'user-1',
        objectId: 'profile-1/v2',
        payload: { ok: false },
      }),
    (error: unknown) => {
      assert.match(
        String(error),
        /Failed to prepare file repository root|Failed to write file artifact under repository root/
      );
      assert.match(String(error), /repo-file/);
      return true;
    }
  );
});
