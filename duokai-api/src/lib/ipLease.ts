type ProfileLike = {
  id?: string;
  _id?: unknown;
  platform?: string;
  purpose?: string;
  proxyBindingMode?: string;
  ipUsageMode?: string;
  proxyAssetId?: string;
  activeLeaseId?: string;
};

type LeaseLike = {
  leaseId?: string;
  profileId?: string;
  proxyAssetId?: string;
  platform?: string;
  purpose?: string;
  bindingMode?: string;
  ipUsageMode?: string;
  state?: string;
  egressIp?: string;
  cooldownUntil?: Date | string | null;
};

type ProxyAssetLike = {
  _id?: unknown;
  sharingMode?: string;
  maxProfilesPerIp?: number | null;
  maxConcurrentRunsPerIp?: number | null;
  status?: string;
  cooldownUntil?: Date | string | null;
};

type ProxyPolicyLike = {
  allowedIpUsageModes?: unknown;
  defaultIpUsageMode?: unknown;
  sharedIpMaxProfilesPerIp?: unknown;
  sharedIpMaxConcurrentRunsPerIp?: unknown;
};

export type LeaseValidationResult = {
  ok: boolean;
  code: string;
  message: string;
  severity: 'info' | 'warn' | 'block';
  detail?: Record<string, unknown>;
};

type LeaseValidationOptions = {
  proxyAsset?: ProxyAssetLike | null;
  proxyPolicy?: ProxyPolicyLike | null;
  runningProfileIds?: string[];
  now?: Date;
};

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getProfileId(profile: ProfileLike): string {
  return String(profile.id || profile._id || '').trim();
}

export function validateProfileLeaseForStart(
  profile: ProfileLike,
  activeLease: LeaseLike | null,
  conflictingLeases: LeaseLike[],
  options: LeaseValidationOptions = {}
): LeaseValidationResult {
  const now = options.now || new Date();
  const profileId = getProfileId(profile);
  const purpose = String(profile.purpose || 'operation').trim() || 'operation';
  const platform = String(profile.platform || '').trim();
  const bindingMode = String(profile.proxyBindingMode || 'dedicated').trim() || 'dedicated';
  const ipUsageModeCandidate = String(profile.ipUsageMode || '').trim();
  const allowedIpUsageModes = Array.isArray(options.proxyPolicy?.allowedIpUsageModes)
    ? options.proxyPolicy?.allowedIpUsageModes
        .map((item) => String(item || '').trim())
        .filter((item) => item === 'dedicated' || item === 'shared')
    : [];
  const defaultIpUsageMode =
    String(options.proxyPolicy?.defaultIpUsageMode || '').trim() === 'shared'
      ? 'shared'
      : purpose === 'register'
        ? 'dedicated'
        : 'shared';
  const ipUsageMode =
    ipUsageModeCandidate === 'dedicated' || ipUsageModeCandidate === 'shared'
      ? ipUsageModeCandidate
      : defaultIpUsageMode;
  const sharingMode = String(options.proxyAsset?.sharingMode || '').trim() || 'dedicated';

  if (!activeLease) {
    return {
      ok: false,
      code: 'NO_ACTIVE_LEASE',
      message: 'Profile launch requires an active IP lease.',
      severity: 'block',
      detail: { profileId, platform, purpose, bindingMode, ipUsageMode },
    };
  }

  if (String(activeLease.state || '').trim() !== 'active') {
    return {
      ok: false,
      code: 'LEASE_NOT_ACTIVE',
      message: 'Profile launch requires an active lease state.',
      severity: 'block',
      detail: { profileId, leaseId: activeLease.leaseId || '', state: activeLease.state || '' },
    };
  }

  const cooldownUntil = normalizeDate(activeLease.cooldownUntil);
  if (cooldownUntil && cooldownUntil.getTime() > now.getTime()) {
    return {
      ok: false,
      code: 'LEASE_COOLDOWN',
      message: 'The assigned IP lease is cooling down.',
      severity: 'block',
      detail: { profileId, leaseId: activeLease.leaseId || '', cooldownUntil: cooldownUntil.toISOString() },
    };
  }

  const proxyCooldownUntil = normalizeDate(options.proxyAsset?.cooldownUntil);
  if (proxyCooldownUntil && proxyCooldownUntil.getTime() > now.getTime()) {
    return {
      ok: false,
      code: 'PROXY_ASSET_COOLDOWN',
      message: 'The selected proxy asset is cooling down.',
      severity: 'block',
      detail: { profileId, proxyAssetId: activeLease.proxyAssetId || '', cooldownUntil: proxyCooldownUntil.toISOString() },
    };
  }

  const duplicateIpLeases = conflictingLeases.filter((lease) => {
    const sameIp = String(lease.egressIp || '').trim() !== '' && lease.egressIp === activeLease.egressIp;
    const differentProfile = String(lease.profileId || '').trim() !== profileId;
    return sameIp && differentProfile && String(lease.state || '').trim() === 'active';
  });

  const sameAssetLeases = conflictingLeases.filter((lease) => {
    const sameAsset =
      String(lease.proxyAssetId || '').trim() !== '' &&
      String(lease.proxyAssetId || '').trim() === String(activeLease.proxyAssetId || '').trim();
    const differentProfile = String(lease.profileId || '').trim() !== profileId;
    return sameAsset && differentProfile && String(lease.state || '').trim() === 'active';
  });

  const uniqueSharedProfileIds = new Set(
    [...duplicateIpLeases, ...sameAssetLeases]
      .map((lease) => String(lease.profileId || '').trim())
      .filter(Boolean)
  );
  const runningProfileIds = new Set((options.runningProfileIds || []).map((item) => String(item || '').trim()));
  const currentConcurrentRuns = [...uniqueSharedProfileIds].filter((candidateId) => runningProfileIds.has(candidateId)).length;
  const sharedProfileLimit = Math.max(
    1,
    Number(options.proxyAsset?.maxProfilesPerIp || options.proxyPolicy?.sharedIpMaxProfilesPerIp || 1) || 1
  );
  const sharedConcurrentLimit = Math.max(
    1,
    Number(options.proxyAsset?.maxConcurrentRunsPerIp || options.proxyPolicy?.sharedIpMaxConcurrentRunsPerIp || 1) || 1
  );

  if (allowedIpUsageModes.length > 0 && !allowedIpUsageModes.includes(ipUsageMode)) {
    return {
      ok: false,
      code: 'IP_USAGE_MODE_NOT_ALLOWED',
      message: 'The selected IP usage mode is not allowed for this platform/purpose policy.',
      severity: 'block',
      detail: { profileId, platform, purpose, ipUsageMode, allowedIpUsageModes },
    };
  }

  if (ipUsageMode === 'shared') {
    if (sharingMode === 'dedicated') {
      return {
        ok: false,
        code: 'PROXY_SHARING_UNSUPPORTED',
        message: 'The selected proxy asset does not support shared IP usage.',
        severity: 'block',
        detail: { profileId, proxyAssetId: activeLease.proxyAssetId || '', sharingMode, ipUsageMode },
      };
    }
    if (uniqueSharedProfileIds.size + 1 > sharedProfileLimit) {
      return {
        ok: false,
        code: 'SHARED_IP_PROFILE_LIMIT',
        message: 'The selected shared IP has reached its profile binding limit.',
        severity: 'block',
        detail: {
          profileId,
          proxyAssetId: activeLease.proxyAssetId || '',
          ipUsageMode,
          currentProfiles: uniqueSharedProfileIds.size + 1,
          maxProfilesPerIp: sharedProfileLimit,
        },
      };
    }
    if (currentConcurrentRuns + 1 > sharedConcurrentLimit) {
      return {
        ok: false,
        code: 'SHARED_IP_CONCURRENT_LIMIT',
        message: 'The selected shared IP has reached its concurrent run limit.',
        severity: 'block',
        detail: {
          profileId,
          proxyAssetId: activeLease.proxyAssetId || '',
          ipUsageMode,
          currentConcurrentRuns: currentConcurrentRuns + 1,
          maxConcurrentRunsPerIp: sharedConcurrentLimit,
        },
      };
    }
  }

  if (duplicateIpLeases.length > 0) {
    const shouldBlock = ipUsageMode === 'dedicated' || purpose === 'register' || bindingMode === 'dedicated';
    return {
      ok: !shouldBlock,
      code: shouldBlock ? 'DEDICATED_IP_CONFLICT' : 'DUPLICATE_IP_WARNING',
      message: shouldBlock
        ? 'The assigned lease conflicts with another active profile using the same egress IP.'
        : 'Another active profile is using the same egress IP.',
      severity: shouldBlock ? 'block' : 'warn',
      detail: {
        profileId,
        leaseId: activeLease.leaseId || '',
        platform,
        purpose,
        ipUsageMode,
        egressIp: activeLease.egressIp || '',
        conflictingProfileIds: duplicateIpLeases.map((lease) => String(lease.profileId || '').trim()),
      },
    };
  }

  return {
    ok: true,
    code: 'LEASE_OK',
    message: 'Active lease validated.',
    severity: 'info',
      detail: {
        profileId,
        leaseId: activeLease.leaseId || '',
        platform,
        purpose,
        ipUsageMode,
        egressIp: activeLease.egressIp || '',
      },
    };
}
