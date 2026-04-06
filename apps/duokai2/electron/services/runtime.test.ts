import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDefaultFingerprint, createProfilePayload, normalizeWorkspaceDescriptor } from './factories.ts'
import {
  computeWorkspaceConsistencySummary,
  computeWorkspaceHealthSummary,
  validateWorkspaceGate,
} from './profileValidator.ts'
import { runLocalIsolationPreflight } from './localIsolation.ts'
import { resolveWorkspaceLaunchConfig } from './workspaceRuntime.ts'
import type { ProfileRecord, WorkspaceMigrationCheckpoint } from '../../src/shared/types.ts'

function createWorkspaceDirectories(
  profileId: string,
  options?: {
    skip?: Array<'cacheDir' | 'downloadsDir' | 'extensionsDir' | 'metaDir'>
  },
): Record<'profileDir' | 'cacheDir' | 'downloadsDir' | 'extensionsDir' | 'metaDir', string> {
  const root = mkdtempSync(path.join(os.tmpdir(), `duokai-${profileId}-`))
  const base = path.join(root, 'workspaces', profileId)
  const paths = {
    profileDir: path.join(base, 'profile'),
    cacheDir: path.join(base, 'cache'),
    downloadsDir: path.join(base, 'downloads'),
    extensionsDir: path.join(base, 'extensions'),
    metaDir: path.join(base, 'meta'),
  }
  mkdirSync(paths.profileDir, { recursive: true })
  for (const key of ['cacheDir', 'downloadsDir', 'extensionsDir', 'metaDir'] as const) {
    if (options?.skip?.includes(key)) {
      continue
    }
    mkdirSync(paths[key], { recursive: true })
  }
  return paths
}

function writeMigrationState(
  metaDir: string,
  profileId: string,
  migrationState: string,
  checkpoints: WorkspaceMigrationCheckpoint[],
): void {
  mkdirSync(metaDir, { recursive: true })
  writeFileSync(
    path.join(metaDir, 'migration-state.json'),
    JSON.stringify(
      {
        profileId,
        migrationState,
        checkpoints,
        updatedAt: '2026-04-03T00:00:00.000Z',
      },
      null,
      2,
    ),
    'utf8',
  )
}

function buildProfile(
  profileId = 'profile-1',
  options?: {
    paths?: Record<'profileDir' | 'cacheDir' | 'downloadsDir' | 'extensionsDir' | 'metaDir', string>
    workspace?: Partial<NonNullable<ProfileRecord['workspace']>>
    fingerprintLanguage?: string
    fingerprintTimezone?: string
    fingerprintResolution?: string
    fingerprintLaunchArgs?: string
  },
): ProfileRecord {
  const fingerprint = {
    ...createDefaultFingerprint(),
    language: options?.fingerprintLanguage || 'legacy-language',
    timezone: options?.fingerprintTimezone || 'Legacy/Timezone',
    resolution: options?.fingerprintResolution || '800x600',
    advanced: {
      ...createDefaultFingerprint().advanced,
      launchArgs: options?.fingerprintLaunchArgs || '--legacy-arg',
    },
  }
  const paths = options?.paths ?? createWorkspaceDirectories(profileId)
  const checkpoints: WorkspaceMigrationCheckpoint[] = [
    { name: 'migration_completed', completedAt: '2026-04-03T00:00:00.000Z' },
  ]
  writeMigrationState(paths.metaDir, profileId, 'completed', checkpoints)

  const payload = createProfilePayload(
    {
      id: profileId,
      name: 'Workspace Profile',
      proxyId: null,
      groupName: 'Group',
      tags: [],
      notes: '',
      fingerprintConfig: fingerprint,
      workspace: normalizeWorkspaceDescriptor(
        {
          migrationState: 'completed',
          migrationCheckpoints: checkpoints,
          templateBinding: {
            templateId: 'template-1',
            templateRevision: 'rev-1',
            templateFingerprintHash: '',
          },
          paths,
          resolvedEnvironment: {
            browserFamily: 'chrome',
            browserMajorVersionRange: '136',
            systemLanguage: 'en-US',
            browserLanguage: 'fr-FR',
            timezone: 'Europe/Paris',
            resolution: '1600x900',
            fontStrategy: 'system',
            webrtcPolicy: 'disabled',
            ipv6Policy: 'ipv6',
            downloadsDir: paths.downloadsDir,
            launchArgs: ['--workspace-arg'],
          },
          ...(options?.workspace ?? {}),
        },
        profileId,
        fingerprint,
      ),
    },
    createDefaultFingerprint,
  )

  return {
    ...payload,
    environmentPurpose: payload.environmentPurpose!,
    deviceProfile: payload.deviceProfile!,
    workspace: payload.workspace!,
    status: 'stopped' as const,
    lastStartedAt: null,
    createdAt: '2026-04-03T00:00:00.000Z',
    updatedAt: '2026-04-03T00:00:00.000Z',
  }
}

test('resolveWorkspaceLaunchConfig uses workspace runtime source of truth', () => {
  const profile = buildProfile()
  const resolved = resolveWorkspaceLaunchConfig(profile, false)

  assert.equal(resolved.userDataDir, profile.workspace!.paths.profileDir)
  assert.equal(resolved.cacheDir, profile.workspace!.paths.cacheDir)
  assert.equal(resolved.downloadsDir, profile.workspace!.paths.downloadsDir)
  assert.equal(resolved.extensionsDir, profile.workspace!.paths.extensionsDir)
  assert.equal(resolved.metaDir, profile.workspace!.paths.metaDir)
  assert.equal(resolved.canonicalRoot, path.dirname(profile.workspace!.paths.profileDir))
  assert.equal(resolved.locale, 'fr-FR')
  assert.equal(resolved.timezoneId, 'Europe/Paris')
  assert.deepEqual(resolved.viewport, { width: 1600, height: 900 })
  assert.deepEqual(resolved.launchArgs, ['--workspace-arg', '--disable-webrtc'])
})

test('runLocalIsolationPreflight passes with canonical workspace launch paths and runtime lock', () => {
  const profile = buildProfile('profile-preflight-pass')
  const result = runLocalIsolationPreflight(profile, [profile], {
    getRuntimeLockState: () => 'locked',
  })

  assert.equal(result.status, 'pass')
  assert.equal(result.launch.userDataDir, profile.workspace!.paths.profileDir)
  assert.equal(result.launch.cacheDir, profile.workspace!.paths.cacheDir)
  assert.equal(result.quickCheck.mode, 'preflight')
  assert.equal(result.quickCheck.success, true)
  assert.equal(result.quickCheck.runtimeLockStatus, 'locked')
  assert.equal(result.quickCheck.workspaceConsistencyStatus, 'pass')
})

test('runLocalIsolationPreflight blocks when runtime lock is missing', () => {
  const profile = buildProfile('profile-preflight-lock')
  const result = runLocalIsolationPreflight(profile, [profile], {
    getRuntimeLockState: () => 'unlocked',
  })

  assert.equal(result.status, 'block')
  assert.equal(result.quickCheck.success, false)
  assert.match(result.quickCheck.message, /runtime lock/i)
})

test('runLocalIsolationPreflight blocks when workspace paths are reused inside one profile', () => {
  const paths = createWorkspaceDirectories('profile-preflight-shared')
  const profile = buildProfile('profile-preflight-shared', {
    paths: {
      ...paths,
      cacheDir: paths.downloadsDir,
    },
  })
  const result = runLocalIsolationPreflight(profile, [profile], {
    getRuntimeLockState: () => 'locked',
  })

  assert.equal(result.status, 'block')
  assert.match(result.quickCheck.message, /reused local paths/i)
})

test('computeWorkspaceHealthSummary returns healthy for completed workspace layout', () => {
  const profile = buildProfile()
  const result = computeWorkspaceHealthSummary(profile)
  assert.equal(result.status, 'healthy')
})

test('computeWorkspaceHealthSummary returns warning for missing secondary workspace directories', () => {
  const paths = createWorkspaceDirectories('profile-warning', { skip: ['cacheDir', 'downloadsDir'] })
  const profile = buildProfile('profile-warning', { paths })
  const result = computeWorkspaceHealthSummary(profile)
  assert.equal(result.status, 'warning')
  assert.match(result.messages.join(' '), /recreated safely/i)
})

test('computeWorkspaceHealthSummary returns broken for missing profileDir', () => {
  const paths = createWorkspaceDirectories('profile-broken')
  const profile = buildProfile('profile-broken', {
    paths: {
      ...paths,
      profileDir: path.join(path.dirname(paths.profileDir), 'missing-profile'),
    },
  })
  const result = computeWorkspaceHealthSummary(profile)
  assert.equal(result.status, 'broken')
  assert.match(result.messages.join(' '), /profileDir/i)
})

test('computeWorkspaceConsistencySummary passes for exact workspace baseline', () => {
  const profile = buildProfile('profile-pass')
  const result = computeWorkspaceConsistencySummary(profile, [profile])
  assert.equal(result.status, 'pass')
})

test('computeWorkspaceConsistencySummary warns for allowed declared override drift', () => {
  const profile = buildProfile('profile-warn', {
    workspace: {
      declaredOverrides: {
        timezone: 'Europe/Paris',
        browserLanguage: 'fr-FR',
      },
    },
  })
  const result = computeWorkspaceConsistencySummary(profile, [profile])
  assert.equal(result.status, 'warn')
  assert.match(result.messages.join(' '), /declared override/i)
})

test('computeWorkspaceConsistencySummary blocks on blocked runtime drift', () => {
  const profile = buildProfile('profile-blocked', {
    workspace: {
      templateBinding: {
        templateId: 'template-1',
        templateRevision: 'rev-1',
        templateFingerprintHash: 'mismatch',
      },
    },
  })
  const result = computeWorkspaceConsistencySummary(profile, [profile])
  assert.equal(result.status, 'block')
  assert.match(result.messages.join(' '), /fingerprint/i)
})

test('computeWorkspaceConsistencySummary blocks on shared workspace paths', () => {
  const sharedPaths = createWorkspaceDirectories('shared-profile')
  const profile = buildProfile('profile-a', { paths: sharedPaths })
  const otherProfile = buildProfile('profile-b', { paths: sharedPaths })
  const result = computeWorkspaceConsistencySummary(profile, [profile, otherProfile])
  assert.equal(result.status, 'block')
  assert.match(result.messages.join(' '), /shared/i)
})

test('computeWorkspaceConsistencySummary blocks unsupported declaredOverrides keys', () => {
  const profile = buildProfile('profile-invalid-override')
  ;(profile.workspace!.declaredOverrides as Record<string, string>).browserFamily = 'chrome'
  const result = computeWorkspaceConsistencySummary(profile, [profile])
  assert.equal(result.status, 'block')
  assert.match(result.messages.join(' '), /unsupported key/i)
})

test('validateWorkspaceGate returns warn for warning-only workspace state', () => {
  const paths = createWorkspaceDirectories('profile-gate-warn', { skip: ['cacheDir'] })
  const profile = buildProfile('profile-gate-warn', {
    paths,
    workspace: {
      declaredOverrides: {
        timezone: 'Europe/Paris',
      },
    },
  })
  const result = validateWorkspaceGate(profile, [profile])
  assert.equal(result.status, 'warn')
  assert.equal(result.workspace.healthSummary.status, 'warning')
  assert.equal(result.workspace.consistencySummary.status, 'warn')
})

test('validateWorkspaceGate blocks incomplete migration', () => {
  const profile = buildProfile('profile-incomplete')
  profile.workspace = {
    ...profile.workspace!,
    migrationState: 'in_progress',
    migrationCheckpoints: [],
  }

  const result = validateWorkspaceGate(profile, [profile])
  assert.equal(result.status, 'block')
  assert.match(result.messages.join(' '), /migration/i)
})

test('validateWorkspaceGate blocks missing resolvedEnvironment launch fields', () => {
  const profile = buildProfile('profile-missing-runtime', {
    workspace: {
      resolvedEnvironment: {
        ...buildProfile('profile-missing-runtime-baseline').workspace!.resolvedEnvironment,
        browserLanguage: '',
      },
    },
  })
  const result = validateWorkspaceGate(profile, [profile])
  assert.equal(result.status, 'block')
  assert.match(result.messages.join(' '), /runtime field|browserLanguage/i)
})

test('validateWorkspaceGate passes for valid workspace subtree', () => {
  const profile = buildProfile('profile-valid')
  const result = validateWorkspaceGate(profile, [profile])
  assert.equal(result.status, 'pass')
  assert.equal(result.workspace.healthSummary.status, 'healthy')
  assert.equal(result.workspace.consistencySummary.status, 'pass')
})
