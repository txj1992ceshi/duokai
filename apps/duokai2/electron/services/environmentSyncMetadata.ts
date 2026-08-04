import type { ProfileRecord } from '../../src/shared/types'

type EnvironmentSyncStatus =
  ProfileRecord['fingerprintConfig']['runtimeMetadata']['lastEnvironmentSyncStatus']

export interface EnvironmentSyncMetadataState {
  status: EnvironmentSyncStatus
  message: string
  syncedAt: string
}

export interface EnvironmentSyncMetadataPatch {
  status: EnvironmentSyncStatus
  message: string
  syncedAt?: string
}

export interface ResolvedEnvironmentSyncMetadataUpdate {
  changed: boolean
  next: EnvironmentSyncMetadataState
}

export function resolveEnvironmentSyncMetadataUpdate(
  current: EnvironmentSyncMetadataState,
  patch: EnvironmentSyncMetadataPatch,
  now: string,
): ResolvedEnvironmentSyncMetadataUpdate {
  const statusChanged = current.status !== patch.status
  const messageChanged = current.message !== patch.message
  const explicitTimestamp = patch.syncedAt !== undefined
  const nextSyncedAt = explicitTimestamp
    ? String(patch.syncedAt || '')
    : statusChanged || messageChanged
      ? now
      : current.syncedAt

  return {
    changed:
      statusChanged ||
      messageChanged ||
      (explicitTimestamp && current.syncedAt !== nextSyncedAt),
    next: {
      status: patch.status,
      message: patch.message,
      syncedAt: nextSyncedAt,
    },
  }
}
