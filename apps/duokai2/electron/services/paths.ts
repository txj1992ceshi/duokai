import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { App } from 'electron'
import type {
  ProfileRecord,
  WorkspaceDescriptor,
  WorkspaceMigrationCheckpointName,
  WorkspacePaths,
} from '../../src/shared/types'

export interface ProfileDirectoryInfoPayload {
  appDataDir: string
  profilesDir: string
  workspacesDir: string
}

type PersistWorkspace = (workspace: WorkspaceDescriptor) => void

type MigrationStateFile = {
  profileId: string
  migrationState: WorkspaceDescriptor['migrationState']
  checkpoints: WorkspaceDescriptor['migrationCheckpoints']
  updatedAt: string
}

const CHECKPOINT_SEQUENCE: WorkspaceMigrationCheckpointName[] = [
  'legacy_profile_detected',
  'workspace_meta_initialized',
  'directory_layout_prepared',
  'path_mapping_persisted',
  'template_binding_resolved',
  'consistency_baseline_written',
  'migration_completed',
]

function isDirectory(targetPath: string): boolean {
  try {
    return statSync(targetPath).isDirectory()
  } catch {
    return false
  }
}

function writeMigrationStateFile(metaDir: string, workspace: WorkspaceDescriptor): void {
  mkdirSync(metaDir, { recursive: true })
  const payload: MigrationStateFile = {
    profileId: workspace.identityProfileId,
    migrationState: workspace.migrationState,
    checkpoints: workspace.migrationCheckpoints,
    updatedAt: new Date().toISOString(),
  }
  writeFileSync(path.join(metaDir, 'migration-state.json'), JSON.stringify(payload, null, 2), 'utf8')
}

function readMigrationStateFile(metaDir: string): MigrationStateFile | null {
  try {
    return JSON.parse(readFileSync(path.join(metaDir, 'migration-state.json'), 'utf8')) as MigrationStateFile
  } catch {
    return null
  }
}

function withCheckpoint(
  workspace: WorkspaceDescriptor,
  checkpoint: WorkspaceMigrationCheckpointName,
): WorkspaceDescriptor {
  if (workspace.migrationCheckpoints.some((item) => item.name === checkpoint)) {
    return workspace
  }
  return {
    ...workspace,
    migrationCheckpoints: [
      ...workspace.migrationCheckpoints,
      { name: checkpoint, completedAt: new Date().toISOString() },
    ],
  }
}

function markMigrationState(
  workspace: WorkspaceDescriptor,
  state: WorkspaceDescriptor['migrationState'],
): WorkspaceDescriptor {
  return {
    ...workspace,
    migrationState: state,
  }
}

export function getProfileDirectoryInfo(app: App): ProfileDirectoryInfoPayload {
  const appDataDir = app.getPath('userData')
  return {
    appDataDir,
    profilesDir: path.join(appDataDir, 'profiles'),
    workspacesDir: path.join(appDataDir, 'workspaces'),
  }
}

export function ensureProfileDirectory(profilesDir: string): void {
  mkdirSync(profilesDir, { recursive: true })
}

export function resolveWorkspacePaths(app: App, profileId: string): WorkspacePaths {
  const { workspacesDir } = getProfileDirectoryInfo(app)
  const root = path.join(workspacesDir, profileId)
  return {
    profileDir: path.join(root, 'profile'),
    cacheDir: path.join(root, 'cache'),
    downloadsDir: path.join(root, 'downloads'),
    extensionsDir: path.join(root, 'extensions'),
    metaDir: path.join(root, 'meta'),
  }
}

export function getProfilePath(app: App, profileId: string): string {
  return resolveWorkspacePaths(app, profileId).profileDir
}

export function ensureWorkspaceLayoutForProfile(
  app: App,
  profile: ProfileRecord,
  persistWorkspace: PersistWorkspace,
): WorkspaceDescriptor {
  const directoryInfo = getProfileDirectoryInfo(app)
  ensureProfileDirectory(directoryInfo.profilesDir)
  mkdirSync(directoryInfo.workspacesDir, { recursive: true })

  let workspace = {
    ...profile.workspace!,
    paths: resolveWorkspacePaths(app, profile.id),
  }

  const legacyProfileDir = path.join(directoryInfo.profilesDir, profile.id)
  const workspacePaths = workspace.paths
  const existingStateFile = readMigrationStateFile(workspacePaths.metaDir)

  if (existingStateFile && existingStateFile.checkpoints.length > workspace.migrationCheckpoints.length) {
    workspace = {
      ...workspace,
      migrationState: existingStateFile.migrationState,
      migrationCheckpoints: existingStateFile.checkpoints,
    }
  }

  if (workspace.migrationState === 'completed') {
    for (const targetPath of Object.values(workspacePaths)) {
      mkdirSync(targetPath, { recursive: true })
    }
    writeMigrationStateFile(workspacePaths.metaDir, workspace)
    return workspace
  }

  workspace = markMigrationState(workspace, 'in_progress')

  try {
    if (existsSync(legacyProfileDir)) {
      workspace = withCheckpoint(workspace, 'legacy_profile_detected')
    }

    mkdirSync(workspacePaths.metaDir, { recursive: true })
    workspace = withCheckpoint(workspace, 'workspace_meta_initialized')
    writeMigrationStateFile(workspacePaths.metaDir, workspace)
    persistWorkspace(workspace)

    mkdirSync(path.dirname(workspacePaths.profileDir), { recursive: true })
    mkdirSync(workspacePaths.cacheDir, { recursive: true })
    mkdirSync(workspacePaths.downloadsDir, { recursive: true })
    mkdirSync(workspacePaths.extensionsDir, { recursive: true })
    mkdirSync(workspacePaths.metaDir, { recursive: true })

    if (existsSync(legacyProfileDir) && !existsSync(workspacePaths.profileDir)) {
      renameSync(legacyProfileDir, workspacePaths.profileDir)
    } else if (!existsSync(workspacePaths.profileDir)) {
      mkdirSync(workspacePaths.profileDir, { recursive: true })
    } else if (existsSync(legacyProfileDir) && isDirectory(legacyProfileDir) && isDirectory(workspacePaths.profileDir)) {
      workspace = markMigrationState(workspace, 'failed_manual')
      writeMigrationStateFile(workspacePaths.metaDir, workspace)
      persistWorkspace(workspace)
      throw new Error(`Legacy profile directory still exists after workspace profile directory was created for ${profile.id}`)
    }

    workspace = withCheckpoint(workspace, 'directory_layout_prepared')
    writeMigrationStateFile(workspacePaths.metaDir, workspace)
    persistWorkspace(workspace)

    workspace = {
      ...workspace,
      paths: workspacePaths,
    }
    workspace = withCheckpoint(workspace, 'path_mapping_persisted')
    writeMigrationStateFile(workspacePaths.metaDir, workspace)
    persistWorkspace(workspace)

    workspace = withCheckpoint(workspace, 'template_binding_resolved')
    writeMigrationStateFile(workspacePaths.metaDir, workspace)
    persistWorkspace(workspace)

    workspace = withCheckpoint(workspace, 'consistency_baseline_written')
    writeMigrationStateFile(workspacePaths.metaDir, workspace)
    persistWorkspace(workspace)

    workspace = withCheckpoint(workspace, 'migration_completed')
    workspace = markMigrationState(workspace, 'completed')
    writeMigrationStateFile(workspacePaths.metaDir, workspace)
    persistWorkspace(workspace)
    return workspace
  } catch (error) {
    if (workspace.migrationState !== 'failed_manual') {
      workspace = markMigrationState(workspace, 'failed_retriable')
      writeMigrationStateFile(workspacePaths.metaDir, workspace)
      persistWorkspace(workspace)
    }
    throw error
  }
}

export function listWorkspaceMigrationCheckpoints(): WorkspaceMigrationCheckpointName[] {
  return [...CHECKPOINT_SEQUENCE]
}
