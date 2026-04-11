import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateTrustedSnapshotReuse } from './trustedLaunch.ts'
import type { TrustedLaunchSnapshot } from '../../src/shared/types.ts'

function buildSnapshot(overrides?: Partial<TrustedLaunchSnapshot>): TrustedLaunchSnapshot {
  return {
    configFingerprintHash: 'config-hash',
    proxyFingerprintHash: 'proxy-hash',
    snapshotVersion: 1,
    verificationLevel: 'full',
    verifiedAt: '2026-04-07T00:00:00.000Z',
    effectiveProxyTransport: 'direct',
    verifiedEgressIp: '1.1.1.1',
    verifiedCountry: 'US',
    verifiedRegion: 'CA',
    verifiedTimezone: 'America/Los_Angeles',
    verifiedLanguage: 'en-US',
    verifiedGeolocation: '37.77,-122.42',
    verifiedHostEnvironment: 'macOS',
    verifiedChromiumMajor: '136',
    verifiedDesktopAppVersion: '0.1.0',
    httpsCheckPassed: true,
    leakCheckPassed: true,
    startupNavigationPassed: true,
    status: 'trusted',
    ...overrides,
  }
}

function buildContext() {
  return {
    configFingerprintHash: 'config-hash',
    proxyFingerprintHash: 'proxy-hash',
    currentDesktopAppVersion: '0.1.0',
    currentChromiumMajor: '136',
    currentHostEnvironment: 'macOS',
    currentCanonicalRoot: '/tmp/workspaces/profile-1',
    runtimeLockStatus: 'locked' as const,
    workspaceHealthStatus: 'healthy' as const,
    workspaceConsistencyStatus: 'pass' as const,
    lastQuickIsolationCheck: {
      mode: 'preflight' as const,
      checkedAt: '2026-04-07T00:00:00.000Z',
      success: true,
      message: 'ok',
      egressIp: '',
      country: '',
      region: '',
      timezone: '',
      language: '',
      geolocation: '',
      effectiveProxyTransport: '',
      workspaceConsistencyStatus: 'pass' as const,
      workspaceHealthStatus: 'healthy' as const,
      runtimeLockStatus: 'locked' as const,
      canonicalRoot: '/tmp/workspaces/profile-1',
    },
  }
}

test('evaluateTrustedSnapshotReuse allows trusted snapshot reuse when runtime metadata still matches', () => {
  const decision = evaluateTrustedSnapshotReuse(buildSnapshot(), buildContext())
  assert.equal(decision.usable, true)
  assert.equal(decision.status, 'trusted')
})

test('evaluateTrustedSnapshotReuse blocks trusted snapshot reuse when canonical root drifted', () => {
  const decision = evaluateTrustedSnapshotReuse(buildSnapshot(), {
    ...buildContext(),
    currentCanonicalRoot: '/tmp/workspaces/profile-2',
  })
  assert.equal(decision.usable, false)
  assert.equal(decision.status, 'invalid')
  assert.match(decision.reason, /canonical root/i)
})

test('evaluateTrustedSnapshotReuse marks trusted snapshot stale when config fingerprint changed', () => {
  const decision = evaluateTrustedSnapshotReuse(buildSnapshot(), {
    ...buildContext(),
    configFingerprintHash: 'different-config-hash',
  })
  assert.equal(decision.usable, false)
  assert.equal(decision.status, 'stale')
  assert.match(decision.reason, /config fingerprint/i)
})

test('evaluateTrustedSnapshotReuse blocks trusted snapshot reuse when startup navigation previously failed', () => {
  const decision = evaluateTrustedSnapshotReuse(buildSnapshot({ startupNavigationPassed: false }), buildContext())
  assert.equal(decision.usable, false)
  assert.equal(decision.status, 'stale')
  assert.match(decision.reason, /startup navigation/i)
})
