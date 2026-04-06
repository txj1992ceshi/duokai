import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WORKSPACE_ALLOWED_OVERRIDES,
  WORKSPACE_BLOCKED_OVERRIDES,
  createDefaultFingerprint,
  createProfilePayload,
  normalizeWorkspaceDescriptor,
} from './factories.ts'

test('normalizeWorkspaceDescriptor pins identity to profileId and preserves declared overrides only', () => {
  const fingerprint = createDefaultFingerprint()
  const workspace = normalizeWorkspaceDescriptor(
    {
      identityProfileId: 'wrong-id',
      templateBinding: {
        templateId: 'template-1',
        templateRevision: 'rev-2',
        templateFingerprintHash: 'hash-2',
      },
      declaredOverrides: {
        timezone: 'Asia/Shanghai',
        browserLanguage: 'zh-CN',
        browserFamily: 'firefox',
      } as Record<string, string>,
    },
    'profile-1',
    fingerprint,
  )

  assert.equal(workspace.identityProfileId, 'profile-1')
  assert.equal(workspace.version, 1)
  assert.equal(workspace.migrationState, 'not_started')
  assert.deepEqual(workspace.allowedOverrides, WORKSPACE_ALLOWED_OVERRIDES)
  assert.deepEqual(workspace.blockedOverrides, WORKSPACE_BLOCKED_OVERRIDES)
  assert.equal(workspace.declaredOverrides.timezone, 'Asia/Shanghai')
  assert.equal(workspace.declaredOverrides.browserLanguage, 'zh-CN')
  assert.equal('browserFamily' in workspace.declaredOverrides, false)
})

test('createProfilePayload builds workspace resolvedEnvironment as runtime source of truth', () => {
  const payload = createProfilePayload(
    {
      name: 'Profile A',
      proxyId: null,
      groupName: 'Group',
      tags: [],
      notes: '',
      fingerprintConfig: {
        ...createDefaultFingerprint(),
        language: 'en-US',
        timezone: 'America/New_York',
        resolution: '1600x900',
      },
    },
    createDefaultFingerprint,
  )

  assert.equal(payload.workspace?.identityProfileId, payload.id)
  assert.equal(payload.workspace?.templateBinding.templateRevision, 'legacy-profile-v1')
  assert.equal(payload.workspace?.resolvedEnvironment.browserLanguage, 'en-US')
  assert.equal(payload.workspace?.resolvedEnvironment.timezone, 'America/New_York')
  assert.equal(payload.workspace?.resolvedEnvironment.resolution, '1600x900')
})
