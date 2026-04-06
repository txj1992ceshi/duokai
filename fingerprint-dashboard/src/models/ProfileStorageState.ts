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
      default: null,
    },
    inlineStateJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    version: {
      type: Number,
      default: 1,
    },
    encrypted: {
      type: Boolean,
      default: false,
    },
    fileRef: {
      type: String,
      default: '',
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    checksum: {
      type: String,
      default: '',
      trim: true,
    },
    contentType: {
      type: String,
      default: 'application/json',
      trim: true,
    },
    retentionPolicy: {
      type: String,
      default: 'latest-only',
      trim: true,
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
