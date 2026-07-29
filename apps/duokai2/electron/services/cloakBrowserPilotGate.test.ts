import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CLOAK_PILOT_TEST_TAG,
  evaluateCloakPilotEligibility,
} from './cloakBrowserPilotGate.ts'

const profile = {
  id: 'profile-phase5b',
  tags: [CLOAK_PILOT_TEST_TAG],
}

test('Pilot is default-off even for tagged and allowlisted profiles', () => {
  assert.deepEqual(
    evaluateCloakPilotEligibility(profile, {
      DUOKAI_CLOAK_PILOT_PROFILE_IDS: profile.id,
    }),
    {
      enabled: false,
      reason: 'global_flag_disabled',
      profileId: profile.id,
      requiredTag: CLOAK_PILOT_TEST_TAG,
      allowlistedProfileIds: [profile.id],
    },
  )
})

test('Pilot requires a non-empty exact profile allowlist', () => {
  assert.equal(
    evaluateCloakPilotEligibility(profile, {
      DUOKAI_CLOAK_PILOT_ENABLED: '1',
      DUOKAI_CLOAK_PILOT_PROFILE_IDS: '*',
    }).reason,
    'profile_allowlist_empty',
  )
  assert.equal(
    evaluateCloakPilotEligibility(profile, {
      DUOKAI_CLOAK_PILOT_ENABLED: '1',
      DUOKAI_CLOAK_PILOT_PROFILE_IDS: 'other-profile',
    }).reason,
    'profile_not_allowlisted',
  )
})

test('Pilot requires the explicit test tag in addition to the two environment gates', () => {
  const decision = evaluateCloakPilotEligibility(
    { id: profile.id, tags: ['production'] },
    {
      DUOKAI_CLOAK_PILOT_ENABLED: '1',
      DUOKAI_CLOAK_PILOT_PROFILE_IDS: profile.id,
    },
  )
  assert.equal(decision.enabled, false)
  assert.equal(decision.reason, 'test_tag_missing')
})

test('Pilot enables only when all three gates match', () => {
  const decision = evaluateCloakPilotEligibility(profile, {
    DUOKAI_CLOAK_PILOT_ENABLED: '1',
    DUOKAI_CLOAK_PILOT_PROFILE_IDS: `other, ${profile.id}, ${profile.id}`,
  })
  assert.equal(decision.enabled, true)
  assert.equal(decision.reason, 'enabled')
  assert.deepEqual(decision.allowlistedProfileIds, ['other', profile.id])
})
