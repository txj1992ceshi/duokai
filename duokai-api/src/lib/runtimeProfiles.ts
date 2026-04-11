import { findConfigProfileForUser, isMongoObjectId, updateConfigProfileForUser } from './configProfiles.js';
import { ProfileModel } from '../models/Profile.js';

export type RuntimeProfileSource = 'mongo' | 'config';

export type ResolvedRuntimeProfile = {
  profile: Record<string, unknown>;
  profileId: string;
  source: RuntimeProfileSource;
};

export async function resolveRuntimeProfileForUser(
  userId: string,
  requestedProfileId: string
): Promise<ResolvedRuntimeProfile | null> {
  const normalizedProfileId = String(requestedProfileId || '').trim();
  if (!normalizedProfileId) {
    return null;
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

  const { profile } = await findConfigProfileForUser(userId, normalizedProfileId);
  if (!profile) {
    return null;
  }

  return {
    profile,
    profileId: String(profile.id || normalizedProfileId).trim(),
    source: 'config',
  };
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

  const savedState = await updateConfigProfileForUser(userId, normalizedProfileId, (existing) => ({
    ...existing,
    ...patch,
    id: normalizedProfileId,
  }));
  return Boolean(savedState);
}
