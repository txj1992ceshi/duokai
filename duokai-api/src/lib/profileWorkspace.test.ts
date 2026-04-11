import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeWorkspacePayload, serializeProfile } from './serializers.js';
import { WorkspaceSnapshotModel } from '../models/WorkspaceSnapshot.js';

test('normalizeWorkspacePayload pins workspace identity to profile id', () => {
  const workspace = normalizeWorkspacePayload('profile-123', {
    identityProfileId: 'wrong-id',
    templateBinding: {
      templateRevision: 'rev-1',
      templateFingerprintHash: 'hash-1',
    },
    declaredOverrides: {
      timezone: 'Asia/Shanghai',
      browserFamily: 'firefox',
    },
  });

  assert.equal(workspace.identityProfileId, 'profile-123');
  assert.equal(workspace.templateBinding.templateRevision, 'rev-1');
  assert.equal(workspace.templateBinding.templateFingerprintHash, 'hash-1');
  assert.equal(workspace.declaredOverrides.timezone, 'Asia/Shanghai');
  assert.equal('browserFamily' in workspace.declaredOverrides, false);
});

test('normalizeWorkspacePayload strips device-local workspace paths and rewrites downloads dir to canonical layout', () => {
  const workspace = normalizeWorkspacePayload('profile-portable', {
    paths: {
      profileDir: 'C:\\Users\\jj\\AppData\\Roaming\\Duokai\\workspaces\\profile-portable\\profile',
      cacheDir: '/Users/jj/Library/Application Support/Duokai/workspaces/profile-portable/cache',
      downloadsDir: '/tmp/custom-downloads',
      extensionsDir: '/tmp/extensions',
      metaDir: '/tmp/meta',
    },
    resolvedEnvironment: {
      browserLanguage: 'en-US',
      downloadsDir: 'D:\\Downloads\\duokai',
    },
  });

  assert.deepEqual(workspace.paths, {
    profileDir: 'workspaces/profile-portable/profile',
    cacheDir: 'workspaces/profile-portable/cache',
    downloadsDir: 'workspaces/profile-portable/downloads',
    extensionsDir: 'workspaces/profile-portable/extensions',
    metaDir: 'workspaces/profile-portable/meta',
  });
  assert.equal(workspace.resolvedEnvironment?.downloadsDir, 'workspaces/profile-portable/downloads');
});

test('serializeProfile includes normalized workspace', () => {
  const serialized = serializeProfile({
    _id: 'profile-1',
    userId: 'user-1',
    name: 'Profile 1',
    status: 'Ready',
    workspace: {
      identityProfileId: 'mismatch',
      templateBinding: {
        templateRevision: 'rev-2',
        templateFingerprintHash: 'hash-2',
      },
      resolvedEnvironment: {
        browserLanguage: 'en-US',
      },
    },
  });

  assert.equal(serialized.workspace.identityProfileId, 'profile-1');
  assert.equal(serialized.workspace.templateBinding.templateRevision, 'rev-2');
  assert.equal(serialized.workspace.templateBinding.templateFingerprintHash, 'hash-2');
});

test('serializeProfile includes ip usage defaults and last launch block details', () => {
  const serialized = serializeProfile({
    _id: 'profile-2',
    userId: 'user-1',
    name: 'Profile 2',
    purpose: 'register',
    status: 'Ready',
    lastLaunchBlock: {
      code: 'DEDICATED_IP_CONFLICT',
      message: 'conflict',
      blockedAt: '2026-04-07T00:00:00.000Z',
    },
    workspace: null,
  });

  assert.equal(serialized.ipUsageMode, 'dedicated');
  assert.deepEqual(serialized.lastLaunchBlock, {
    code: 'DEDICATED_IP_CONFLICT',
    message: 'conflict',
    blockedAt: '2026-04-07T00:00:00.000Z',
  });
});

test('workspace snapshot schema keeps profile identity and unique snapshot key', () => {
  const indexes = WorkspaceSnapshotModel.schema.indexes();
  assert.equal(
    indexes.some(
      ([fields, options]: [Record<string, number>, { unique?: boolean }]) =>
        fields.userId === 1 &&
        fields.profileId === 1 &&
        fields.snapshotId === 1 &&
        options?.unique === true
    ),
    true
  );
});

test('normalizeWorkspaceSnapshotPayload keeps profile identity and snapshot metadata fields', async () => {
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/duokai-test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  const { normalizeWorkspaceSnapshotPayload } = await import('../routes/workspaceSnapshots.js');
  const payload = normalizeWorkspaceSnapshotPayload('profile-1', 'snapshot-1', {
    profileId: 'wrong-profile',
    snapshotId: 'snapshot-override',
    storageState: {
      version: 2,
      stateHash: 'hash-1',
    },
    directoryManifest: [{ key: 'profileDir', path: '/tmp/a' }],
    validatedStartAt: '2026-04-03T01:00:00.000Z',
  });

  assert.equal(payload.profileId, 'profile-1');
  assert.equal(payload.snapshotId, 'snapshot-override');
  assert.equal((payload.storageState as { version: number }).version, 2);
  assert.equal(Array.isArray(payload.directoryManifest), true);
  assert.equal(payload.validatedStartAt, '2026-04-03T01:00:00.000Z');
});
