import { isDeepStrictEqual } from 'node:util'

import type {
  DeviceProfile,
  EnvironmentPurpose,
  FingerprintConfig,
  ProfileRecord,
} from '../../src/shared/types'
import {
  createDeviceProfileFromFingerprint,
  DEFAULT_ENVIRONMENT_PURPOSE,
} from './deviceProfile.ts'
import {
  normalizeFingerprintConfig,
  normalizeWorkspaceDescriptor,
} from './factories.ts'

export interface ProfileMetadataBackfillRow {
  id: string
  fingerprint_config: string
  created_at: string
  environment_purpose: string | null
  device_profile: string | null
  workspace_json: string | null
}

export interface ProfileMetadataBackfillUpdate {
  environmentPurpose: EnvironmentPurpose
  deviceProfileJson: string
  workspaceJson: string
}

function withoutDeviceProfileTimestamp(profile: DeviceProfile): Omit<DeviceProfile, 'updatedAt'> {
  const stable = { ...profile }
  Reflect.deleteProperty(stable, 'updatedAt')
  return stable
}

function parseExistingDeviceProfile(value: string | null): DeviceProfile | null {
  if (!value || !value.trim()) {
    return null
  }
  return JSON.parse(value) as DeviceProfile
}

function parseExistingWorkspace(
  value: string | null,
): Partial<ProfileRecord['workspace']> | null {
  if (!value || !value.trim()) {
    return null
  }
  return JSON.parse(value) as Partial<ProfileRecord['workspace']>
}

export function buildProfileMetadataBackfillUpdate(
  row: ProfileMetadataBackfillRow,
): ProfileMetadataBackfillUpdate | null {
  const fingerprintConfig = normalizeFingerprintConfig(
    JSON.parse(row.fingerprint_config) as FingerprintConfig,
  )
  const environmentPurpose =
    (row.environment_purpose as EnvironmentPurpose | null) || DEFAULT_ENVIRONMENT_PURPOSE

  const existingDeviceProfile = parseExistingDeviceProfile(row.device_profile)
  const normalizedDeviceProfile = createDeviceProfileFromFingerprint(
    fingerprintConfig,
    row.created_at,
    existingDeviceProfile,
  )
  const deviceProfileUnchanged = Boolean(
    existingDeviceProfile &&
      isDeepStrictEqual(
        withoutDeviceProfileTimestamp(existingDeviceProfile),
        withoutDeviceProfileTimestamp(normalizedDeviceProfile),
      ),
  )
  const deviceProfileJson = deviceProfileUnchanged
    ? (row.device_profile as string)
    : JSON.stringify(normalizedDeviceProfile)

  const existingWorkspace = parseExistingWorkspace(row.workspace_json)
  const normalizedWorkspace = normalizeWorkspaceDescriptor(
    existingWorkspace,
    row.id,
    fingerprintConfig,
  )
  const workspaceUnchanged = Boolean(
    existingWorkspace && isDeepStrictEqual(existingWorkspace, normalizedWorkspace),
  )
  const workspaceJson = workspaceUnchanged
    ? (row.workspace_json as string)
    : JSON.stringify(normalizedWorkspace)

  if (
    row.environment_purpose === environmentPurpose &&
    deviceProfileUnchanged &&
    workspaceUnchanged
  ) {
    return null
  }

  return {
    environmentPurpose,
    deviceProfileJson,
    workspaceJson,
  }
}
