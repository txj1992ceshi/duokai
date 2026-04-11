import mongoose from 'mongoose';
import { AgentConfigStateModel } from '../models/AgentConfigState.js';

export function resolveUserConfigStateId(userId: string) {
  return `user:${userId}`;
}

export function isMongoObjectId(value: string): boolean {
  return mongoose.isValidObjectId(value);
}

export async function findConfigProfileForUser(userId: string, profileId: string) {
  const state = await AgentConfigStateModel.findOne({
    agentId: resolveUserConfigStateId(userId),
  })
    .select('profiles syncVersion')
    .lean();
  const profiles = Array.isArray(state?.profiles) ? state.profiles : [];
  const profile =
    profiles.find(
      (item: unknown): item is Record<string, unknown> =>
        Boolean(item) &&
        typeof item === 'object' &&
        String((item as Record<string, unknown>).id || '').trim() === profileId
    ) || null;
  return {
    state,
    profiles,
    profile,
  };
}

export function normalizeConfigProfilePayload(profileId: string, profile: Record<string, unknown>) {
  const nextProfile: Record<string, unknown> = {
    ...profile,
    id: profileId,
  };
  const currentVersion = Number(nextProfile.configSyncVersion || 0);
  return {
    ...nextProfile,
    configSyncVersion: Number.isFinite(currentVersion) && currentVersion >= 0 ? currentVersion : 0,
  };
}

export async function updateConfigProfileForUser(
  userId: string,
  profileId: string,
  updater: (profile: Record<string, unknown>) => Record<string, unknown>
) {
  const { state, profiles, profile } = await findConfigProfileForUser(userId, profileId);
  if (!state || !profile) {
    return null;
  }

  const nextProfiles = profiles.map((item: unknown) => {
    if (!item || typeof item !== 'object') {
      return item;
    }
    if (String((item as Record<string, unknown>).id || '').trim() !== profileId) {
      return item;
    }
    return updater(item as Record<string, unknown>);
  });

  return await AgentConfigStateModel.findOneAndUpdate(
    { agentId: resolveUserConfigStateId(userId) },
    {
      $set: { profiles: nextProfiles },
      $inc: { syncVersion: 1 },
    },
    { new: true }
  ).lean();
}

export async function upsertConfigProfileForUser(
  userId: string,
  profileId: string,
  nextProfile: Record<string, unknown>,
) {
  const { state, profiles, profile } = await findConfigProfileForUser(userId, profileId);
  const normalized = normalizeConfigProfilePayload(profileId, nextProfile);
  const currentProfiles = Array.isArray(profiles) ? profiles : [];
  const hasExisting = Boolean(profile);
  const nextProfiles = hasExisting
    ? currentProfiles.map((item: unknown) => {
        if (!item || typeof item !== 'object') {
          return item;
        }
        if (String((item as Record<string, unknown>).id || '').trim() !== profileId) {
          return item;
        }
        return normalized;
      })
    : [...currentProfiles, normalized];

  return await AgentConfigStateModel.findOneAndUpdate(
    { agentId: resolveUserConfigStateId(userId) },
    {
      $set: { profiles: nextProfiles },
      ...(state ? { $inc: { syncVersion: 1 } } : { $setOnInsert: { syncVersion: 1, globalConfigSyncVersion: 0 } }),
    },
    { upsert: true, new: true }
  ).lean();
}

export async function deleteConfigProfileForUser(userId: string, profileId: string) {
  const { state, profiles, profile } = await findConfigProfileForUser(userId, profileId);
  if (!state || !profile) {
    return null;
  }
  const nextProfiles = profiles.filter((item: unknown) => {
    if (!item || typeof item !== 'object') {
      return true;
    }
    return String((item as Record<string, unknown>).id || '').trim() !== profileId;
  });

  return await AgentConfigStateModel.findOneAndUpdate(
    { agentId: resolveUserConfigStateId(userId) },
    {
      $set: { profiles: nextProfiles },
      $inc: { syncVersion: 1 },
    },
    { new: true }
  ).lean();
}
