import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const ConfigSyncEventSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    scope: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    direction: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    mode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    profileIds: {
      type: [String],
      default: [],
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    errorMessage: {
      type: String,
      default: '',
      trim: true,
    },
    cloudProfileCount: {
      type: Number,
      default: 0,
    },
    localMirroredProfileCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

ConfigSyncEventSchema.index({ userId: 1, scope: 1, createdAt: -1 });
ConfigSyncEventSchema.index({ userId: 1, profileIds: 1, createdAt: -1 });

export type ConfigSyncEventDocument = InferSchemaType<typeof ConfigSyncEventSchema>;

export const ConfigSyncEventModel =
  mongoose.models.ConfigSyncEvent || mongoose.model('ConfigSyncEvent', ConfigSyncEventSchema);
