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

test('getDefaultPlatformPolicy keeps shared mode available across purpose labels', () => {
  const policy = getDefaultPlatformPolicy('facebook', 'register');
  assert.ok(policy);
  assert.deepEqual(policy.proxyPolicy.allowedIpUsageModes, ['dedicated', 'shared']);
  assert.equal(policy.proxyPolicy.defaultIpUsageMode, 'dedicated');
  assert.equal(policy.proxyPolicy.sharedIpMaxProfilesPerIp, 3);
  assert.equal(policy.proxyPolicy.sharedIpMaxConcurrentRunsPerIp, 2);
});

test('normalizeProxyPolicy backfills required ip usage fields', () => {
  const normalized = normalizeProxyPolicy('register');

  assert.deepEqual(normalized.allowedIpUsageModes, ['dedicated', 'shared']);
  assert.equal(normalized.defaultIpUsageMode, 'dedicated');
  assert.equal(normalized.sharedIpMaxProfilesPerIp, 3);
  assert.equal(normalized.sharedIpMaxConcurrentRunsPerIp, 2);
});
