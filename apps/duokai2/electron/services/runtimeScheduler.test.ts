import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NonRetryableLaunchError,
  RuntimeScheduler,
  type RuntimeStatus,
} from './runtimeScheduler.ts'

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for scheduler state.')
    }
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

function schedulerFixture(input: {
  onStart(profileId: string): Promise<void>
  isRunning(profileId: string): boolean
  launchRetries?: number
}) {
  const statuses: RuntimeStatus[] = []
  const errors: unknown[] = []
  const scheduler = new RuntimeScheduler({
    getMaxConcurrentStarts: () => 1,
    getMaxActiveProfiles: () => 1,
    getLaunchRetries: () => input.launchRetries ?? 0,
    getRunningCount: () => 0,
    isRunning: input.isRunning,
    onStart: input.onStart,
    onStatusChange: async (_profileId, status) => {
      statuses.push(status)
    },
    onError: async (_profileId, error) => {
      errors.push(error)
    },
  })
  return { scheduler, statuses, errors }
}

test('scheduler writes running only when the launched context is still active', async () => {
  const active = new Set<string>()
  const { scheduler, statuses, errors } = schedulerFixture({
    onStart: async (profileId) => {
      active.add(profileId)
    },
    isRunning: (profileId) => active.has(profileId),
  })

  assert.equal(scheduler.enqueue('profile-1'), true)
  await waitFor(() => statuses.includes('running'))

  assert.deepEqual(statuses, ['queued', 'starting', 'running'])
  assert.deepEqual(errors, [])
})

test('scheduler converges to stopped when launch returns without an active context', async () => {
  const { scheduler, statuses, errors } = schedulerFixture({
    onStart: async () => undefined,
    isRunning: () => false,
  })

  assert.equal(scheduler.enqueue('profile-1'), true)
  await waitFor(() => statuses.at(-1) === 'stopped')

  assert.deepEqual(statuses, ['queued', 'starting', 'stopped'])
  assert.equal(statuses.includes('running'), false)
  assert.deepEqual(errors, [])
})

test('scheduler fails fast for deterministic launch errors without reopening the browser', async () => {
  let starts = 0
  const { scheduler, statuses, errors } = schedulerFixture({
    launchRetries: 3,
    onStart: async () => {
      starts += 1
      throw new NonRetryableLaunchError('UA Client Hints coherence failed')
    },
    isRunning: () => false,
  })

  assert.equal(scheduler.enqueue('profile-1'), true)
  await waitFor(() => statuses.at(-1) === 'error')

  assert.equal(starts, 1)
  assert.deepEqual(statuses, ['queued', 'starting', 'error'])
  assert.equal(errors.length, 1)
  assert.deepEqual(scheduler.getRetryCounts(), {})
})

test('scheduler follows wrapped causes and still fails deterministic launch errors once', async () => {
  let starts = 0
  const { scheduler, statuses, errors } = schedulerFixture({
    launchRetries: 3,
    onStart: async () => {
      starts += 1
      throw new Error('production transaction failed', {
        cause: new Error('startup verification failed', {
          cause: new NonRetryableLaunchError('UA Client Hints coherence failed'),
        }),
      })
    },
    isRunning: () => false,
  })

  assert.equal(scheduler.enqueue('profile-1'), true)
  await waitFor(() => statuses.at(-1) === 'error')

  assert.equal(starts, 1)
  assert.equal(errors.length, 1)
})

test('scheduler preserves bounded retries for transient launch errors', async () => {
  let starts = 0
  const { scheduler, statuses, errors } = schedulerFixture({
    launchRetries: 2,
    onStart: async () => {
      starts += 1
      throw new Error('temporary network timeout')
    },
    isRunning: () => false,
  })

  assert.equal(scheduler.enqueue('profile-1'), true)
  await waitFor(() => statuses.at(-1) === 'error')

  assert.equal(starts, 3)
  assert.equal(statuses.filter((status) => status === 'queued').length, 3)
  assert.equal(errors.length, 1)
})

test('scheduler cannot publish running after cancellation during an in-flight launch', async () => {
  let releaseStart!: () => void
  const startGate = new Promise<void>((resolve) => {
    releaseStart = resolve
  })
  const active = new Set<string>()
  const { scheduler, statuses, errors } = schedulerFixture({
    onStart: async (profileId) => {
      await startGate
      active.add(profileId)
    },
    isRunning: (profileId) => active.has(profileId),
  })

  assert.equal(scheduler.enqueue('profile-1'), true)
  await waitFor(() => statuses.includes('starting'))
  scheduler.cancel('profile-1')
  releaseStart()
  await waitFor(() => statuses.at(-1) === 'stopped')

  assert.equal(statuses.includes('running'), false)
  assert.deepEqual(errors, [])
})
