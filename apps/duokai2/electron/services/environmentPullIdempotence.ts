import { isDeepStrictEqual } from 'node:util'

import type {
  DeviceProfile,
  FingerprintConfig,
  ProfileRecord,
  ProfileRuntimeMetadata,
  WorkspaceDescriptor,
} from '../../src/shared/types'

const STABLE_HARDWARE_METADATA_KEYS = [
  'hardwareProfileId',
  'hardwareProfileVersion',
  'hardwareSeed',
  'hardwareProfileSource',
  'hardwareTemplateId',
  'hardwareVariantId',
  'hardwareCatalogVersion',
] as const satisfies ReadonlyArray<keyof ProfileRuntimeMetadata>

function sortedStrings(values: readonly string[] | null | undefined): string[] {
  return Array.from(new Set((values || []).map((value) => String(value)))).sort()
}

function stableHardwareMetadata(
  metadata: ProfileRuntimeMetadata | null | undefined,
): Partial<ProfileRuntimeMetadata> {
  const result: Partial<ProfileRuntimeMetadata> = {}
  for (const key of STABLE_HARDWARE_METADATA_KEYS) {
    result[key] = metadata?.[key] as never
  }
  return result
}

function semanticDeviceProfile(
  deviceProfile: DeviceProfile | null | undefined,
): Omit<DeviceProfile, 'createdAt' | 'updatedAt'> | null {
  if (!deviceProfile) {
    return null
  }
  const semantic = { ...deviceProfile }
  Reflect.deleteProperty(semantic, 'createdAt')
  Reflect.deleteProperty(semantic, 'updatedAt')
  return semantic
}

function semanticFingerprintConfig(
  fingerprintConfig: FingerprintConfig | null | undefined,
): Record<string, unknown> | null {
  if (!fingerprintConfig) {
    return null
  }
  const { runtimeMetadata, ...configuredFingerprint } = fingerprintConfig
  return {
    ...configuredFingerprint,
    runtimeMetadata: stableHardwareMetadata(runtimeMetadata),
  }
}

function portableWorkspacePaths(profileId: string): WorkspaceDescriptor['paths'] {
  const root = `workspaces/${profileId}`
  return {
    profileDir: `${root}/profile`,
    cacheDir: `${root}/cache`,
    downloadsDir: `${root}/downloads`,
    extensionsDir: `${root}/extensions`,
    metaDir: `${root}/meta`,
  }
}

function semanticWorkspace(
  workspace: WorkspaceDescriptor | null | undefined,
  profileId: string,
): Record<string, unknown> | null {
  if (!workspace) {
    return null
  }
  const paths = portableWorkspacePaths(profileId)
  return {
    identityProfileId: String(workspace.identityProfileId || profileId),
    version: Number(workspace.version || 0),
    templateBinding: {
      templateId: String(workspace.templateBinding?.templateId || ''),
      templateRevision: String(workspace.templateBinding?.templateRevision || ''),
      // The fingerprint hash is a derived receipt. Local normalization recalculates it
      // from the bound template, so remote receipt drift is not an environment change.
    },
    allowedOverrides: sortedStrings(workspace.allowedOverrides),
    blockedOverrides: sortedStrings(workspace.blockedOverrides),
    declaredOverrides: workspace.declaredOverrides || {},
    resolvedEnvironment: workspace.resolvedEnvironment
      ? {
          ...workspace.resolvedEnvironment,
          downloadsDir: paths.downloadsDir,
          launchArgs: Array.isArray(workspace.resolvedEnvironment.launchArgs)
            ? workspace.resolvedEnvironment.launchArgs.map((value) => String(value))
            : [],
        }
      : null,
    // Concrete paths are device-local. Canonical aliases preserve layout semantics
    // without treating another host's absolute paths as an environment change.
    paths,
  }
}

export function buildEnvironmentProfileSemanticProjection(
  profile: ProfileRecord,
): Record<string, unknown> {
  return {
    id: String(profile.id || ''),
    name: String(profile.name || ''),
    proxyId: profile.proxyId || null,
    groupName: String(profile.groupName || ''),
    tags: sortedStrings(profile.tags),
    notes: String(profile.notes || ''),
    environmentPurpose: profile.environmentPurpose,
    deviceProfile: semanticDeviceProfile(profile.deviceProfile),
    fingerprintConfig: semanticFingerprintConfig(profile.fingerprintConfig),
    workspace: semanticWorkspace(profile.workspace, profile.id),
  }
}

export function shouldApplyPulledEnvironmentProfile(
  localProfile: ProfileRecord | null,
  remoteProfile: ProfileRecord,
): boolean {
  if (!localProfile || localProfile.id !== remoteProfile.id) {
    return true
  }
  return !isDeepStrictEqual(
    buildEnvironmentProfileSemanticProjection(localProfile),
    buildEnvironmentProfileSemanticProjection(remoteProfile),
  )
}
