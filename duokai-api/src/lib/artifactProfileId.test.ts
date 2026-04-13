import test from 'node:test';
import assert from 'node:assert/strict';

import { buildArtifactProfileKey, normalizeArtifactProfileId } from './artifactProfileId.js';

test('normalizeArtifactProfileId trims and stringifies values', () => {
  assert.equal(normalizeArtifactProfileId('  abc  '), 'abc');
  assert.equal(normalizeArtifactProfileId(123), '123');
  assert.equal(normalizeArtifactProfileId(null), '');
});

test('buildArtifactProfileKey normalizes profile and snapshot ids', () => {
  assert.equal(
    buildArtifactProfileKey('user-1', '  profile-1  ', '  snapshot-1  '),
    'user-1::profile-1::snapshot-1',
  );
  assert.equal(buildArtifactProfileKey('user-1', '507f1f77bcf86cd799439011'), 'user-1::507f1f77bcf86cd799439011');
});
