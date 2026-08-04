export type EnvironmentPushMode =
  | 'manual-force-upload'
  | 'auto-push'
  | 'auto-full-reconcile'
  | 'manual-force-pull'

export interface EnvironmentPushScope<Profile extends { id: string }> {
  profiles: Profile[]
  scoped: boolean
  allowRemoteDeletion: boolean
  requestedProfileIds: string[]
}

export function resolveEnvironmentPushScope<Profile extends { id: string }>(
  profiles: Profile[],
  mode: EnvironmentPushMode,
  profileIds: string[] = [],
): EnvironmentPushScope<Profile> {
  const requestedProfileIds = Array.from(
    new Set(profileIds.map((value) => String(value || '').trim()).filter(Boolean)),
  )
  const scoped = mode === 'auto-push' && requestedProfileIds.length > 0
  if (!scoped) {
    return {
      profiles,
      scoped: false,
      allowRemoteDeletion: true,
      requestedProfileIds,
    }
  }

  const allowed = new Set(requestedProfileIds)
  return {
    profiles: profiles.filter((profile) => allowed.has(String(profile.id))),
    scoped: true,
    allowRemoteDeletion: false,
    requestedProfileIds,
  }
}
