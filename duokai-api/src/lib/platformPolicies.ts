export type PlatformPolicyPlatform = 'tiktok' | 'linkedin' | 'facebook';
export type PlatformPolicyPurpose = 'register' | 'nurture' | 'operation';

export type DefaultPlatformPolicy = {
  policyId: string;
  platform: PlatformPolicyPlatform;
  purpose: PlatformPolicyPurpose;
  version: number;
  active: boolean;
  cooldownPolicy: Record<string, unknown>;
  validationPolicy: Record<string, unknown>;
  proxyPolicy: Record<string, unknown>;
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
  const dedicatedProxyRequired = purpose === 'register';
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
      duplicateIpAction: purpose === 'operation' ? 'warn' : 'block',
    },
    validationPolicy: {
      riskTolerance,
      requireTimezoneMatch: true,
      requireLanguageMatch: true,
      requireWorkspaceIsolation: true,
    },
    proxyPolicy: {
      bindingMode: dedicatedProxyRequired ? 'dedicated' : 'reusable',
      requireLease: true,
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
