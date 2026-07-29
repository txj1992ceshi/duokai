import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CloakLivenessError,
  verifyCloakContextLiveness,
} from './cloakBrowserLiveness.ts'
import type {
  CloakBrowserContextLike,
  CloakBrowserPageLike,
} from './cloakBrowserRuntime.ts'

function contextFixture(input: {
  pages?: () => CloakBrowserPageLike[]
  send?: () => Promise<{ product?: string }>
  onDetach?: () => void
} = {}): CloakBrowserContextLike {
  const page: CloakBrowserPageLike = {
    evaluate: async () => {
      throw new Error('Execution context was destroyed during navigation.')
    },
  }
  return {
    pages: input.pages ?? (() => [page]),
    newPage: async () => page,
    close: async () => undefined,
    newCDPSession: async () => ({
      send: input.send ?? (async () => ({ product: 'Chrome/145.0.7632.109' })),
      detach: async () => {
        input.onDetach?.()
      },
    }),
  }
}

test('liveness gate requires multiple browser-process samples across the minimum duration', async () => {
  let nowMs = Date.parse('2026-07-28T00:00:00.000Z')
  let probes = 0
  let detaches = 0
  const evidence = await verifyCloakContextLiveness(
    contextFixture({
      send: async () => {
        probes += 1
        return { product: 'Chrome/145.0.7632.109' }
      },
      onDetach: () => {
        detaches += 1
      },
    }),
    {
      minimumDurationMs: 2_000,
      sampleIntervalMs: 1_000,
      minimumSamples: 3,
    },
    {
      now: () => new Date(nowMs),
      sleep: async (durationMs) => {
        nowMs += durationMs
      },
    },
  )

  assert.equal(evidence.passed, true)
  assert.equal(evidence.durationMs, 2_000)
  assert.equal(evidence.sampleCount, 3)
  assert.equal(probes, 3)
  assert.equal(detaches, 3)
  assert.deepEqual(
    evidence.samples.map((sample) => sample.elapsedMs),
    [0, 1_000, 2_000],
  )
  assert.deepEqual(
    evidence.samples.map((sample) => sample.browserProduct),
    ['Chrome/145.0.7632.109', 'Chrome/145.0.7632.109', 'Chrome/145.0.7632.109'],
  )
})

test('navigation execution-context churn does not create a false liveness failure', async () => {
  const evidence = await verifyCloakContextLiveness(
    contextFixture(),
    { minimumDurationMs: 1, sampleIntervalMs: 1, minimumSamples: 1 },
  )

  assert.equal(evidence.passed, true)
  assert.equal(evidence.samples[0]?.browserProduct, 'Chrome/145.0.7632.109')
})

test('liveness gate fails closed when Browser.getVersion stops responding', async () => {
  let nowMs = Date.parse('2026-07-28T00:00:00.000Z')
  let probes = 0
  await assert.rejects(
    verifyCloakContextLiveness(
      contextFixture({
        send: async () => {
          probes += 1
          if (probes >= 2) {
            throw new Error('Target page, context or browser has been closed')
          }
          return { product: 'Chrome/145.0.7632.109' }
        },
      }),
      {
        minimumDurationMs: 2_000,
        sampleIntervalMs: 1_000,
        minimumSamples: 3,
      },
      {
        now: () => new Date(nowMs),
        sleep: async (durationMs) => {
          nowMs += durationMs
        },
      },
    ),
    (error: unknown) =>
      error instanceof CloakLivenessError && error.code === 'browser_unresponsive',
  )
})

test('liveness gate rejects a context without a startup page', async () => {
  await assert.rejects(
    verifyCloakContextLiveness(
      contextFixture({ pages: () => [] }),
      { minimumDurationMs: 1, sampleIntervalMs: 1, minimumSamples: 1 },
    ),
    (error: unknown) =>
      error instanceof CloakLivenessError && error.code === 'page_unavailable',
  )
})
