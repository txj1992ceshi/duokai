import { Schema, InferSchemaType, models, model } from 'mongoose';

const ProfileStorageStateSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    profileId: {
      type: Schema.Types.ObjectId,
      ref: 'Profile',
      required: true,
      index: true,
    },
    stateJson: {
      type: Schema.Types.Mixed,
      required: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    encrypted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

ProfileStorageStateSchema.index(
  { userId: 1, profileId: 1 },
  { unique: true }
);

export type ProfileStorageStateDocument = InferSchemaType<
  typeof ProfileStorageStateSchema
>;

export const ProfileStorageStateModel =
  models.ProfileStorageState ||
  model('ProfileStorageState', ProfileStorageStateSchema);
