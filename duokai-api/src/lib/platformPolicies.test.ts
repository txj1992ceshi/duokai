import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultPlatformPolicy,
  normalizeProxyPolicy,
  resolveDefaultIpUsageMode,
} from './platformPolicies.js';

test('resolveDefaultIpUsageMode defaults register to dedicated and operation to shared', () => {
  assert.equal(resolveDefaultIpUsageMode('register'), 'dedicated');
  assert.equal(resolveDefaultIpUsageMode('operation'), 'shared');
});

test('getDefaultPlatformPolicy exposes shared policy for nurture and operation', () => {
  const policy = getDefaultPlatformPolicy('facebook', 'nurture');
  assert.ok(policy);
  assert.deepEqual(policy.proxyPolicy.allowedIpUsageModes, ['dedicated', 'shared']);
  assert.equal(policy.proxyPolicy.defaultIpUsageMode, 'shared');
  assert.equal(policy.proxyPolicy.sharedIpMaxProfilesPerIp, 3);
  assert.equal(policy.proxyPolicy.sharedIpMaxConcurrentRunsPerIp, 2);
});

test('normalizeProxyPolicy backfills required ip usage fields', () => {
  const normalized = normalizeProxyPolicy('register', {
    allowedIpUsageModes: ['dedicated'],
  });

  assert.deepEqual(normalized.allowedIpUsageModes, ['dedicated']);
  assert.equal(normalized.defaultIpUsageMode, 'dedicated');
  assert.equal(normalized.sharedIpMaxProfilesPerIp, 1);
  assert.equal(normalized.sharedIpMaxConcurrentRunsPerIp, 1);
});
