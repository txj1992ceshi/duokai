import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const ProxyAssetSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['http', 'https', 'socks5'],
      required: true,
      default: 'http',
    },
    host: {
      type: String,
      required: true,
      trim: true,
    },
    port: {
      type: Number,
      required: true,
      min: 1,
    },
    username: {
      type: String,
      default: '',
      trim: true,
    },
    password: {
      type: String,
      default: '',
    },
    bindingMode: {
      type: String,
      enum: ['dedicated', 'reusable'],
      default: 'dedicated',
      index: true,
    },
    sharingMode: {
      type: String,
      enum: ['dedicated', 'shared', 'hybrid'],
      default: 'dedicated',
      index: true,
    },
    maxProfilesPerIp: {
      type: Number,
      default: 1,
      min: 1,
    },
    maxConcurrentRunsPerIp: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'cooldown', 'retired', 'error'],
      default: 'draft',
      index: true,
    },
    platformScope: {
      type: [String],
      default: [],
    },
    purposeScope: {
      type: [String],
      default: [],
    },
    cooldownUntil: {
      type: Date,
      default: null,
      index: true,
    },
    currentLeaseId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    currentLeaseProfileId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    lastVerifiedAt: {
      type: Date,
      default: null,
    },
    lastVerifiedIp: {
      type: String,
      default: '',
      trim: true,
    },
    lastVerifiedCountry: {
      type: String,
      default: '',
      trim: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

ProxyAssetSchema.index({ userId: 1, status: 1, bindingMode: 1, sharingMode: 1, createdAt: -1 });

export type ProxyAssetDocument = InferSchemaType<typeof ProxyAssetSchema>;
export const ProxyAssetModel =
  mongoose.models.ProxyAsset || mongoose.model('ProxyAsset', ProxyAssetSchema);
