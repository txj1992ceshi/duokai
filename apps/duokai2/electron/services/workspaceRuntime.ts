import path from 'node:path'
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
  windowSize: { width: number; height: number },
  launchArgs = '',
  disableGpu = false,
): string[] {
  const args = launchArgs
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.startsWith('--window-size='))

  args.push(`--window-size=${windowSize.width},${windowSize.height}`)
  if (webrtcMode === 'disabled') {
    args.push('--disable-webrtc')
  }
  if (disableGpu) {
    args.push('--disable-gpu')
  }
  return Array.from(new Set(args))
}

export function normalizeWorkspacePath(input: string): string {
  const normalized = path.normalize(path.resolve(input))
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function buildCanonicalWorkspaceRoot(profile: ProfileRecord): string {
  const workspace = profile.workspace
  if (!workspace) {
    throw new Error(`Workspace is missing for profile ${profile.id}`)
  }
  return path.dirname(normalizeWorkspacePath(workspace.paths.profileDir))
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
  const windowSize = normalizeResolution(resolvedEnvironment.resolution)
  // Runtime must read launch values from workspace.resolvedEnvironment and workspace.paths.
  // Legacy fingerprintConfig fields remain compatibility mirrors only.
  return {
    userDataDir: paths.profileDir,
    cacheDir: paths.cacheDir,
    downloadsDir: paths.downloadsDir,
    extensionsDir: paths.extensionsDir,
    metaDir: paths.metaDir,
    canonicalRoot: buildCanonicalWorkspaceRoot(profile),
    locale: parseLocale(resolvedEnvironment.browserLanguage),
    timezoneId: resolvedEnvironment.timezone || 'America/Los_Angeles',
    windowSize,
    // Let Chromium own the live viewport so page layout tracks the real content area.
    viewport: null,
    webrtcPolicy: resolvedEnvironment.webrtcPolicy,
    launchArgs: buildRuntimeArgs(
      resolvedEnvironment.webrtcPolicy,
      windowSize,
      resolvedEnvironment.launchArgs.join(', '),
      disableGpu,
    ),
  }
}
