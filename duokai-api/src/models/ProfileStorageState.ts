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
      // Runtime/canonical profile identity. Supports UUID and legacy ObjectId strings.
      type: String,
      required: true,
      index: true,
      trim: true,
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
    inlineStateJson: {
      type: Schema.Types.Mixed,
      default: null,
    },
    stateJson: {
      type: Schema.Types.Mixed,
      default: null,
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
