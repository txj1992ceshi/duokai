export type PlatformPolicyPlatform = 'tiktok' | 'linkedin' | 'facebook';
export type PlatformPolicyPurpose = 'register' | 'nurture' | 'operation';
export type IpUsageMode = 'dedicated' | 'shared';

export type DefaultPlatformPolicy = {
  policyId: string;
  platform: PlatformPolicyPlatform;
  purpose: PlatformPolicyPurpose;
  version: number;
  active: boolean;
  cooldownPolicy: Record<string, unknown>;
  validationPolicy: Record<string, unknown>;
  proxyPolicy: {
    bindingMode: 'dedicated' | 'reusable';
    requireLease: boolean;
    allowedIpUsageModes: IpUsageMode[];
    defaultIpUsageMode: IpUsageMode;
    sharedIpMaxProfilesPerIp?: number;
    sharedIpMaxConcurrentRunsPerIp?: number;
  };
  fingerprintPolicy: Record<string, unknown>;
  workspacePolicy: Record<string, unknown>;
  startupPolicy: Record<string, unknown>;
  restorePolicy: Record<string, unknown>;
  fallbackPolicyRef: string;
};

function makeDefaultPolicy(
  platform: PlatformPolicyPlatform,
  purpose: PlatformPolicyPurpose
): DefaultPlatformPolicy {
  const dedicatedProxyRequired = false;
  const sharedAllowed = purpose !== 'register';
  const riskTolerance =
    purpose === 'register' ? 'strict' : purpose === 'nurture' ? 'balanced' : 'stable';
  const startupUrl =
    platform === 'tiktok'
      ? 'https://www.tiktok.com/'
      : platform === 'linkedin'
        ? 'https://www.linkedin.com/'
        : 'https://www.facebook.com/';
  return {
    policyId: `${platform}-${purpose}-v1`,
    platform,
    purpose,
    version: 1,
    active: true,
    cooldownPolicy: {
      dedicatedProxyRequired,
      blockOnCooldown: true,
      duplicateIpAction: 'warn',
    },
    validationPolicy: {
      riskTolerance,
      requireTimezoneMatch: true,
      requireLanguageMatch: true,
      requireWorkspaceIsolation: true,
    },
    proxyPolicy: {
      bindingMode: 'reusable',
      requireLease: true,
      allowedIpUsageModes: ['dedicated', 'shared'],
      defaultIpUsageMode: sharedAllowed ? 'shared' : 'dedicated',
      sharedIpMaxProfilesPerIp: 3,
      sharedIpMaxConcurrentRunsPerIp: 2,
    },
    fingerprintPolicy: {
      presetRef: `${platform}-${purpose}-baseline`,
      requireStableEnvironment: true,
    },
    workspacePolicy: {
      requireUniqueWorkspacePaths: true,
      requireProfileLock: true,
    },
    startupPolicy: {
      startupUrl,
      mode: 'manual-open',
    },
    restorePolicy: {
      preferredOrder: ['current-local', 'trusted-local-snapshot', 'cloud-backup'],
      requireCompatibilityCheck: true,
    },
    fallbackPolicyRef: `${platform}-operation-v1`,
  };
}

export function getDefaultPlatformPolicy(
  platform: string,
  purpose: string
): DefaultPlatformPolicy | null {
  const normalizedPlatform = String(platform || '').trim().toLowerCase() as PlatformPolicyPlatform;
  const normalizedPurpose = String(purpose || '').trim().toLowerCase() as PlatformPolicyPurpose;
  if (
    (normalizedPlatform !== 'tiktok' &&
      normalizedPlatform !== 'linkedin' &&
      normalizedPlatform !== 'facebook') ||
    (normalizedPurpose !== 'register' &&
      normalizedPurpose !== 'nurture' &&
      normalizedPurpose !== 'operation')
  ) {
    return null;
  }
  return makeDefaultPolicy(normalizedPlatform, normalizedPurpose);
}

export function resolveDefaultIpUsageMode(
  purpose: string,
  proxyPolicy?: Record<string, unknown> | null
): IpUsageMode {
  const candidate = String(proxyPolicy?.defaultIpUsageMode || '').trim();
  if (candidate === 'dedicated' || candidate === 'shared') {
    return candidate;
  }
  return String(purpose || '').trim() === 'register' ? 'dedicated' : 'shared';
}

export function normalizeProxyPolicy(
  purpose: string,
  proxyPolicy?: Record<string, unknown> | null
) {
  const defaultIpUsageMode = resolveDefaultIpUsageMode(purpose, proxyPolicy);
  const allowedIpUsageModes = Array.isArray(proxyPolicy?.allowedIpUsageModes)
    ? proxyPolicy.allowedIpUsageModes
        .map((item) => String(item || '').trim())
        .filter((item): item is IpUsageMode => item === 'dedicated' || item === 'shared')
    : ['dedicated', 'shared'];

  return {
    ...(proxyPolicy || {}),
    allowedIpUsageModes,
    defaultIpUsageMode,
    sharedIpMaxProfilesPerIp: Math.max(
      1,
      Number(proxyPolicy?.sharedIpMaxProfilesPerIp || 3) || 1
    ),
    sharedIpMaxConcurrentRunsPerIp: Math.max(
      1,
      Number(proxyPolicy?.sharedIpMaxConcurrentRunsPerIp || 2) || 1
    ),
  };
}

export function getDefaultPlatformPolicies(): DefaultPlatformPolicy[] {
  return [
    makeDefaultPolicy('tiktok', 'register'),
    makeDefaultPolicy('tiktok', 'nurture'),
    makeDefaultPolicy('tiktok', 'operation'),
    makeDefaultPolicy('linkedin', 'register'),
    makeDefaultPolicy('linkedin', 'nurture'),
    makeDefaultPolicy('linkedin', 'operation'),
    makeDefaultPolicy('facebook', 'register'),
    makeDefaultPolicy('facebook', 'nurture'),
    makeDefaultPolicy('facebook', 'operation'),
  ];
}
