import assert from 'node:assert/strict';
import test from 'node:test';
import { compactStorageStatePayload, shouldIncludeArtifactContent } from './storageView.js';

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
