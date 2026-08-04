import assert from 'node:assert/strict'
import test from 'node:test'

import { createDeviceProfileFromFingerprint } from './deviceProfile.ts'
import { createDefaultFingerprint, normalizeWorkspaceDescriptor } from './factories.ts'
import { buildProfileMetadataBackfillUpdate } from './profileMetadataBackfill.ts'

function buildCompleteRow() {
  const fingerprint = createDefaultFingerprint()
  const createdAt = '2026-07-01T00:00:00.000Z'
  const deviceProfile = createDeviceProfileFromFingerprint(fingerprint, createdAt)
  deviceProfile.updatedAt = '2026-07-02T00:00:00.000Z'
  const workspace = normalizeWorkspaceDescriptor(null, 'profile-one', fingerprint)
  return {
    id: 'profile-one',
    fingerprint_config: JSON.stringify(fingerprint),
    created_at: createdAt,
    environment_purpose: 'operation',
    device_profile: JSON.stringify(deviceProfile),
    workspace_json: JSON.stringify(workspace),
  }
}

test('complete profile metadata produces no bootstrap update', () => {
  const row = buildCompleteRow()
  assert.equal(buildProfileMetadataBackfillUpdate(row), null)
})

test('missing purpose is backfilled without rewriting stable device or workspace JSON', () => {
  const row = buildCompleteRow()
  const update = buildProfileMetadataBackfillUpdate({
    ...row,
    environment_purpose: null,
  })

  assert.ok(update)
  assert.equal(update.environmentPurpose, 'operation')
  assert.equal(update.deviceProfileJson, row.device_profile)
  assert.equal(update.workspaceJson, row.workspace_json)
})

test('incomplete workspace receives one normalized backfill update', () => {
  const row = buildCompleteRow()
  const update = buildProfileMetadataBackfillUpdate({
    ...row,
    workspace_json: '{}',
  })

  assert.ok(update)
  const workspace = JSON.parse(update.workspaceJson) as {
    identityProfileId?: string
    paths?: { profileDir?: string }
  }
  assert.equal(workspace.identityProfileId, row.id)
  assert.equal(Boolean(workspace.paths?.profileDir), true)
})
