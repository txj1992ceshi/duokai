import type {
  TrustedLaunchSnapshot,
  TrustedIsolationCheck,
  WorkspaceConsistencyReport,
  WorkspaceHealthReport,
} from '../../src/shared/types'

export interface TrustedSnapshotReuseContext {
  configFingerprintHash: string
  proxyFingerprintHash: string
  currentDesktopAppVersion: string
  currentChromiumMajor: string
  currentHostEnvironment: string
  currentCanonicalRoot: string
  runtimeLockStatus: 'unlocked' | 'locked' | 'stale-lock'
  workspaceHealthStatus: WorkspaceHealthReport['status']
  workspaceConsistencyStatus: WorkspaceConsistencyReport['status']
  lastQuickIsolationCheck: TrustedIsolationCheck | null
}

export interface TrustedSnapshotReuseDecision {
  usable: boolean
  status: TrustedLaunchSnapshot['status']
  reason: string
}

export function evaluateTrustedSnapshotReuse(
  snapshot: TrustedLaunchSnapshot | null,
  context: TrustedSnapshotReuseContext,
): TrustedSnapshotReuseDecision {
  if (!snapshot) {
    return { usable: false, status: 'stale', reason: 'Trusted launch snapshot is missing.' }
  }
  if (snapshot.status !== 'trusted') {
    return { usable: false, status: snapshot.status, reason: `Trusted launch snapshot is ${snapshot.status}.` }
  }
  if (snapshot.snapshotVersion <= 0) {
    return { usable: false, status: 'stale', reason: 'Trusted launch snapshot version is invalid.' }
  }
  if (snapshot.configFingerprintHash !== context.configFingerprintHash) {
    return { usable: false, status: 'stale', reason: 'Trusted launch snapshot config fingerprint no longer matches.' }
  }
  if (snapshot.proxyFingerprintHash !== context.proxyFingerprintHash) {
    return { usable: false, status: 'stale', reason: 'Trusted launch snapshot proxy fingerprint no longer matches.' }
  }
  if (snapshot.verifiedDesktopAppVersion !== context.currentDesktopAppVersion) {
    return { usable: false, status: 'stale', reason: 'Desktop app version changed since the trusted launch snapshot was recorded.' }
  }
  if (snapshot.verifiedChromiumMajor !== context.currentChromiumMajor) {
    return { usable: false, status: 'stale', reason: 'Chromium major version changed since the trusted launch snapshot was recorded.' }
  }
  if (snapshot.verifiedHostEnvironment !== context.currentHostEnvironment) {
    return { usable: false, status: 'invalid', reason: 'Desktop host environment changed since the trusted launch snapshot was recorded.' }
  }
  if (context.workspaceHealthStatus === 'broken') {
    return { usable: false, status: 'invalid', reason: 'Workspace health is broken, trusted launch snapshot cannot be reused.' }
  }
  if (context.workspaceConsistencyStatus === 'block') {
    return { usable: false, status: 'invalid', reason: 'Workspace consistency is blocked, trusted launch snapshot cannot be reused.' }
  }
  if (context.workspaceHealthStatus === 'warning' || context.workspaceConsistencyStatus === 'warn') {
    return { usable: false, status: 'stale', reason: 'Workspace drift requires a full isolation check before launch.' }
  }
  if (context.runtimeLockStatus !== 'locked') {
    return { usable: false, status: 'invalid', reason: `Runtime lock is ${context.runtimeLockStatus}, trusted launch snapshot cannot be reused.` }
  }
  if (context.lastQuickIsolationCheck?.success === false) {
    return { usable: false, status: 'invalid', reason: 'Last quick isolation check failed, trusted launch snapshot cannot be reused.' }
  }
  if (
    context.lastQuickIsolationCheck?.canonicalRoot &&
    context.currentCanonicalRoot &&
    context.lastQuickIsolationCheck.canonicalRoot !== context.currentCanonicalRoot
  ) {
    return { usable: false, status: 'invalid', reason: 'Workspace canonical root drifted since the last trusted isolation check.' }
  }
  return { usable: true, status: 'trusted', reason: '' }
}
