import type { ProfileRecord, ResolvedWorkspaceLaunchConfig } from '../../src/shared/types'

function parseLocale(language: string): string {
  return language || 'en-US'
}

function normalizeResolution(value: string): { width: number; height: number } {
  const [widthText, heightText] = value.split('x')
  const width = Number(widthText)
  const height = Number(heightText)
  if (!width || !height) {
    return { width: 1440, height: 900 }
  }
  return { width, height }
}

function buildRuntimeArgs(
  webrtcMode: ResolvedWorkspaceLaunchConfig['webrtcPolicy'],
  launchArgs = '',
  disableGpu = false,
): string[] {
  const args = launchArgs
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (webrtcMode === 'disabled') {
    args.push('--disable-webrtc')
  }
  if (disableGpu) {
    args.push('--disable-gpu')
  }
  return Array.from(new Set(args))
}

export function resolveWorkspaceLaunchConfig(
  profile: ProfileRecord,
  disableGpu = false,
): ResolvedWorkspaceLaunchConfig {
  const workspace = profile.workspace
  if (!workspace) {
    throw new Error(`Workspace is missing for profile ${profile.id}`)
  }
  const { resolvedEnvironment, paths } = workspace
  // Runtime must read launch values from workspace.resolvedEnvironment and workspace.paths.
  // Legacy fingerprintConfig fields remain compatibility mirrors only.
  return {
    userDataDir: paths.profileDir,
    downloadsDir: paths.downloadsDir,
    locale: parseLocale(resolvedEnvironment.browserLanguage),
    timezoneId: resolvedEnvironment.timezone || 'America/Los_Angeles',
    viewport: normalizeResolution(resolvedEnvironment.resolution),
    webrtcPolicy: resolvedEnvironment.webrtcPolicy,
    launchArgs: buildRuntimeArgs(
      resolvedEnvironment.webrtcPolicy,
      resolvedEnvironment.launchArgs.join(', '),
      disableGpu,
    ),
  }
}
