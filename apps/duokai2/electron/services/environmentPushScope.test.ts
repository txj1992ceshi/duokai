import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveEnvironmentPushScope } from './environmentPushScope.ts'

const profiles = [
  { id: 'target', name: 'Target' },
  { id: 'other', name: 'Other' },
]

test('auto-push with declared profile IDs only selects those profiles', () => {
  const resolved = resolveEnvironmentPushScope(profiles, 'auto-push', ['target', 'target'])

  assert.deepEqual(resolved.profiles, [profiles[0]])
  assert.equal(resolved.scoped, true)
  assert.equal(resolved.allowRemoteDeletion, false)
  assert.deepEqual(resolved.requestedProfileIds, ['target'])
})

test('manual upload remains a full replacement even when IDs are supplied', () => {
  const resolved = resolveEnvironmentPushScope(profiles, 'manual-force-upload', ['target'])

  assert.deepEqual(resolved.profiles, profiles)
  assert.equal(resolved.scoped, false)
  assert.equal(resolved.allowRemoteDeletion, true)
})

test('legacy auto-push with no IDs retains full reconciliation semantics', () => {
  const resolved = resolveEnvironmentPushScope(profiles, 'auto-push', [])

  assert.deepEqual(resolved.profiles, profiles)
  assert.equal(resolved.scoped, false)
  assert.equal(resolved.allowRemoteDeletion, true)
})
