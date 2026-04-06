type ProfileLike = {
  id?: string;
  _id?: unknown;
  platform?: string;
  purpose?: string;
  proxyBindingMode?: string;
  activeLeaseId?: string;
};

type LeaseLike = {
  leaseId?: string;
  profileId?: string;
  platform?: string;
  purpose?: string;
  bindingMode?: string;
  state?: string;
  egressIp?: string;
  cooldownUntil?: Date | string | null;
};

export type LeaseValidationResult = {
  ok: boolean;
  code: string;
  message: string;
  severity: 'info' | 'warn' | 'block';
  detail?: Record<string, unknown>;
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
  now = new Date()
): LeaseValidationResult {
  const profileId = getProfileId(profile);
  const purpose = String(profile.purpose || 'operation').trim() || 'operation';
  const platform = String(profile.platform || '').trim();
  const bindingMode = String(profile.proxyBindingMode || 'dedicated').trim() || 'dedicated';

  if (!activeLease) {
    return {
      ok: false,
      code: 'NO_ACTIVE_LEASE',
      message: 'Profile launch requires an active IP lease.',
      severity: 'block',
      detail: { profileId, platform, purpose, bindingMode },
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

  const duplicateIpLeases = conflictingLeases.filter((lease) => {
    const sameIp = String(lease.egressIp || '').trim() !== '' && lease.egressIp === activeLease.egressIp;
    const differentProfile = String(lease.profileId || '').trim() !== profileId;
    return sameIp && differentProfile && String(lease.state || '').trim() === 'active';
  });

  if (duplicateIpLeases.length > 0) {
    const shouldBlock = purpose === 'register' || bindingMode === 'dedicated';
    return {
      ok: !shouldBlock,
      code: shouldBlock ? 'DUPLICATE_IP_CONFLICT' : 'DUPLICATE_IP_WARNING',
      message: shouldBlock
        ? 'The assigned lease conflicts with another active profile using the same egress IP.'
        : 'Another active profile is using the same egress IP.',
      severity: shouldBlock ? 'block' : 'warn',
      detail: {
        profileId,
        leaseId: activeLease.leaseId || '',
        platform,
        purpose,
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
      egressIp: activeLease.egressIp || '',
    },
  };
}
