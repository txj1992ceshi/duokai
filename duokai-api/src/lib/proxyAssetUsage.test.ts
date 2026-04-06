import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProxyAssetUsageMap,
  serializeProxyAssetWithUsage,
} from './proxyAssetUsage.js';

test('buildProxyAssetUsageMap derives bound, active lease, and running counts per proxy asset', () => {
  const assets = [
    { _id: 'asset-1', sharingMode: 'shared', maxProfilesPerIp: 3, maxConcurrentRunsPerIp: 2 },
  ];
  const profiles = [
    { _id: 'profile-1', proxyAssetId: 'asset-1' },
    { _id: 'profile-2', proxyAssetId: 'asset-1' },
  ];
  const leases = [
    { proxyAssetId: 'asset-1', profileId: 'profile-1', state: 'active' },
    { proxyAssetId: 'asset-1', profileId: 'profile-2', state: 'active' },
    { proxyAssetId: 'asset-1', profileId: 'profile-3', state: 'released' },
  ];

  const usageMap = buildProxyAssetUsageMap(assets, profiles, leases, ['profile-2']);
  const usage = usageMap.get('asset-1');

  assert.ok(usage);
  assert.deepEqual(usage.boundProfileIds, ['profile-1', 'profile-2']);
  assert.deepEqual(usage.activeLeaseProfileIds, ['profile-1', 'profile-2']);
  assert.deepEqual(usage.runningProfileIds, ['profile-2']);
});

test('serializeProxyAssetWithUsage exposes derived usage counters and affected profiles', () => {
  const serialized = serializeProxyAssetWithUsage(
    {
      _id: 'asset-1',
      name: 'Shared Asset',
      sharingMode: 'hybrid',
      maxProfilesPerIp: 5,
      maxConcurrentRunsPerIp: 2,
    },
    {
      boundProfileIds: ['profile-1', 'profile-2'],
      activeLeaseProfileIds: ['profile-1'],
      runningProfileIds: ['profile-2'],
    },
  );

  assert.equal(serialized.id, 'asset-1');
  assert.equal(serialized.sharingMode, 'hybrid');
  assert.equal(serialized.boundProfilesCount, 2);
  assert.equal(serialized.activeLeasesCount, 1);
  assert.equal(serialized.runningProfilesCount, 1);
  assert.deepEqual(serialized.affectedProfileIds, ['profile-1', 'profile-2']);
});
