import type { ProfileRecord } from '../../src/shared/types.ts'

export const CLOAK_PILOT_TEST_TAG = 'cloak-pilot-test'

export interface CloakPilotEnvironment {
  DUOKAI_CLOAK_PILOT_ENABLED?: string
  DUOKAI_CLOAK_PILOT_PROFILE_IDS?: string
}

export type CloakPilotEligibilityReason =
  | 'enabled'
  | 'global_flag_disabled'
  | 'profile_allowlist_empty'
  | 'profile_not_allowlisted'
  | 'test_tag_missing'

export interface CloakPilotEligibility {
  enabled: boolean
  reason: CloakPilotEligibilityReason
  profileId: string
  requiredTag: typeof CLOAK_PILOT_TEST_TAG
  allowlistedProfileIds: string[]
}

function parseAllowlist(value: string | undefined): string[] {
  return Array.from(
    new Set(
      String(value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry && entry !== '*'),
    ),
  )
}

export function evaluateCloakPilotEligibility(
  profile: Pick<ProfileRecord, 'id' | 'tags'>,
  environment: CloakPilotEnvironment = process.env,
): CloakPilotEligibility {
  const profileId = String(profile.id || '').trim()
  const allowlistedProfileIds = parseAllowlist(environment.DUOKAI_CLOAK_PILOT_PROFILE_IDS)
  const base: Pick<
    CloakPilotEligibility,
    'profileId' | 'requiredTag' | 'allowlistedProfileIds'
  > = {
    profileId,
    requiredTag: CLOAK_PILOT_TEST_TAG,
    allowlistedProfileIds,
  }

  if (environment.DUOKAI_CLOAK_PILOT_ENABLED !== '1') {
    return { ...base, enabled: false, reason: 'global_flag_disabled' }
  }
  if (allowlistedProfileIds.length === 0) {
    return { ...base, enabled: false, reason: 'profile_allowlist_empty' }
  }
  if (!allowlistedProfileIds.includes(profileId)) {
    return { ...base, enabled: false, reason: 'profile_not_allowlisted' }
  }
  const tags = new Set((profile.tags ?? []).map((tag) => String(tag).trim().toLowerCase()))
  if (!tags.has(CLOAK_PILOT_TEST_TAG)) {
    return { ...base, enabled: false, reason: 'test_tag_missing' }
  }
  return { ...base, enabled: true, reason: 'enabled' }
}
