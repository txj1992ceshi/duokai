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
  assert.equal(result.code, 'DUPLICATE_IP_CONFLICT');
});

test('validateProfileLeaseForStart allows unique active lease', () => {
  const result = validateProfileLeaseForStart(
    {
      _id: 'profile-1',
      platform: 'tiktok',
      purpose: 'operation',
      proxyBindingMode: 'reusable',
    },
    {
      leaseId: 'lease-1',
      profileId: 'profile-1',
      state: 'active',
      egressIp: '1.1.1.1',
      cooldownUntil: null,
    },
    []
  );

  assert.equal(result.ok, true);
  assert.equal(result.code, 'LEASE_OK');
});
