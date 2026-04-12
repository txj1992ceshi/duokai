import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compactStorageStatePayload,
  compactWorkspaceMetadata,
  compactWorkspaceSnapshotDocument,
  compactWorkspaceSnapshotManifest,
  shouldIncludeArtifactContent,
} from './storageView.js';

test('shouldIncludeArtifactContent recognizes explicit truthy query values', () => {
  assert.equal(shouldIncludeArtifactContent('1'), true);
  assert.equal(shouldIncludeArtifactContent('true'), true);
  assert.equal(shouldIncludeArtifactContent('full'), true);
  assert.equal(shouldIncludeArtifactContent('yes'), true);
});

test('shouldIncludeArtifactContent defaults to false for missing or unknown values', () => {
  assert.equal(shouldIncludeArtifactContent(''), false);
  assert.equal(shouldIncludeArtifactContent(undefined), false);
  assert.equal(shouldIncludeArtifactContent('0'), false);
  assert.equal(shouldIncludeArtifactContent('metadata'), false);
});

test('compactStorageStatePayload strips embedded stateJson while preserving metadata fields', () => {
  const compact = compactStorageStatePayload({
    version: 3,
    stateHash: 'abc',
    inlineStateJson: { cookies: [{ name: 'sid-inline' }] },
    stateJson: { cookies: [{ name: 'sid' }] },
  });

  assert.deepEqual(compact, {
    version: 3,
    stateHash: 'abc',
    inlineStateJson: null,
    stateJson: null,
  });
});

test('compactWorkspaceSnapshotManifest keeps only summary keys needed for indexing', () => {
  const compact = compactWorkspaceSnapshotManifest({
    schemaVersion: 1,
    workspaceIdentityProfileId: 'profile-1',
    storageStateHash: 'abc',
    workspaceStateHash: 'def',
    ignoredField: { large: true },
  });

  assert.deepEqual(compact, {
    schemaVersion: 1,
    workspaceIdentityProfileId: 'profile-1',
    storageStateHash: 'abc',
    workspaceStateHash: 'def',
  });
});

test('compactWorkspaceMetadata strips local path-heavy fields while preserving identity summary', () => {
  const compact = compactWorkspaceMetadata({
    identityProfileId: 'profile-1',
    migrationState: 'completed',
    templateBinding: { templateRevision: 'r1' },
    resolvedEnvironment: { downloadsDir: '/tmp/downloads' },
    paths: { profileDir: '/tmp/profile' },
    healthSummary: { status: 'ok' },
    consistencySummary: { status: 'ok' },
  });

  assert.deepEqual(compact, {
    identityProfileId: 'profile-1',
    migrationState: 'completed',
    templateBinding: { templateRevision: 'r1' },
    resolvedEnvironment: { downloadsDir: '/tmp/downloads' },
    healthSummary: { status: 'ok' },
    consistencySummary: { status: 'ok' },
  });
});

test('compactWorkspaceSnapshotDocument collapses heavy snapshot content to metadata-only view', () => {
  const compact = compactWorkspaceSnapshotDocument({
    manifest: { schemaVersion: 1, trustedSnapshotStatus: 'valid', ignored: true },
    workspaceMetadata: {
      identityProfileId: 'profile-1',
      templateBinding: { templateRevision: 'r1' },
      paths: { profileDir: '/tmp/profile' },
    },
    storageState: {
      version: 2,
      inlineStateJson: { cookies: [] },
      stateJson: { cookies: [] },
    },
    directoryManifest: [{ key: 'profileDir', path: '/tmp/profile' }],
    healthSummary: { status: 'ok' },
    consistencySummary: { status: 'ok' },
  });

  assert.deepEqual(compact, {
    manifest: { schemaVersion: 1, trustedSnapshotStatus: 'valid' },
    workspaceMetadata: {
      identityProfileId: 'profile-1',
      templateBinding: { templateRevision: 'r1' },
    },
    storageState: {
      version: 2,
      inlineStateJson: null,
      stateJson: null,
    },
    directoryManifest: [],
    healthSummary: { status: 'ok' },
    consistencySummary: { status: 'ok' },
  });
});
