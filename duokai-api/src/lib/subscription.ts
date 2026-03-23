const SUBSCRIPTION_STATUSES = new Set(['free', 'trial', 'active', 'expired', 'suspended']);

export type NormalizedSubscription = {
  plan: string;
  status: 'free' | 'trial' | 'active' | 'expired' | 'suspended';
  expiresAt: Date | null;
};

export function normalizeSubscriptionShape(subscription: any): NormalizedSubscription {
  const plan = String(subscription?.plan || 'free').trim() || 'free';
  const rawStatus = String(subscription?.status || '').trim().toLowerCase();
  const expiresAt =
    subscription?.expiresAt instanceof Date
      ? subscription.expiresAt
      : subscription?.expiresAt
        ? new Date(subscription.expiresAt)
        : null;
  const validExpiresAt =
    expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null;
  const isExpired =
    validExpiresAt !== null && validExpiresAt.getTime() < Date.now();

  let status: NormalizedSubscription['status'] = 'free';

  if (rawStatus === 'suspended') {
    status = 'suspended';
  } else if (plan === 'free' || rawStatus === 'free' || !rawStatus) {
    status = 'free';
  } else if (isExpired) {
    status = 'expired';
  } else if (rawStatus === 'trial') {
    status = 'trial';
  } else if (rawStatus === 'active') {
    status = 'active';
  } else if (rawStatus === 'expired') {
    status = 'expired';
  }

  return {
    plan,
    status,
    expiresAt: validExpiresAt,
  };
}

export function isValidSubscriptionStatus(value: unknown): boolean {
  return SUBSCRIPTION_STATUSES.has(String(value || '').trim().toLowerCase());
}

export async function syncUserSubscriptionState(user: any) {
  if (!user) {
    return null;
  }

  const normalized = normalizeSubscriptionShape(user.subscription);
  const nextExpiresAtValue = normalized.expiresAt ? normalized.expiresAt.getTime() : null;
  const currentExpiresAtValue =
    user.subscription?.expiresAt instanceof Date
      ? user.subscription.expiresAt.getTime()
      : user.subscription?.expiresAt
        ? new Date(user.subscription.expiresAt).getTime()
        : null;

  const changed =
    String(user.subscription?.plan || 'free') !== normalized.plan ||
    String(user.subscription?.status || 'free') !== normalized.status ||
    currentExpiresAtValue !== nextExpiresAtValue;

  if (changed) {
    user.subscription = normalized as any;
    await user.save();
  }

  return user;
}
