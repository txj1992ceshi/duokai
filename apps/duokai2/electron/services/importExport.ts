import type { App } from 'electron'
import { normalizeWorkspaceDescriptor } from './factories'
import { resolveWorkspacePaths } from './paths'
import {
  listWorkspaceSnapshots,
  saveWorkspaceSnapshot,
} from './workspaceSnapshots'
import type {
  ExportBundle,
  FingerprintConfig,
  ImportResult,
  ProfileRecord,
  WorkspaceDescriptor,
  WorkspaceSnapshotRecord,
} from '../../src/shared/types'
import type { DatabaseService } from './database'

type AppPathProvider = Pick<App, 'getPath'>

function rewriteWorkspaceForImport(
  app: AppPathProvider,
  profileId: string,
  fingerprintConfig: FingerprintConfig,
  workspace: WorkspaceDescriptor | null | undefined,
): WorkspaceDescriptor {
  const resolvedPaths = resolveWorkspacePaths(app as App, profileId)
  const nextWorkspace: Partial<WorkspaceDescriptor> = {
    ...(workspace || {}),
    identityProfileId: profileId,
    paths: resolvedPaths,
  }
  if (workspace?.resolvedEnvironment) {
    nextWorkspace.resolvedEnvironment = {
      ...workspace.resolvedEnvironment,
      downloadsDir: resolvedPaths.downloadsDir,
    }
  }
  return normalizeWorkspaceDescriptor(
    nextWorkspace,
    profileId,
    fingerprintConfig,
  )
}

function rewriteSnapshotForImport(
  app: AppPathProvider,
  profile: ProfileRecord,
  snapshot: WorkspaceSnapshotRecord,
): WorkspaceSnapshotRecord {
  const workspaceMetadata = rewriteWorkspaceForImport(
    app,
    profile.id,
    profile.fingerprintConfig,
    snapshot.workspaceMetadata,
  )

  return {
    ...snapshot,
    profileId: profile.id,
    workspaceMetadata,
    directoryManifest: snapshot.directoryManifest.map((entry) => ({
      ...entry,
      path: workspaceMetadata.paths[entry.key],
    })),
    manifest: {
      ...snapshot.manifest,
      workspaceIdentityProfileId: profile.id,
      importedFromBundleVersion: 2,
    },
  }
}

function buildWorkspaceManifest(
  profiles: ProfileRecord[],
  workspaceSnapshots: WorkspaceSnapshotRecord[],
): ExportBundle['workspaceManifest'] {
  return {
    schemaVersion: 1,
    pathRewriteStrategy: 'workspace-resolver-v1',
    entries: profiles
      .filter((profile): profile is ProfileRecord & { workspace: WorkspaceDescriptor } => Boolean(profile.workspace))
      .map((profile) => ({
        profileId: profile.id,
        identityProfileId: profile.workspace.identityProfileId,
        templateFingerprintHash: profile.workspace.templateBinding.templateFingerprintHash,
        snapshotCount: workspaceSnapshots.filter((snapshot) => snapshot.profileId === profile.id).length,
        exportedPaths: profile.workspace.paths,
        lastSnapshotId: profile.workspace.snapshotSummary.lastSnapshotId,
        lastKnownGoodSnapshotId: profile.workspace.snapshotSummary.lastKnownGoodSnapshotId,
      })),
  }
}

export async function buildExportBundleV2(
  database: DatabaseService,
): Promise<ExportBundle> {
  const bundle = database.exportBundle()
  const profiles = database.listProfiles()
  const snapshotGroups = await Promise.all(profiles.map((profile) => listWorkspaceSnapshots(profile)))
  const workspaceSnapshots = snapshotGroups.flat()

  return {
    ...bundle,
    version: 2,
    settings: bundle.settings ?? database.getSettings(),
    workspaceSnapshots,
    workspaceManifest: buildWorkspaceManifest(profiles, workspaceSnapshots),
  }
}

export async function importWorkspaceSnapshotsFromBundle(
  app: AppPathProvider,
  database: DatabaseService,
  bundle: ExportBundle,
  importResult: ImportResult,
): Promise<ImportResult> {
  const workspaceSnapshots = Array.isArray(bundle.workspaceSnapshots) ? bundle.workspaceSnapshots : []
  const sourceProfiles = Array.isArray(bundle.profiles) ? bundle.profiles : []
  const warnings = [...importResult.warnings]

  for (const sourceProfile of sourceProfiles) {
    const targetProfileId = importResult.profileIdMap?.[sourceProfile.id] || sourceProfile.id
    const importedProfile = database.getProfileById(targetProfileId)
    if (!importedProfile) {
      continue
    }
    const rewrittenWorkspace = rewriteWorkspaceForImport(
      app,
      importedProfile.id,
      importedProfile.fingerprintConfig,
      sourceProfile.workspace ?? importedProfile.workspace,
    )
    database.updateProfile({
      id: importedProfile.id,
      name: importedProfile.name,
      proxyId: importedProfile.proxyId,
      groupName: importedProfile.groupName,
      tags: importedProfile.tags,
      notes: importedProfile.notes,
      environmentPurpose: importedProfile.environmentPurpose,
      deviceProfile: importedProfile.deviceProfile,
      fingerprintConfig: importedProfile.fingerprintConfig,
      workspace: rewrittenWorkspace,
    })
  }

  if (workspaceSnapshots.length === 0) {
    return {
      ...importResult,
      warnings,
    }
  }
  let workspaceSnapshotsImported = 0

  for (const snapshot of workspaceSnapshots) {
    const targetProfileId = importResult.profileIdMap?.[snapshot.profileId] || snapshot.profileId
    const targetProfile = database.getProfileById(targetProfileId)
    if (!targetProfile) {
      warnings.push(`快照 ${snapshot.snapshotId} 对应的环境 ${snapshot.profileId} 未导入，已跳过`)
      continue
    }
    const rewrittenSnapshot = rewriteSnapshotForImport(app, targetProfile, snapshot)
    await saveWorkspaceSnapshot(targetProfile, rewrittenSnapshot)
    workspaceSnapshotsImported += 1
  }

  return {
    ...importResult,
    workspaceSnapshotsImported,
    warnings,
  }
}
