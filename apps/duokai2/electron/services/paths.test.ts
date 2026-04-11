import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createDefaultFingerprint,
  createPortableWorkspaceDescriptor,
  normalizeWorkspaceDescriptor,
} from './factories.ts'
import {
  ensureWorkspaceLayoutForProfile,
  normalizeWorkspacePathsForProfile,
  resolveWorkspacePaths,
} from './paths.ts'

function createFakeApp(userDataDir: string) {
  return {
    getPath(name: string) {
      if (name !== 'userData') {
        throw new Error(`Unexpected path request: ${name}`)
      }
      return userDataDir
    },
  } as { getPath(name: string): string }
}

test('resolveWorkspacePaths uses workspaces/<id> layout', () => {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'duokai-workspace-paths-'))
  const app = createFakeApp(userDataDir)
  const paths = resolveWorkspacePaths(app as never, 'profile-1')

  assert.equal(paths.profileDir, path.join(userDataDir, 'workspaces', 'profile-1', 'profile'))
  assert.equal(paths.cacheDir, path.join(userDataDir, 'workspaces', 'profile-1', 'cache'))
  assert.equal(paths.downloadsDir, path.join(userDataDir, 'workspaces', 'profile-1', 'downloads'))
  assert.equal(paths.extensionsDir, path.join(userDataDir, 'workspaces', 'profile-1', 'extensions'))
  assert.equal(paths.metaDir, path.join(userDataDir, 'workspaces', 'profile-1', 'meta'))
})

test('normalizeWorkspacePathsForProfile anchors legacy relative paths under userData', () => {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'duokai-workspace-normalize-'))
  const app = createFakeApp(userDataDir)
  const paths = normalizeWorkspacePathsForProfile(app as never, 'profile-1', {
    profileDir: 'workspaces/profile-1/profile',
    cacheDir: 'workspaces/profile-1/cache',
    downloadsDir: 'workspaces/profile-1/downloads',
    extensionsDir: 'workspaces/profile-1/extensions',
    metaDir: 'workspaces/profile-1/meta',
  })

  assert.equal(paths.profileDir, path.join(userDataDir, 'workspaces', 'profile-1', 'profile'))
  assert.equal(paths.cacheDir, path.join(userDataDir, 'workspaces', 'profile-1', 'cache'))
  assert.equal(paths.downloadsDir, path.join(userDataDir, 'workspaces', 'profile-1', 'downloads'))
  assert.equal(paths.extensionsDir, path.join(userDataDir, 'workspaces', 'profile-1', 'extensions'))
  assert.equal(paths.metaDir, path.join(userDataDir, 'workspaces', 'profile-1', 'meta'))
})

test('createPortableWorkspaceDescriptor strips foreign absolute paths before cross-device sync', () => {
  const fingerprint = createDefaultFingerprint()
  const portable = createPortableWorkspaceDescriptor(
    {
      paths: {
        profileDir: 'C:\\Users\\jj\\AppData\\Roaming\\Duokai\\workspaces\\profile-1\\profile',
        cacheDir: 'C:\\Users\\jj\\AppData\\Roaming\\Duokai\\workspaces\\profile-1\\cache',
        downloadsDir: '/Users/jj/Library/Application Support/Duokai/workspaces/profile-1/downloads',
        extensionsDir: '/Users/jj/Library/Application Support/Duokai/workspaces/profile-1/extensions',
        metaDir: '/Users/jj/Library/Application Support/Duokai/workspaces/profile-1/meta',
      },
      resolvedEnvironment: {
        browserFamily: 'chrome',
        browserMajorVersionRange: '136',
        systemLanguage: 'en-US',
        browserLanguage: 'en-US',
        timezone: 'Asia/Shanghai',
        resolution: '1280x720',
        fontStrategy: 'system',
        webrtcPolicy: 'default',
        ipv6Policy: 'ipv4',
        downloadsDir: 'D:\\Downloads\\duokai',
        launchArgs: [],
      },
    },
    'profile-1',
    fingerprint,
  )

  assert.deepEqual(portable.paths, {
    profileDir: 'workspaces/profile-1/profile',
    cacheDir: 'workspaces/profile-1/cache',
    downloadsDir: 'workspaces/profile-1/downloads',
    extensionsDir: 'workspaces/profile-1/extensions',
    metaDir: 'workspaces/profile-1/meta',
  })
  assert.equal(portable.resolvedEnvironment.downloadsDir, 'workspaces/profile-1/downloads')
})

test('ensureWorkspaceLayoutForProfile migrates legacy profile dir once and resumes idempotently', () => {
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'duokai-workspace-migration-'))
  const app = createFakeApp(userDataDir)
  const legacyDir = path.join(userDataDir, 'profiles', 'profile-1')
  mkdirSync(legacyDir, { recursive: true })
  writeFileSync(path.join(legacyDir, 'storageState.json'), '{"cookies":[]}', 'utf8')

  let persistedWorkspace = normalizeWorkspaceDescriptor(null, 'profile-1', createDefaultFingerprint())
  const profile = {
    id: 'profile-1',
    name: 'Profile 1',
    proxyId: null,
    groupName: '',
    tags: [],
    notes: '',
    environmentPurpose: 'operation' as const,
    deviceProfile: {
      version: 1,
      deviceClass: 'desktop' as const,
      operatingSystem: 'macOS',
      platform: '',
      browserKernel: 'chrome' as const,
      browserVersion: '136',
      userAgent: '',
      viewport: { width: 1280, height: 720 },
      locale: { language: 'en-US', interfaceLanguage: 'en-US', timezone: '', geolocation: '' },
      hardware: { cpuCores: 8, memoryGb: 8, webglVendor: '', webglRenderer: '' },
      mediaProfile: {
        fontMode: 'system' as const,
        mediaDevicesMode: 'off' as const,
        speechVoicesMode: 'off' as const,
        canvasMode: 'random' as const,
        webglImageMode: 'random' as const,
        webglMetadataMode: 'random' as const,
        audioContextMode: 'random' as const,
        clientRectsMode: 'random' as const,
      },
      support: {
        fonts: 'active' as const,
        mediaDevices: 'active' as const,
        speechVoices: 'active' as const,
        canvas: 'active' as const,
        webgl: 'active' as const,
        audio: 'active' as const,
        clientRects: 'active' as const,
        geolocation: 'active' as const,
        deviceInfo: 'active' as const,
        sslFingerprint: 'active' as const,
        pluginFingerprint: 'active' as const,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    fingerprintConfig: createDefaultFingerprint(),
    workspace: persistedWorkspace,
    status: 'stopped' as const,
    lastStartedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const migrated = ensureWorkspaceLayoutForProfile(app as never, profile, (workspace) => {
    persistedWorkspace = workspace
  })
  const rerun = ensureWorkspaceLayoutForProfile(app as never, { ...profile, workspace: migrated }, (workspace) => {
    persistedWorkspace = workspace
  })

  assert.equal(migrated.migrationState, 'completed')
  assert.equal(rerun.migrationState, 'completed')
  assert.equal(
    persistedWorkspace.migrationCheckpoints.some((item) => item.name === 'migration_completed'),
    true,
  )
  assert.equal(
    path.join(userDataDir, 'workspaces', 'profile-1', 'profile'),
    migrated.paths.profileDir,
  )
  assert.equal(migrated.resolvedEnvironment.downloadsDir, migrated.paths.downloadsDir)
  assert.equal(Boolean(migrated.templateBinding.templateFingerprintHash), true)
  assert.equal(
    JSON.parse(readFileSync(path.join(migrated.paths.metaDir, 'migration-state.json'), 'utf8')).migrationState,
    'completed',
  )
})
