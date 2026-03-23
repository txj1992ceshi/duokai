import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

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
    deviceId: {
      type: String,
      default: '',
      trim: true,
    },
    updatedBy: {
      type: String,
      default: '',
      trim: true,
    },
    source: {
      type: String,
      default: 'desktop',
      trim: true,
    },
    stateHash: {
      type: String,
      default: '',
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
  mongoose.models.ProfileStorageState ||
  mongoose.model('ProfileStorageState', ProfileStorageStateSchema);
