import { normalizeSubscriptionShape } from './subscription.js';

const WORKSPACE_ALLOWED_OVERRIDES = [
  'timezone',
  'browserLanguage',
  'resolution',
  'downloadsDirAlias',
  'nonCriticalLaunchArgs',
] as const;

const WORKSPACE_BLOCKED_OVERRIDES = [
  'browserFamily',
  'profileDir',
  'extensionsDirRoot',
  'webrtcHardPolicy',
  'ipv6HardPolicy',
  'browserMajorVersionRange',
] as const;

function normalizeDeclaredOverrides(input: unknown) {
  const result: Record<string, string | string[]> = {};
  if (!input || typeof input !== 'object') {
    return result;
  }
  for (const key of WORKSPACE_ALLOWED_OVERRIDES) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => String(item));
    }
  }
  return result;
}

export function normalizeWorkspacePayload(
  profileId: string,
  workspace: unknown
) {
  const source =
    workspace && typeof workspace === 'object'
      ? (workspace as Record<string, unknown>)
      : {};
  const templateBinding =
    source.templateBinding && typeof source.templateBinding === 'object'
      ? (source.templateBinding as Record<string, unknown>)
      : {};
  const legacyTemplateRevision = String(source.templateRevision || '').trim();
  const legacyTemplateFingerprintHash = String(source.templateFingerprintHash || '').trim();
  const templateRevision =
    String(templateBinding.templateRevision || legacyTemplateRevision || '').trim() || 'legacy-profile-v1';
  const templateFingerprintHash =
    String(templateBinding.templateFingerprintHash || legacyTemplateFingerprintHash || '').trim();
  const templateId = String(templateBinding.templateId || source.templateId || '').trim();
  return {
    identityProfileId: profileId,
    version: Number(source.version || 1) || 1,
    migrationState: String(source.migrationState || 'not_started').trim() || 'not_started',
    migrationCheckpoints: Array.isArray(source.migrationCheckpoints)
      ? source.migrationCheckpoints
      : [],
    templateBinding: {
      templateId,
      templateRevision,
      // Runtime consistency validation must prefer templateFingerprintHash.
      templateFingerprintHash,
    },
    allowedOverrides: [...WORKSPACE_ALLOWED_OVERRIDES],
    blockedOverrides: [...WORKSPACE_BLOCKED_OVERRIDES],
    declaredOverrides: normalizeDeclaredOverrides(source.declaredOverrides),
    resolvedEnvironment:
      source.resolvedEnvironment && typeof source.resolvedEnvironment === 'object'
        ? source.resolvedEnvironment
        : null,
    paths:
      source.paths && typeof source.paths === 'object'
        ? source.paths
        : null,
    healthSummary:
      source.healthSummary && typeof source.healthSummary === 'object'
        ? source.healthSummary
        : source.health && typeof source.health === 'object'
          ? source.health
        : null,
    consistencySummary:
      source.consistencySummary && typeof source.consistencySummary === 'object'
        ? {
            ...(source.consistencySummary as Record<string, unknown>),
            templateRevision,
            templateFingerprintHash,
          }
        : source.consistency && typeof source.consistency === 'object'
        ? {
            ...(source.consistency as Record<string, unknown>),
            templateRevision,
            templateFingerprintHash,
          }
        : {
            status: 'unknown',
            messages: [],
            checkedAt: '',
            templateRevision,
            templateFingerprintHash,
          },
    snapshotSummary:
      source.snapshotSummary && typeof source.snapshotSummary === 'object'
        ? {
            lastSnapshotId: String((source.snapshotSummary as Record<string, unknown>).lastSnapshotId || ''),
            lastSnapshotAt: String((source.snapshotSummary as Record<string, unknown>).lastSnapshotAt || ''),
            lastKnownGoodSnapshotId: String(
              (source.snapshotSummary as Record<string, unknown>).lastKnownGoodSnapshotId || '',
            ),
            lastKnownGoodSnapshotAt: String(
              (source.snapshotSummary as Record<string, unknown>).lastKnownGoodSnapshotAt || '',
            ),
            lastKnownGoodStatus:
              (source.snapshotSummary as Record<string, unknown>).lastKnownGoodStatus === 'valid' ||
              (source.snapshotSummary as Record<string, unknown>).lastKnownGoodStatus === 'invalid'
                ? (source.snapshotSummary as Record<string, unknown>).lastKnownGoodStatus
                : 'unknown',
            lastKnownGoodInvalidatedAt: String(
              (source.snapshotSummary as Record<string, unknown>).lastKnownGoodInvalidatedAt || '',
            ),
            lastKnownGoodInvalidationReason: String(
              (source.snapshotSummary as Record<string, unknown>).lastKnownGoodInvalidationReason || '',
            ),
          }
        : {
            lastSnapshotId: '',
            lastSnapshotAt: '',
            lastKnownGoodSnapshotId: '',
            lastKnownGoodSnapshotAt: '',
            lastKnownGoodStatus: 'unknown',
            lastKnownGoodInvalidatedAt: '',
            lastKnownGoodInvalidationReason: '',
          },
    recovery:
      source.recovery && typeof source.recovery === 'object'
        ? source.recovery
        : {
            lastRecoveryAt: '',
            lastRecoveryReason: '',
          },
  };
}

export function serializeUser(user: any) {
  return {
    id: String(user._id),
    email: user.email || '',
    username: user.username || '',
    name: user.name,
    avatarUrl: user.avatarUrl || '',
    bio: user.bio || '',
    role: user.role,
    status: user.status,
    devices: Array.isArray(user.devices)
      ? user.devices.map((item: any) => ({
          deviceId: item.deviceId || '',
          deviceName: item.deviceName || '',
          platform: item.platform || '',
          source: item.source || '',
          revokedAt: item.revokedAt || null,
          lastSeenAt: item.lastSeenAt || null,
          lastLoginAt: item.lastLoginAt || null,
        }))
      : [],
    subscription: normalizeSubscriptionShape(user.subscription),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function serializeProfile(profile: any, storageStateSynced = false) {
  const profileId = String(profile._id);
  return {
    id: profileId,
    userId: String(profile.userId),
    name: profile.name,
    status: profile.status,
    lastActive: profile.lastActive || '',
    tags: profile.tags || [],
    proxy: profile.proxy || '',
    proxyType: profile.proxyType || 'direct',
    proxyHost: profile.proxyHost || '',
    proxyPort: profile.proxyPort || '',
    proxyUsername: profile.proxyUsername || '',
    proxyPassword: profile.proxyPassword || '',
    expectedProxyIp: profile.expectedProxyIp || '',
    expectedProxyCountry: profile.expectedProxyCountry || '',
    expectedProxyRegion: profile.expectedProxyRegion || '',
    preferredProxyTransport: profile.preferredProxyTransport || '',
    lastResolvedProxyTransport: profile.lastResolvedProxyTransport || '',
    lastHostEnvironment: profile.lastHostEnvironment || '',
    ua: profile.ua || '',
    seed: profile.seed || '',
    isMobile: !!profile.isMobile,
    groupId: profile.groupId || '',
    runtimeSessionId: profile.runtimeSessionId || '',
    startupPlatform: profile.startupPlatform || '',
    startupUrl: profile.startupUrl || '',
    startupNavigation: profile.startupNavigation || {
      ok: false,
      requestedUrl: '',
      finalUrl: '',
      error: '',
    },
    storageStateSynced,
    proxyVerification: profile.proxyVerification || null,
    configFingerprintHash: profile.configFingerprintHash || '',
    proxyFingerprintHash: profile.proxyFingerprintHash || '',
    lastQuickIsolationCheck: profile.lastQuickIsolationCheck || null,
    trustedLaunchSnapshot: profile.trustedLaunchSnapshot || null,
    workspace: normalizeWorkspacePayload(profileId, profile.workspace),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function serializeGroup(group: any) {
  return {
    id: String(group._id),
    userId: String(group.userId),
    name: group.name,
    color: group.color || '',
    notes: group.notes || '',
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

export function serializeBehavior(behavior: any) {
  return {
    id: String(behavior._id),
    userId: String(behavior.userId),
    name: behavior.name,
    description: behavior.description || '',
    enabled: !!behavior.enabled,
    actions: Array.isArray(behavior.actions) ? behavior.actions : [],
    createdAt: behavior.createdAt,
    updatedAt: behavior.updatedAt,
  };
}

export function serializeSetting(settings: any) {
  return {
    id: String(settings._id),
    userId: String(settings.userId),
    autoFingerprint: settings.autoFingerprint,
    autoProxyVerification: settings.autoProxyVerification,
    defaultStartupPlatform: settings.defaultStartupPlatform || '',
    defaultStartupUrl: settings.defaultStartupUrl || '',
    theme: settings.theme || 'system',
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}
