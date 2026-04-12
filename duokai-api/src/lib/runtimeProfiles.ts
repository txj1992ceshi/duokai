import { findConfigProfileForUser, isMongoObjectId, updateConfigProfileForUser } from './configProfiles.js';
import { ProfileModel } from '../models/Profile.js';

export type RuntimeProfileSource = 'mongo' | 'config';

export type ResolvedRuntimeProfile = {
  profile: Record<string, unknown>;
  profileId: string;
  source: RuntimeProfileSource;
};

type ResolveRuntimeProfileOptions = {
  preferConfig?: boolean;
};

export async function resolveRuntimeProfileForUser(
  userId: string,
  requestedProfileId: string,
  options: ResolveRuntimeProfileOptions = {}
): Promise<ResolvedRuntimeProfile | null> {
  const normalizedProfileId = String(requestedProfileId || '').trim();
  if (!normalizedProfileId) {
    return null;
  }

  const preferConfig = options.preferConfig !== false;

  // Cross-device sync now treats config profiles as the canonical identity.
  // Mongo profiles remain a compatibility fallback for older environments only.
  if (preferConfig) {
    const { profile } = await findConfigProfileForUser(userId, normalizedProfileId);
    if (profile) {
      return {
        profile,
        profileId: String(profile.id || normalizedProfileId).trim(),
        source: 'config',
      };
    }
  }

  if (isMongoObjectId(normalizedProfileId)) {
    const mongoProfile = await ProfileModel.findOne({
      _id: normalizedProfileId,
      userId,
    }).lean();
    if (mongoProfile) {
      return {
        profile: mongoProfile as Record<string, unknown>,
        profileId: String(mongoProfile._id),
        source: 'mongo',
      };
    }
  }

  if (!preferConfig) {
    const { profile } = await findConfigProfileForUser(userId, normalizedProfileId);
    if (profile) {
      return {
        profile,
        profileId: String(profile.id || normalizedProfileId).trim(),
        source: 'config',
      };
    }
  }

  return null;
}

export async function updateRuntimeProfileFieldsForUser(
  userId: string,
  requestedProfileId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const normalizedProfileId = String(requestedProfileId || '').trim();
  if (!normalizedProfileId) {
    return false;
  }

  // New runtime metadata writes should converge on config profiles first.
  const savedState = await updateConfigProfileForUser(userId, normalizedProfileId, (existing) => ({
    ...existing,
    ...patch,
    id: normalizedProfileId,
  }));
  if (savedState) {
    return true;
  }

  if (isMongoObjectId(normalizedProfileId)) {
    const result = await ProfileModel.updateOne(
      { _id: normalizedProfileId, userId },
      {
        $set: patch,
      }
    );
    if ((result.matchedCount || 0) > 0) {
      return true;
    }
  }
  return false;
}
