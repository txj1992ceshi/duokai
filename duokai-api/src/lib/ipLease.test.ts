import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfileLeaseForStart } from './ipLease.js';

test('validateProfileLeaseForStart blocks launch when lease is missing', () => {
  const result = validateProfileLeaseForStart(
    {
      _id: 'profile-1',
      platform: 'tiktok',
      purpose: 'register',
      proxyBindingMode: 'dedicated',
    },
    null,
    []
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'NO_ACTIVE_LEASE');
  assert.equal(result.severity, 'block');
});

test('validateProfileLeaseForStart blocks lease cooldown for start', () => {
  const result = validateProfileLeaseForStart(
    {
      _id: 'profile-1',
      platform: 'linkedin',
      purpose: 'operation',
      proxyBindingMode: 'reusable',
    },
    {
      leaseId: 'lease-1',
      profileId: 'profile-1',
      state: 'active',
      egressIp: '1.1.1.1',
      cooldownUntil: '2099-01-01T00:00:00.000Z',
    },
    []
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'LEASE_COOLDOWN');
});

test('validateProfileLeaseForStart blocks duplicate active IP for register profile', () => {
  const activeLease = {
    leaseId: 'lease-1',
    profileId: 'profile-1',
    state: 'active',
    egressIp: '1.1.1.1',
    cooldownUntil: null,
  };

  const result = validateProfileLeaseForStart(
    {
      _id: 'profile-1',
      platform: 'facebook',
      purpose: 'register',
      proxyBindingMode: 'dedicated',
      ipUsageMode: 'dedicated',
    },
    activeLease,
    [
      activeLease,
      {
        leaseId: 'lease-2',
        profileId: 'profile-2',
        state: 'active',
        egressIp: '1.1.1.1',
      },
    ]
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'DEDICATED_IP_CONFLICT');
});

test('validateProfileLeaseForStart allows unique active lease', () => {
  const result = validateProfileLeaseForStart(
    {
      _id: 'profile-1',
      platform: 'tiktok',
      purpose: 'operation',
      proxyBindingMode: 'reusable',
      ipUsageMode: 'shared',
    },
    {
      leaseId: 'lease-1',
      profileId: 'profile-1',
      proxyAssetId: 'proxy-1',
      state: 'active',
      egressIp: '1.1.1.1',
      cooldownUntil: null,
    },
    [],
    {
      proxyAsset: {
        _id: 'proxy-1',
        sharingMode: 'shared',
        maxProfilesPerIp: 3,
        maxConcurrentRunsPerIp: 2,
      },
      proxyPolicy: {
        allowedIpUsageModes: ['dedicated', 'shared'],
        defaultIpUsageMode: 'shared',
        sharedIpMaxProfilesPerIp: 3,
        sharedIpMaxConcurrentRunsPerIp: 2,
      },
      runningProfileIds: [],
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, 'LEASE_OK');
});

test('validateProfileLeaseForStart blocks shared mode when platform policy disallows it', () => {
  const result = validateProfileLeaseForStart(
    {
      _id: 'profile-1',
      platform: 'linkedin',
      purpose: 'register',
      proxyBindingMode: 'dedicated',
      ipUsageMode: 'shared',
    },
    {
      leaseId: 'lease-1',
      profileId: 'profile-1',
      proxyAssetId: 'proxy-1',
      state: 'active',
      egressIp: '1.1.1.1',
      cooldownUntil: null,
    },
    [],
    {
      proxyAsset: {
        _id: 'proxy-1',
        sharingMode: 'hybrid',
      },
      proxyPolicy: {
        allowedIpUsageModes: ['dedicated'],
        defaultIpUsageMode: 'dedicated',
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'IP_USAGE_MODE_NOT_ALLOWED');
});

test('validateProfileLeaseForStart blocks shared mode when profile limit is exceeded', () => {
  const result = validateProfileLeaseForStart(
    {
      _id: 'profile-1',
      platform: 'tiktok',
      purpose: 'operation',
      proxyBindingMode: 'reusable',
      ipUsageMode: 'shared',
    },
    {
      leaseId: 'lease-1',
      profileId: 'profile-1',
      proxyAssetId: 'proxy-1',
      state: 'active',
      egressIp: '1.1.1.1',
      cooldownUntil: null,
    },
    [
      {
        leaseId: 'lease-2',
        profileId: 'profile-2',
        proxyAssetId: 'proxy-1',
        state: 'active',
        egressIp: '1.1.1.1',
      },
      {
        leaseId: 'lease-3',
        profileId: 'profile-3',
        proxyAssetId: 'proxy-1',
        state: 'active',
        egressIp: '1.1.1.1',
      },
    ],
    {
      proxyAsset: {
        _id: 'proxy-1',
        sharingMode: 'shared',
        maxProfilesPerIp: 2,
      },
      proxyPolicy: {
        allowedIpUsageModes: ['dedicated', 'shared'],
        defaultIpUsageMode: 'shared',
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SHARED_IP_PROFILE_LIMIT');
});

test('validateProfileLeaseForStart blocks shared mode when concurrent run limit is exceeded', () => {
  const result = validateProfileLeaseForStart(
    {
      _id: 'profile-1',
      platform: 'tiktok',
      purpose: 'nurture',
      proxyBindingMode: 'reusable',
      ipUsageMode: 'shared',
    },
    {
      leaseId: 'lease-1',
      profileId: 'profile-1',
      proxyAssetId: 'proxy-1',
      state: 'active',
      egressIp: '1.1.1.1',
      cooldownUntil: null,
    },
    [
      {
        leaseId: 'lease-2',
        profileId: 'profile-2',
        proxyAssetId: 'proxy-1',
        state: 'active',
        egressIp: '1.1.1.1',
      },
    ],
    {
      proxyAsset: {
        _id: 'proxy-1',
        sharingMode: 'shared',
        maxProfilesPerIp: 3,
        maxConcurrentRunsPerIp: 1,
      },
      proxyPolicy: {
        allowedIpUsageModes: ['dedicated', 'shared'],
        defaultIpUsageMode: 'shared',
      },
      runningProfileIds: ['profile-2'],
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'SHARED_IP_CONCURRENT_LIMIT');
});

test('validateProfileLeaseForStart blocks shared mode when proxy sharing mode is incompatible', () => {
  const result = validateProfileLeaseForStart(
    {
      _id: 'profile-1',
      platform: 'tiktok',
      purpose: 'operation',
      proxyBindingMode: 'reusable',
      ipUsageMode: 'shared',
    },
    {
      leaseId: 'lease-1',
      profileId: 'profile-1',
      proxyAssetId: 'proxy-1',
      state: 'active',
      egressIp: '1.1.1.1',
      cooldownUntil: null,
    },
    [],
    {
      proxyAsset: {
        _id: 'proxy-1',
        sharingMode: 'dedicated',
      },
      proxyPolicy: {
        allowedIpUsageModes: ['dedicated', 'shared'],
        defaultIpUsageMode: 'shared',
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'PROXY_SHARING_UNSUPPORTED');
});
