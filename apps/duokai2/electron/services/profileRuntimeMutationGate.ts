export interface ProfileRuntimeMutationState {
  runningProfileIds?: Iterable<string>
  startingProfileIds?: Iterable<string>
  queuedProfileIds?: Iterable<string>
}

function normalizeId(value: unknown): string {
  return String(value ?? '').trim()
}

function activeProfileIds(state: ProfileRuntimeMutationState): Set<string> {
  return new Set(
    [
      ...(state.runningProfileIds ?? []),
      ...(state.startingProfileIds ?? []),
      ...(state.queuedProfileIds ?? []),
    ]
      .map(normalizeId)
      .filter(Boolean),
  )
}

export function assertProfileRuntimeInactiveForMutation(
  profileIds: Iterable<string>,
  state: ProfileRuntimeMutationState,
  operation: string,
): void {
  const active = activeProfileIds(state)
  const blocked = Array.from(
    new Set(Array.from(profileIds, normalizeId).filter((profileId) => profileId && active.has(profileId))),
  ).sort()
  if (blocked.length === 0) return
  throw new Error(
    `Stop running, starting or queued Profile runtimes before ${operation}: ${blocked.join(', ')}.`,
  )
}

export function assertAllProfileRuntimesInactiveForMutation(
  state: ProfileRuntimeMutationState,
  operation: string,
): void {
  const blocked = [...activeProfileIds(state)].sort()
  if (blocked.length === 0) return
  throw new Error(
    `Stop all running, starting or queued Profile runtimes before ${operation}: ${blocked.join(', ')}.`,
  )
}
