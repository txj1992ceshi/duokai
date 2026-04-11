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
