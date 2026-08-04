import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  CloakBrowserLifecycleDiagnostics,
  CloakPostTrustRolloutGate,
} from './cloakBrowserPostTrustGate.ts'
import type { CloakLivenessEvidence } from './cloakBrowserLiveness.ts'
import type { CloakBrowserContextLike } from './cloakBrowserRuntime.ts'
import type { CloakRolloutAdmissionLease } from './cloakBrowserRolloutControl.ts'

function contextFixture(): CloakBrowserContextLike {
  const page = {}
  return {
    pages: () => [page],
    newPage: async () => page,
    close: async () => undefined,
    newCDPSession: async () => ({
      send: async () => ({ product: 'Chrome/145.0.7632.109' }),
      detach: async () => undefined,
    }),
  }
}

function leaseFixture() {
  const calls: Array<{ success: boolean; reason: string; at: string }> = []
  const lease: CloakRolloutAdmissionLease = {
    decision: {
      admitted: true,
      wouldBlock: false,
      enforced: false,
      mode: 'observe',
      reason: 'admitted',
      rolloutId: 'phase6f-rollout',
      batchId: 'single-profile',
      profileId: 'profile-1',
      controlHash: 'phase6f-control-hash',
      activeBatchSessions: 0,
      maxConcurrentSessions: 1,
      health: {
        sampleCount: 0,
        failureCount: 0,
        failureRate: 0,
        consecutiveFailures: 0,
        failureRateExceeded: false,
        consecutiveFailureLimitExceeded: false,
        latestFailureAt: '',
        cooldownUntil: '',
        circuitOpen: false,
      },
    },
    recordSuccess: async (reason = 'trusted', at = new Date()) => {
      calls.push({ success: true, reason, at: at.toISOString() })
      return true
    },
    recordFailure: async (reason, at = new Date()) => {
      calls.push({ success: false, reason, at: at.toISOString() })
      return true
    },
    release: () => undefined,
  }
  return { lease, calls }
}

function livenessEvidence(completedAt: string): CloakLivenessEvidence {
  return {
    passed: true,
    startedAt: '2026-07-28T12:30:00.000Z',
    completedAt,
    durationMs: 60_000,
    sampleCount: 13,
    samples: [],
  }
}

test('post-trust rollout success is withheld until the sustained liveness gate passes', async () => {
  const { lease, calls } = leaseFixture()
  let resolveLiveness!: (evidence: CloakLivenessEvidence) => void
  const liveness = new Promise<CloakLivenessEvidence>((resolve) => {
    resolveLiveness = resolve
  })
  const gate = new CloakPostTrustRolloutGate({
    profileId: 'profile-1',
    context: contextFixture(),
    lease,
    verifyLiveness: async () => await liveness,
  })

  const completion = gate.start()
  await Promise.resolve()
  assert.equal(gate.pending, true)
  assert.deepEqual(calls, [])

  resolveLiveness(livenessEvidence('2026-07-28T12:31:00.000Z'))
  const outcome = await completion
  assert.equal(outcome.status, 'passed')
  assert.equal(outcome.reason, 'post_trust_liveness_passed')
  assert.equal(outcome.recorded, true)
  assert.deepEqual(calls, [
    {
      success: true,
      reason: 'post_trust_liveness_passed',
      at: '2026-07-28T12:31:00.000Z',
    },
  ])
})

test('context close before the gate completes records one failure and suppresses late success', async () => {
  const { lease, calls } = leaseFixture()
  let resolveLiveness!: (evidence: CloakLivenessEvidence) => void
  const liveness = new Promise<CloakLivenessEvidence>((resolve) => {
    resolveLiveness = resolve
  })
  const gate = new CloakPostTrustRolloutGate({
    profileId: 'profile-1',
    context: contextFixture(),
    lease,
    verifyLiveness: async () => await liveness,
  })

  const completion = gate.start()
  const failure = await gate.fail(
    'post_trust_context_closed:browser-disconnected',
    undefined,
    new Date('2026-07-28T12:30:42.000Z'),
  )
  assert.equal(failure.status, 'failed')
  assert.equal(failure.recorded, true)

  resolveLiveness(livenessEvidence('2026-07-28T12:31:00.000Z'))
  assert.deepEqual(await completion, failure)
  await Promise.resolve()
  assert.deepEqual(calls, [
    {
      success: false,
      reason: 'post_trust_context_closed:browser-disconnected',
      at: '2026-07-28T12:30:42.000Z',
    },
  ])
})

test('a failed browser probe records a fail-closed rollout outcome', async () => {
  const { lease, calls } = leaseFixture()
  const gate = new CloakPostTrustRolloutGate({
    profileId: 'profile-1',
    context: contextFixture(),
    lease,
    now: () => new Date('2026-07-28T12:30:15.000Z'),
    verifyLiveness: async () => {
      const error = new Error('Target page, context or browser has been closed') as Error & {
        code: string
      }
      error.code = 'browser_unresponsive'
      throw error
    },
  })

  const outcome = await gate.start()
  assert.equal(outcome.status, 'failed')
  assert.equal(outcome.reason, 'post_trust_liveness_failed:browser_unresponsive')
  assert.match(outcome.error, /browser has been closed/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.success, false)
})

test('a success outcome write failure fails closed instead of reporting a false pass', async () => {
  const { lease } = leaseFixture()
  lease.recordSuccess = async () => {
    throw new Error('EPERM: rollout health is not writable')
  }
  const gate = new CloakPostTrustRolloutGate({
    profileId: 'profile-1',
    context: contextFixture(),
    lease,
    verifyLiveness: async () => livenessEvidence('2026-07-28T12:31:00.000Z'),
  })

  const outcome = await gate.start()
  assert.equal(outcome.status, 'failed')
  assert.equal(outcome.success, false)
  assert.equal(outcome.reason, 'post_trust_outcome_write_failed')
  assert.equal(outcome.recorded, false)
  assert.match(outcome.error, /not writable/)
})

test('repeated failure signals remain idempotent', async () => {
  const { lease, calls } = leaseFixture()
  const gate = new CloakPostTrustRolloutGate({
    profileId: 'profile-1',
    context: contextFixture(),
    lease,
    verifyLiveness: async () => await new Promise<CloakLivenessEvidence>(() => undefined),
  })
  void gate.start()

  const first = await gate.fail('post_trust_context_closed:unknown')
  const second = await gate.fail('post_trust_context_closed:browser-disconnected')
  assert.deepEqual(second, first)
  assert.equal(calls.length, 1)
})

test('lifecycle diagnostics distinguish explicit stop from browser disconnect', () => {
  const explicit = new CloakBrowserLifecycleDiagnostics({
    profileId: 'profile-1',
    launchedAt: '2026-07-28T12:30:00.000Z',
  })
  explicit.markTrusted(new Date('2026-07-28T12:30:05.000Z'))
  explicit.markCloseIntent('stop')
  const explicitDiagnosis = explicit.diagnoseContextClose({
    at: new Date('2026-07-28T12:30:45.000Z'),
    browserConnected: true,
    remainingPages: 0,
  })
  assert.equal(explicitDiagnosis.classification, 'explicit-close')
  assert.equal(explicitDiagnosis.closeIntent, 'stop')
  assert.equal(explicitDiagnosis.lifetimeAfterTrustMs, 40_000)

  const disconnected = new CloakBrowserLifecycleDiagnostics({
    profileId: 'profile-1',
    launchedAt: '2026-07-28T12:30:00.000Z',
  })
  disconnected.markTrusted(new Date('2026-07-28T12:30:05.000Z'))
  disconnected.markBrowserDisconnected(new Date('2026-07-28T12:31:05.000Z'))
  const disconnectedDiagnosis = disconnected.diagnoseContextClose({
    at: new Date('2026-07-28T12:31:05.100Z'),
    browserConnected: false,
  })
  assert.equal(disconnectedDiagnosis.classification, 'browser-disconnected')
  assert.equal(disconnectedDiagnosis.browserConnectedAtClose, false)
  assert.equal(disconnectedDiagnosis.processExitCodeAvailable, false)
  assert.equal(disconnectedDiagnosis.processSignalAvailable, false)
})

test('main runtime integrates the post-trust gate and removes immediate trusted success', async () => {
  const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(mainSource, /recordSuccess\(['"]trusted['"]\)/)
  assert.match(mainSource, /new CloakPostTrustRolloutGate/)
  assert.match(mainSource, /cloak_context_close_diagnosed/)
  assert.match(mainSource, /post_trust_browser_disconnected/)
  assert.match(mainSource, /finalizeRuntimeShutdown\(profileId, 'liveness-failure'\)/)
})

test('lifecycle diagnostics identify last-page and unknown context closes', () => {
  const lastPage = new CloakBrowserLifecycleDiagnostics({ profileId: 'profile-1' })
  lastPage.markPageClosed(0, new Date('2026-07-28T12:30:20.000Z'))
  assert.equal(
    lastPage.diagnoseContextClose({ at: new Date('2026-07-28T12:30:20.100Z') }).classification,
    'last-page-closed',
  )

  const unknown = new CloakBrowserLifecycleDiagnostics({ profileId: 'profile-1' })
  assert.equal(unknown.diagnoseContextClose().classification, 'context-close-unknown')
})
