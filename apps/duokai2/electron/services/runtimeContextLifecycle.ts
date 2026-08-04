export interface RuntimeContextLifecycleDependencies<Context> {
  profileId: string
  context: Context
  getCurrentContext(profileId: string): Context | undefined
  removeCurrentContext(profileId: string): void
  persistStopped(profileId: string): void
  markSchedulerStopped(profileId: string): void
}

export interface RuntimeContextCloseResult {
  converged: boolean
  reason: 'current-context' | 'stale-context'
}

export function convergeClosedRuntimeContext<Context>(
  dependencies: RuntimeContextLifecycleDependencies<Context>,
): RuntimeContextCloseResult {
  const {
    profileId,
    context,
    getCurrentContext,
    removeCurrentContext,
    persistStopped,
    markSchedulerStopped,
  } = dependencies

  if (getCurrentContext(profileId) !== context) {
    return { converged: false, reason: 'stale-context' }
  }

  removeCurrentContext(profileId)
  persistStopped(profileId)
  markSchedulerStopped(profileId)
  return { converged: true, reason: 'current-context' }
}
