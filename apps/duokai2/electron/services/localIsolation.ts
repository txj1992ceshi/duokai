import path from 'node:path'
import type {
  ProfileRecord,
  ResolvedWorkspaceLaunchConfig,
  TrustedIsolationCheck,
  WorkspaceGateResult,
  WorkspacePaths,
} from '../../src/shared/types'
import { validateWorkspaceGate } from './profileValidator'
import { normalizeWorkspacePath, resolveWorkspaceLaunchConfig } from './workspaceRuntime'

type RuntimeLockState = 'unlocked' | 'locked' | 'stale-lock'

export interface LocalIsolationPreflightResult {
  status: WorkspaceGateResult['status']
  messages: string[]
  workspace: WorkspaceGateResult['workspace']
  launch: ResolvedWorkspaceLaunchConfig
  quickCheck: TrustedIsolationCheck
}

function buildCanonicalRoot(paths: WorkspacePaths): string {
  return path.dirname(normalizeWorkspacePath(paths.profileDir))
}

function isInsideRoot(targetPath: string, root: string): boolean {
  const normalizedTarget = normalizeWorkspacePath(targetPath)
  return normalizedTarget === root || normalizedTarget.startsWith(`${root}${path.sep}`)
}

export function runLocalIsolationPreflight(
  profile: ProfileRecord,
  allProfiles: ProfileRecord[],
  options: {
    disableGpu?: boolean
    getRuntimeLockState: (profile: ProfileRecord) => RuntimeLockState
  },
): LocalIsolationPreflightResult {
  const gate = validateWorkspaceGate(profile, allProfiles)
  const launch = resolveWorkspaceLaunchConfig(
    {
      ...profile,
      workspace: gate.workspace,
    },
    options.disableGpu ?? false,
  )

  const messages = [...gate.messages]
  let status = gate.status
  const canonicalRoot = launch.canonicalRoot || buildCanonicalRoot(gate.workspace.paths)
  const runtimeLockStatus = options.getRuntimeLockState(profile)
  const pathEntries = Object.entries(gate.workspace.paths) as Array<[keyof WorkspacePaths, string]>
  const uniquePathSet = new Set(pathEntries.map(([, targetPath]) => normalizeWorkspacePath(targetPath)))

  if (uniquePathSet.size !== pathEntries.length) {
    status = 'block'
    messages.push('Workspace isolation preflight detected reused local paths inside the same profile workspace.')
  }

  for (const [key, targetPath] of pathEntries) {
    if (!isInsideRoot(targetPath, canonicalRoot)) {
      status = 'block'
      messages.push(`Workspace isolation preflight detected ${key} escaping the canonical workspace root.`)
    }
  }

  if (normalizeWorkspacePath(launch.userDataDir) !== normalizeWorkspacePath(gate.workspace.paths.profileDir)) {
    status = 'block'
    messages.push('Canonical launch path mismatch: userDataDir must resolve from workspace.paths.profileDir.')
  }

  if (normalizeWorkspacePath(launch.cacheDir) !== normalizeWorkspacePath(gate.workspace.paths.cacheDir)) {
    status = 'block'
    messages.push('Canonical launch path mismatch: cacheDir must resolve from workspace.paths.cacheDir.')
  }

  if (normalizeWorkspacePath(launch.downloadsDir) !== normalizeWorkspacePath(gate.workspace.paths.downloadsDir)) {
    status = 'block'
    messages.push('Canonical launch path mismatch: downloadsDir must resolve from workspace.paths.downloadsDir.')
  }

  if (normalizeWorkspacePath(launch.extensionsDir) !== normalizeWorkspacePath(gate.workspace.paths.extensionsDir)) {
    status = 'block'
    messages.push('Canonical launch path mismatch: extensionsDir must resolve from workspace.paths.extensionsDir.')
  }

  if (normalizeWorkspacePath(launch.metaDir) !== normalizeWorkspacePath(gate.workspace.paths.metaDir)) {
    status = 'block'
    messages.push('Canonical launch path mismatch: metaDir must resolve from workspace.paths.metaDir.')
  }

  if (runtimeLockStatus !== 'locked') {
    status = 'block'
    messages.push(`Isolation preflight requires an active runtime lock, got "${runtimeLockStatus}".`)
  }

  const dedupedMessages = Array.from(new Set(messages))
  const success = status !== 'block'
  return {
    status,
    messages: dedupedMessages,
    workspace: gate.workspace,
    launch,
    quickCheck: {
      mode: 'preflight',
      checkedAt: new Date().toISOString(),
      success,
      message:
        dedupedMessages.length > 0
          ? dedupedMessages.join(' ')
          : 'Local isolation preflight passed.',
      egressIp: '',
      country: '',
      region: '',
      timezone: '',
      language: '',
      geolocation: '',
      effectiveProxyTransport: '',
      workspaceConsistencyStatus: gate.workspace.consistencySummary.status,
      workspaceHealthStatus: gate.workspace.healthSummary.status,
      runtimeLockStatus,
      canonicalRoot,
    },
  }
}
