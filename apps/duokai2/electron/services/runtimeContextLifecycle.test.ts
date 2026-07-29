import assert from 'node:assert/strict'
import test from 'node:test'

import { convergeClosedRuntimeContext } from './runtimeContextLifecycle.ts'

test('current context close synchronously converges local state to stopped', () => {
  const context = { id: 'current' }
  const contexts = new Map([['profile-1', context]])
  const events: string[] = []

  const result = convergeClosedRuntimeContext({
    profileId: 'profile-1',
    context,
    getCurrentContext: (profileId) => contexts.get(profileId),
    removeCurrentContext: (profileId) => {
      contexts.delete(profileId)
      events.push('remove-context')
    },
    persistStopped: () => {
      events.push('persist-stopped')
    },
    markSchedulerStopped: () => {
      events.push('scheduler-stopped')
    },
  })

  assert.deepEqual(result, { converged: true, reason: 'current-context' })
  assert.equal(contexts.has('profile-1'), false)
  assert.deepEqual(events, ['remove-context', 'persist-stopped', 'scheduler-stopped'])
})

test('stale context close cannot stop a newer replacement context', () => {
  const staleContext = { id: 'stale' }
  const currentContext = { id: 'current' }
  const contexts = new Map([['profile-1', currentContext]])
  const events: string[] = []

  const result = convergeClosedRuntimeContext({
    profileId: 'profile-1',
    context: staleContext,
    getCurrentContext: (profileId) => contexts.get(profileId),
    removeCurrentContext: () => events.push('remove-context'),
    persistStopped: () => events.push('persist-stopped'),
    markSchedulerStopped: () => events.push('scheduler-stopped'),
  })

  assert.deepEqual(result, { converged: false, reason: 'stale-context' })
  assert.equal(contexts.get('profile-1'), currentContext)
  assert.deepEqual(events, [])
})
