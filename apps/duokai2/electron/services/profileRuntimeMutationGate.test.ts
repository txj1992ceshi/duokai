import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertAllProfileRuntimesInactiveForMutation,
  assertProfileRuntimeInactiveForMutation,
} from './profileRuntimeMutationGate.ts'

test('exact Profile mutations pass only when targeted runtimes are inactive', () => {
  assert.doesNotThrow(() =>
    assertProfileRuntimeInactiveForMutation(
      ['profile-a'],
      { runningProfileIds: ['profile-b'] },
      'updating a Profile',
    ),
  )

  for (const state of [
    { runningProfileIds: ['profile-a'] },
    { startingProfileIds: ['profile-a'] },
    { queuedProfileIds: ['profile-a'] },
  ]) {
    assert.throws(
      () => assertProfileRuntimeInactiveForMutation(['profile-a'], state, 'updating a Profile'),
      /Stop running, starting or queued Profile runtimes.*profile-a/,
    )
  }
})

test('exact mutation errors report only blocked Profile IDs deterministically', () => {
  assert.throws(
    () =>
      assertProfileRuntimeInactiveForMutation(
        ['profile-c', 'profile-a', 'profile-b', 'profile-a'],
        {
          runningProfileIds: ['profile-c'],
          queuedProfileIds: ['profile-a'],
        },
        'bulk assignment',
      ),
    /profile-a, profile-c/,
  )
})

test('global imports fail closed while any Profile runtime is active', () => {
  assert.doesNotThrow(() =>
    assertAllProfileRuntimesInactiveForMutation({}, 'importing a configuration bundle'),
  )
  assert.throws(
    () =>
      assertAllProfileRuntimesInactiveForMutation(
        {
          runningProfileIds: ['running'],
          startingProfileIds: ['starting'],
          queuedProfileIds: ['queued'],
        },
        'importing a configuration bundle',
      ),
    /queued, running, starting/,
  )
})
