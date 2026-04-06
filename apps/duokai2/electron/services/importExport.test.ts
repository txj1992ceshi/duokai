import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createDefaultFingerprint, createProfilePayload, normalizeWorkspaceDescriptor } from './factories.ts'
import { buildExportBundleV2, importWorkspaceSnapshotsFromBundle } from './importExport.ts'
import { createWorkspaceSnapshot } from './workspaceSnapshots.ts'
import type { ExportBundle, ProfileRecord, SettingsPayload } from '../../src/shared/types.ts'

function buildProfile(profileId = 'bundle-profile', userDataDir?: string): ProfileRecord {
  const root = userDataDir || mkdtempSync(path.join(os.tmpdir(), `duokai-import-export-${profileId}-`))
  const workspaceRoot = path.join(root, 'workspaces', profileId)
  const paths = {
    profileDir: path.join(workspaceRoot, 'profile'),
    cacheDir: path.join(workspaceRoot, 'cache'),
    downloadsDir: path.join(workspaceRoot, 'downloads'),
    extensionsDir: path.join(workspaceRoot, 'extensions'),
    metaDir: path.join(workspaceRoot, 'meta'),
  }
  for (const targetPath of Object.values(paths)) {
    mkdirSync(targetPath, { recursive: true })
  }
  writeFileSync(path.join(paths.profileDir, 'storageState.json'), JSON.stringify({ cookies: [] }), 'utf8')

  const fingerprint = createDefaultFingerprint()
  fingerprint.runtimeMetadata.lastStorageStateVersion = 4
  fingerprint.runtimeMetadata.lastStorageStateSyncedAt = '2026-04-05T00:00:00.000Z'
  fingerprint.runtimeMetadata.lastStorageStateDeviceId = 'device-bundle'

  const payload = createProfilePayload(
    {
      id: profileId,
      name: `Profile ${profileId}`,
      proxyId: null,
      groupName: 'Group',
      tags: [],
      notes: '',
      fingerprintConfig: fingerprint,
      workspace: normalizeWorkspaceDescriptor(
        {
          migrationState: 'completed',
          migrationCheckpoints: [{ name: 'migration_completed', completedAt: '2026-04-05T00:00:00.000Z' }],
          templateBinding: {
            templateId: 'template-1',
            templateRevision: 'rev-1',
            templateFingerprintHash: '',
          },
          paths,
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
    status: 'stopped',
    lastStartedAt: null,
    createdAt: '2026-04-05T00:00:00.000Z',
    updatedAt: '2026-04-05T00:00:00.000Z',
  }
}

test('buildExportBundleV2 includes workspace snapshots and manifest entries', async () => {
  const profile = buildProfile('bundle-export')
  await createWorkspaceSnapshot(profile, {
    snapshotId: 'snapshot-export-1',
    storageStatePath: path.join(profile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })

  const settings: SettingsPayload = { uiLanguage: 'zh-CN' }
  const database = {
    exportBundle: () =>
      ({
        version: 2,
        exportedAt: '2026-04-05T00:00:00.000Z',
        profiles: [profile],
        proxies: [],
        templates: [],
        cloudPhones: [],
        settings,
      }) satisfies ExportBundle,
    listProfiles: () => [profile],
    getSettings: () => settings,
  } as const

  const bundle = await buildExportBundleV2(database as never)
  assert.equal(bundle.version, 2)
  assert.equal(bundle.workspaceSnapshots?.length, 1)
  assert.equal(bundle.workspaceManifest?.entries[0]?.profileId, profile.id)
  assert.equal(bundle.workspaceManifest?.entries[0]?.snapshotCount, 1)
  assert.equal(bundle.settings?.uiLanguage, 'zh-CN')
})

test('importWorkspaceSnapshotsFromBundle rewrites imported snapshot paths to current workspace root', async () => {
  const exportProfile = buildProfile('bundle-source')
  const snapshot = await createWorkspaceSnapshot(exportProfile, {
    snapshotId: 'snapshot-import-1',
    storageStatePath: path.join(exportProfile.workspace!.paths.profileDir, 'storageState.json'),
    storageStateSource: 'local-disk',
  })

  const importUserDataDir = mkdtempSync(path.join(os.tmpdir(), 'duokai-import-target-'))
  let importedProfile = buildProfile('bundle-target', importUserDataDir)
  const fakeApp = {
    getPath(name: string) {
      assert.equal(name, 'userData')
      return importUserDataDir
    },
  }

  const result = await importWorkspaceSnapshotsFromBundle(
    fakeApp as never,
    {
      getProfileById(id: string) {
        return id === importedProfile.id ? importedProfile : null
      },
      updateProfile(input: ProfileRecord) {
        importedProfile = {
          ...importedProfile,
          ...input,
          workspace: input.workspace ?? importedProfile.workspace,
        }
        return importedProfile
      },
    } as never,
    {
      version: 2,
      exportedAt: '2026-04-05T00:00:00.000Z',
      profiles: [exportProfile],
      proxies: [],
      templates: [],
      cloudPhones: [],
      workspaceSnapshots: [snapshot],
    },
    {
      profilesImported: 1,
      proxiesImported: 0,
      templatesImported: 0,
      cloudPhonesImported: 0,
      workspaceSnapshotsImported: 0,
      warnings: [],
      profileIdMap: {
        [exportProfile.id]: importedProfile.id,
      },
    },
  )

  const snapshotFile = path.join(
    importUserDataDir,
    'workspaces',
    importedProfile.id,
    'meta',
    'snapshots',
    'snapshot-import-1.json',
  )
  assert.equal(result.workspaceSnapshotsImported, 1)
  assert.equal(
    importedProfile.workspace?.paths.profileDir,
    path.join(importUserDataDir, 'workspaces', importedProfile.id, 'profile'),
  )
  assert.equal(existsSync(snapshotFile), true)
  const importedSnapshot = JSON.parse(readFileSync(snapshotFile, 'utf8')) as typeof snapshot
  assert.equal(importedSnapshot.profileId, importedProfile.id)
  assert.equal(
    importedSnapshot.workspaceMetadata.paths.profileDir,
    path.join(importUserDataDir, 'workspaces', importedProfile.id, 'profile'),
  )
  assert.equal(
    importedSnapshot.directoryManifest.find((entry) => entry.key === 'downloadsDir')?.path,
    path.join(importUserDataDir, 'workspaces', importedProfile.id, 'downloads'),
  )
})
