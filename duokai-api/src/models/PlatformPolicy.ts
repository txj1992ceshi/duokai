import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const PlatformPolicySchema = new Schema(
  {
    policyId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['tiktok', 'linkedin', 'facebook'],
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['register', 'nurture', 'operation'],
      required: true,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    cooldownPolicy: {
      type: Schema.Types.Mixed,
      default: {},
    },
    validationPolicy: {
      type: Schema.Types.Mixed,
      default: {},
    },
    proxyPolicy: {
      type: Schema.Types.Mixed,
      default: {},
    },
    fingerprintPolicy: {
      type: Schema.Types.Mixed,
      default: {},
    },
    workspacePolicy: {
      type: Schema.Types.Mixed,
      default: {},
    },
    startupPolicy: {
      type: Schema.Types.Mixed,
      default: {},
    },
    restorePolicy: {
      type: Schema.Types.Mixed,
      default: {},
    },
    fallbackPolicyRef: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

PlatformPolicySchema.index({ platform: 1, purpose: 1, version: -1 }, { unique: true });

export type PlatformPolicyDocument = InferSchemaType<typeof PlatformPolicySchema>;
export const PlatformPolicyModel =
  mongoose.models.PlatformPolicy || mongoose.model('PlatformPolicy', PlatformPolicySchema);
