import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const IpLeaseSchema = new Schema(
  {
    leaseId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    proxyAssetId: {
      type: String,
      required: true,
      index: true,
    },
    profileId: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['tiktok', 'linkedin', 'facebook', ''],
      default: '',
      index: true,
    },
    purpose: {
      type: String,
      enum: ['register', 'nurture', 'operation'],
      required: true,
      index: true,
    },
    ipUsageMode: {
      type: String,
      enum: ['dedicated', 'shared'],
      default: 'dedicated',
      index: true,
    },
    bindingMode: {
      type: String,
      enum: ['dedicated', 'reusable'],
      default: 'dedicated',
      index: true,
    },
    state: {
      type: String,
      enum: ['active', 'released', 'expired', 'blocked', 'cooldown'],
      default: 'active',
      index: true,
    },
    egressIp: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    cooldownUntil: {
      type: Date,
      default: null,
      index: true,
    },
    acquiredByDeviceId: {
      type: String,
      default: '',
      trim: true,
    },
    deviceId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    acquiredAt: {
      type: Date,
      default: () => new Date(),
    },
    assignedAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    conflictReason: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

IpLeaseSchema.index({ userId: 1, profileId: 1, state: 1, createdAt: -1 });
IpLeaseSchema.index({ userId: 1, proxyAssetId: 1, state: 1, createdAt: -1 });
IpLeaseSchema.index({ userId: 1, egressIp: 1, state: 1, cooldownUntil: 1 });

export type IpLeaseDocument = InferSchemaType<typeof IpLeaseSchema>;
export const IpLeaseModel =
  mongoose.models.IpLease || mongoose.model('IpLease', IpLeaseSchema);
