import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeWorkspaceDescriptor } from './factories'
import type {
  BrowserStorageState,
  ProfileRecord,
  WorkspaceDescriptor,
  WorkspacePaths,
  WorkspaceSnapshotSummary,
  WorkspaceSnapshotDirectoryEntry,
  WorkspaceSnapshotRecord,
  WorkspaceSnapshotStorageStateMetadata,
} from '../../src/shared/types'

const SNAPSHOT_SCHEMA_VERSION = 1

function getSnapshotsDirectory(workspace: WorkspaceDescriptor): string {
  return path.join(workspace.paths.metaDir, 'snapshots')
}

function getSnapshotFilePath(workspace: WorkspaceDescriptor, snapshotId: string): string {
  return path.join(getSnapshotsDirectory(workspace), `${snapshotId}.json`)
}

function hashStructuredPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function summarizeDirectory(
  key: keyof WorkspacePaths,
  targetPath: string,
): Promise<WorkspaceSnapshotDirectoryEntry> {
  try {
    const stats = await stat(targetPath)
    if (!stats.isDirectory()) {
      return {
        key,
        path: targetPath,
        exists: true,
        entryCount: 0,
        fileCount: 1,
        directoryCount: 0,
        totalBytes: stats.size,
        latestModifiedAt: stats.mtime.toISOString(),
      }
    }

    const entries = await readdir(targetPath, { withFileTypes: true })
    let fileCount = 0
    let directoryCount = 0
    let totalBytes = 0
    let latestModifiedAt = stats.mtime.toISOString()

    for (const entry of entries) {
      const entryPath = path.join(targetPath, entry.name)
      try {
        const entryStats = await stat(entryPath)
        if (entry.isDirectory()) {
          directoryCount += 1
        } else {
          fileCount += 1
          totalBytes += entryStats.size
        }
        if (entryStats.mtime.toISOString() > latestModifiedAt) {
          latestModifiedAt = entryStats.mtime.toISOString()
        }
      } catch {
        // Ignore transient file errors in lightweight manifest generation.
      }
    }

    return {
      key,
      path: targetPath,
      exists: true,
      entryCount: entries.length,
      fileCount,
      directoryCount,
      totalBytes,
      latestModifiedAt,
    }
  } catch {
    return {
      key,
      path: targetPath,
      exists: false,
      entryCount: 0,
      fileCount: 0,
      directoryCount: 0,
      totalBytes: 0,
      latestModifiedAt: '',
    }
  }
}

async function buildDirectoryManifest(paths: WorkspacePaths): Promise<WorkspaceSnapshotDirectoryEntry[]> {
  return Promise.all(
    (Object.keys(paths) as Array<keyof WorkspacePaths>).map((key) => summarizeDirectory(key, paths[key])),
  )
}

async function readStorageStateMetadata(
  storageStatePath: string,
  runtimeMetadata: ProfileRecord['fingerprintConfig']['runtimeMetadata'],
  source: string,
): Promise<WorkspaceSnapshotStorageStateMetadata> {
  try {
    const raw = await readFile(storageStatePath, 'utf8')
    const stateJson = JSON.parse(raw) as BrowserStorageState
    return {
      version: Number(runtimeMetadata.lastStorageStateVersion || 0),
      stateHash: hashStructuredPayload(stateJson),
      updatedAt: runtimeMetadata.lastStorageStateSyncedAt || new Date().toISOString(),
      deviceId: runtimeMetadata.lastStorageStateDeviceId || '',
      source,
      stateJson,
    }
  } catch {
    return {
      version: Number(runtimeMetadata.lastStorageStateVersion || 0),
      stateHash: '',
      updatedAt: runtimeMetadata.lastStorageStateSyncedAt || '',
      deviceId: runtimeMetadata.lastStorageStateDeviceId || '',
      source,
      stateJson: null,
    }
  }
}

async function readWorkspaceSnapshotFromDisk(
  workspace: WorkspaceDescriptor,
  snapshotId: string,
): Promise<WorkspaceSnapshotRecord | null> {
  try {
    const content = await readFile(getSnapshotFilePath(workspace, snapshotId), 'utf8')
    return JSON.parse(content) as WorkspaceSnapshotRecord
  } catch {
    return null
  }
}

export async function saveWorkspaceSnapshot(
  profile: ProfileRecord,
  snapshot: WorkspaceSnapshotRecord,
): Promise<WorkspaceSnapshotRecord> {
  if (!profile.workspace) {
    throw new Error(`Workspace is missing for profile ${profile.id}`)
  }
  await mkdir(getSnapshotsDirectory(profile.workspace), { recursive: true })
  await writeFile(
    getSnapshotFilePath(profile.workspace, snapshot.snapshotId),
    JSON.stringify(snapshot, null, 2),
    'utf8',
  )
  return snapshot
}

export async function createWorkspaceSnapshot(
  profile: ProfileRecord,
  options: {
    snapshotId?: string
    storageStatePath: string
    storageStateSource: string
  },
): Promise<WorkspaceSnapshotRecord> {
  if (!profile.workspace) {
    throw new Error(`Workspace is missing for profile ${profile.id}`)
  }
  if (profile.workspace.migrationState !== 'completed') {
    throw new Error(`Workspace migration is incomplete for profile ${profile.id}`)
  }

  const snapshotId = options.snapshotId || randomUUID()
  const createdAt = new Date().toISOString()
  const storageState = await readStorageStateMetadata(
    options.storageStatePath,
    profile.fingerprintConfig.runtimeMetadata,
    options.storageStateSource,
  )
  const directoryManifest = await buildDirectoryManifest(profile.workspace.paths)
  const manifest = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    createdBy: 'desktop',
    workspaceIdentityProfileId: profile.workspace.identityProfileId,
    templateFingerprintHash: profile.workspace.templateBinding.templateFingerprintHash,
    templateRevision: profile.workspace.templateBinding.templateRevision,
    storageStateVersion: storageState.version,
    storageStateHash: storageState.stateHash,
    workspaceStateHash: hashStructuredPayload({
      resolvedEnvironment: profile.workspace.resolvedEnvironment,
      paths: profile.workspace.paths,
      healthSummary: profile.workspace.healthSummary,
      consistencySummary: profile.workspace.consistencySummary,
    }),
  }

  const snapshot: WorkspaceSnapshotRecord = {
    snapshotId,
    profileId: profile.id,
    templateRevision: profile.workspace.templateBinding.templateRevision,
    templateFingerprintHash: profile.workspace.templateBinding.templateFingerprintHash,
    manifest,
    workspaceMetadata: profile.workspace,
    storageState,
    directoryManifest,
    healthSummary: profile.workspace.healthSummary,
    consistencySummary: profile.workspace.consistencySummary,
    createdAt,
    updatedAt: createdAt,
  }

  return saveWorkspaceSnapshot(profile, snapshot)
}

export async function listWorkspaceSnapshots(profile: ProfileRecord): Promise<WorkspaceSnapshotRecord[]> {
  if (!profile.workspace) {
    return []
  }
  try {
    const snapshotDir = getSnapshotsDirectory(profile.workspace)
    const files = await readdir(snapshotDir)
    const snapshots = await Promise.all(
      files
        .filter((file) => file.endsWith('.json'))
        .map(async (file) => {
          const content = await readFile(path.join(snapshotDir, file), 'utf8')
          return JSON.parse(content) as WorkspaceSnapshotRecord
        }),
    )
    return snapshots
      .filter((snapshot) => snapshot.profileId === profile.id)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
  } catch {
    return []
  }
}

export async function updateWorkspaceSnapshotValidation(
  profile: ProfileRecord,
  snapshotId: string,
  validatedAt: string,
): Promise<WorkspaceSnapshotRecord | null> {
  if (!profile.workspace) {
    return null
  }
  try {
    const snapshot = await readWorkspaceSnapshotFromDisk(profile.workspace, snapshotId)
    if (!snapshot) {
      return null
    }
    const nextSnapshot: WorkspaceSnapshotRecord = {
      ...snapshot,
      validatedStartAt: validatedAt,
      updatedAt: validatedAt,
    }
    return saveWorkspaceSnapshot(profile, nextSnapshot)
  } catch {
    return null
  }
}

export async function evaluateLastKnownGoodSnapshot(
  profile: ProfileRecord,
  options: {
    storageState: WorkspaceSnapshotStorageStateMetadata
    fetchRemoteSnapshot?: (profileId: string, snapshotId: string) => Promise<WorkspaceSnapshotRecord | null>
  },
): Promise<{
  status: 'absent' | 'valid' | 'invalid'
  reason: string
  snapshot: WorkspaceSnapshotRecord | null
}> {
  const summary = profile.workspace?.snapshotSummary
  if (!profile.workspace || !summary?.lastKnownGoodSnapshotId) {
    return {
      status: 'absent',
      reason: '',
      snapshot: null,
    }
  }
  if (profile.workspace.healthSummary.status === 'broken') {
    return {
      status: 'invalid',
      reason: 'health:broken',
      snapshot: null,
    }
  }
  if (profile.workspace.consistencySummary.status === 'block') {
    return {
      status: 'invalid',
      reason: 'consistency:block',
      snapshot: null,
    }
  }

  let snapshot = await getWorkspaceSnapshotById(profile, summary.lastKnownGoodSnapshotId)
  if (!snapshot && options.fetchRemoteSnapshot) {
    snapshot = await options.fetchRemoteSnapshot(profile.id, summary.lastKnownGoodSnapshotId)
    if (snapshot) {
      await saveWorkspaceSnapshot(profile, snapshot)
    }
  }
  if (!snapshot) {
    return {
      status: 'invalid',
      reason: 'snapshot:missing',
      snapshot: null,
    }
  }
  if (!snapshot.validatedStartAt) {
    return {
      status: 'invalid',
      reason: 'snapshot:not_validated',
      snapshot,
    }
  }
  if (!doesWorkspaceSnapshotMatchProfile(snapshot, profile, options.storageState)) {
    return {
      status: 'invalid',
      reason: 'snapshot:drifted',
      snapshot,
    }
  }
  return {
    status: 'valid',
    reason: '',
    snapshot,
  }
}

export function applyLastKnownGoodAssessment(
  summary: WorkspaceSnapshotSummary,
  assessment:
    | {
        status: 'absent'
        reason: string
      }
    | {
        status: 'valid'
        reason: string
      }
    | {
        status: 'invalid'
        reason: string
        invalidatedAt: string
      },
): WorkspaceSnapshotSummary {
  if (assessment.status === 'absent') {
    return {
      ...summary,
      lastKnownGoodStatus: 'unknown',
      lastKnownGoodInvalidatedAt: '',
      lastKnownGoodInvalidationReason: '',
    }
  }
  if (assessment.status === 'valid') {
    return {
      ...summary,
      lastKnownGoodStatus: summary.lastKnownGoodStatus,
      lastKnownGoodInvalidatedAt:
        summary.lastKnownGoodStatus === 'valid' ? '' : summary.lastKnownGoodInvalidatedAt,
      lastKnownGoodInvalidationReason:
        summary.lastKnownGoodStatus === 'valid' ? '' : summary.lastKnownGoodInvalidationReason,
    }
  }
  return {
    ...summary,
    lastKnownGoodStatus: 'invalid',
    lastKnownGoodInvalidatedAt: summary.lastKnownGoodInvalidatedAt || assessment.invalidatedAt,
    lastKnownGoodInvalidationReason: assessment.reason,
  }
}

export async function getWorkspaceSnapshotById(
  profile: ProfileRecord,
  snapshotId: string,
): Promise<WorkspaceSnapshotRecord | null> {
  if (!profile.workspace) {
    return null
  }
  return readWorkspaceSnapshotFromDisk(profile.workspace, snapshotId)
}

export async function restoreWorkspaceSnapshot(
  profile: ProfileRecord,
  snapshotId: string,
  options: {
    storageStatePath: string
    recoveryReason: string
    fetchRemoteSnapshot?: (profileId: string, snapshotId: string) => Promise<WorkspaceSnapshotRecord | null>
  },
): Promise<{ profile: ProfileRecord; snapshot: WorkspaceSnapshotRecord; gateStatus: 'pass' | 'warn' | 'block' }> {
  if (!profile.workspace) {
    throw new Error(`Workspace is missing for profile ${profile.id}`)
  }

  let snapshot = await getWorkspaceSnapshotById(profile, snapshotId)
  if (!snapshot && options.fetchRemoteSnapshot) {
    snapshot = await options.fetchRemoteSnapshot(profile.id, snapshotId)
    if (snapshot) {
      await saveWorkspaceSnapshot(profile, snapshot)
    }
  }
  if (!snapshot) {
    throw new Error(`Workspace snapshot ${snapshotId} was not found for profile ${profile.id}`)
  }
  if (snapshot.profileId !== profile.id) {
    throw new Error(`Workspace snapshot ${snapshotId} does not belong to profile ${profile.id}`)
  }
  if (!snapshot.workspaceMetadata) {
    throw new Error(`Workspace snapshot ${snapshotId} is missing workspace metadata`)
  }
  if (!snapshot.templateRevision || !snapshot.templateFingerprintHash) {
    throw new Error(`Workspace snapshot ${snapshotId} is missing template binding data`)
  }
  if (snapshot.storageState.stateJson === undefined) {
    throw new Error(`Workspace snapshot ${snapshotId} is not restorable in v1 because stateJson is missing`)
  }

  await writeFile(options.storageStatePath, JSON.stringify(snapshot.storageState.stateJson ?? {}, null, 2), 'utf8')

  const restoredWorkspace = normalizeWorkspaceDescriptor(
    {
      ...snapshot.workspaceMetadata,
      identityProfileId: profile.id,
      snapshotSummary: {
        ...snapshot.workspaceMetadata.snapshotSummary,
        lastSnapshotId: snapshot.snapshotId,
        lastSnapshotAt: snapshot.updatedAt || snapshot.createdAt,
      },
      recovery: {
        ...snapshot.workspaceMetadata.recovery,
        lastRecoveryAt: new Date().toISOString(),
        lastRecoveryReason: options.recoveryReason,
      },
    },
    profile.id,
    profile.fingerprintConfig,
  )

  const gateStatus: 'pass' | 'warn' | 'block' =
    restoredWorkspace.healthSummary.status === 'broken'
      ? 'block'
      : restoredWorkspace.consistencySummary.status === 'block'
        ? 'block'
        : restoredWorkspace.healthSummary.status === 'warning' ||
            restoredWorkspace.consistencySummary.status === 'warn'
          ? 'warn'
          : 'pass'

  return {
    profile: {
      ...profile,
      workspace: restoredWorkspace,
    },
    snapshot,
    gateStatus,
  }
}

export async function rollbackWorkspaceToLastKnownGood(
  profile: ProfileRecord,
  options: {
    storageStatePath: string
    fetchRemoteSnapshot?: (profileId: string, snapshotId: string) => Promise<WorkspaceSnapshotRecord | null>
  },
): Promise<{ profile: ProfileRecord; snapshot: WorkspaceSnapshotRecord; gateStatus: 'pass' | 'warn' | 'block' }> {
  if (profile.workspace?.snapshotSummary.lastKnownGoodStatus === 'invalid') {
    throw new Error(`Workspace ${profile.id} last known good snapshot is invalidated`)
  }
  const snapshotId = profile.workspace?.snapshotSummary.lastKnownGoodSnapshotId || ''
  if (!snapshotId) {
    throw new Error(`Workspace ${profile.id} does not have a last known good snapshot`)
  }
  return restoreWorkspaceSnapshot(profile, snapshotId, {
    storageStatePath: options.storageStatePath,
    recoveryReason: `rollback:last_known_good:${snapshotId}`,
    fetchRemoteSnapshot: options.fetchRemoteSnapshot,
  })
}

export function doesWorkspaceSnapshotMatchProfile(
  snapshot: WorkspaceSnapshotRecord,
  profile: ProfileRecord,
  storageState: WorkspaceSnapshotStorageStateMetadata,
): boolean {
  if (!profile.workspace) {
    return false
  }
  return (
    snapshot.profileId === profile.id &&
    snapshot.templateFingerprintHash === profile.workspace.templateBinding.templateFingerprintHash &&
    snapshot.templateRevision === profile.workspace.templateBinding.templateRevision &&
    Number(snapshot.storageState.version || 0) === Number(storageState.version || 0) &&
    String(snapshot.storageState.stateHash || '') === String(storageState.stateHash || '') &&
    String(snapshot.manifest.workspaceStateHash || '') ===
      hashStructuredPayload({
        resolvedEnvironment: profile.workspace.resolvedEnvironment,
        paths: profile.workspace.paths,
        healthSummary: profile.workspace.healthSummary,
        consistencySummary: profile.workspace.consistencySummary,
      })
  )
}
