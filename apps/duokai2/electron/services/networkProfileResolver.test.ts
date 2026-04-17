import assert from 'node:assert/strict'
import test from 'node:test'

import { createProfilePayload, createDefaultFingerprint } from './factories.ts'
import { applyNetworkDerivedFingerprint } from './networkProfileResolver.ts'

test('applyNetworkDerivedFingerprint updates interface language alongside language in auto mode', () => {
  const profile = createProfilePayload(
    {
      id: 'profile-network-derived',
      name: 'Derived Profile',
      proxyId: null,
      groupName: '',
      tags: [],
      notes: '',
      fingerprintConfig: createDefaultFingerprint(),
    },
    createDefaultFingerprint,
  )

  const nextProfile = applyNetworkDerivedFingerprint(
    {
      ...profile,
      environmentPurpose: profile.environmentPurpose!,
      deviceProfile: profile.deviceProfile!,
      status: 'stopped',
      lastStartedAt: null,
      createdAt: '2026-04-17T00:00:00.000Z',
      updatedAt: '2026-04-17T00:00:00.000Z',
    },
    {
      ok: true,
      source: 'proxy',
      message: 'ok',
      ip: '1.1.1.1',
      country: 'United States',
      region: 'Virginia',
      city: 'Ashburn',
      timezone: 'America/New_York',
      geolocation: '39.0438,-77.4874',
      languageHint: 'en-US',
      egressPathType: 'direct',
      diagnostics: [],
    },
  )

  assert.equal(nextProfile.fingerprintConfig.language, 'en-US')
  assert.equal(nextProfile.fingerprintConfig.advanced.interfaceLanguage, 'en-US')
  assert.equal(nextProfile.fingerprintConfig.timezone, 'America/New_York')
  assert.equal(nextProfile.fingerprintConfig.advanced.geolocation, '39.0438,-77.4874')
  assert.equal(nextProfile.workspace?.resolvedEnvironment.browserLanguage, 'en-US')
  assert.equal(nextProfile.workspace?.resolvedEnvironment.systemLanguage, 'en-US')
  assert.equal(nextProfile.workspace?.resolvedEnvironment.timezone, 'America/New_York')
})
