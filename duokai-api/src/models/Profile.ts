import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const ProfileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    name: { type: String, required: true, trim: true },
    platform: {
      type: String,
      enum: ['tiktok', 'linkedin', 'facebook', ''],
      default: '',
      index: true,
    },
    purpose: {
      type: String,
      enum: ['register', 'nurture', 'operation'],
      default: 'operation',
      index: true,
    },
    runtimeMode: {
      type: String,
      enum: ['local', 'strong-local', 'vm', 'container'],
      default: 'local',
    },
    proxyBindingMode: {
      type: String,
      enum: ['dedicated', 'reusable'],
      default: 'dedicated',
    },
    lifecycleState: {
      type: String,
      default: 'draft',
      trim: true,
      index: true,
    },
    riskFlags: {
      type: [String],
      default: [],
    },
    cooldownSummary: {
      type: Schema.Types.Mixed,
      default: {
        active: false,
        reason: '',
        until: '',
      },
    },
    fingerprintPresetRef: {
      type: String,
      default: '',
      trim: true,
    },
    workspaceManifestRef: {
      type: String,
      default: '',
      trim: true,
    },
    proxyAssetId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    activeLeaseId: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    ownerLabel: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['Ready', 'Running', 'Error'],
      default: 'Ready',
    },
    lastActive: { type: String, default: '' },
    lastLaunchAt: { type: String, default: '' },
    lastSuccessAt: { type: String, default: '' },
    lastRestoreAt: { type: String, default: '' },
    tags: { type: [String], default: [] },

    proxy: { type: String, default: '' },
    proxyType: { type: String, default: 'direct' },
    proxyHost: { type: String, default: '' },
    proxyPort: { type: String, default: '' },
    proxyUsername: { type: String, default: '' },
    proxyPassword: { type: String, default: '' },

    expectedProxyIp: { type: String, default: '' },
    expectedProxyCountry: { type: String, default: '' },
    expectedProxyRegion: { type: String, default: '' },

    preferredProxyTransport: { type: String, default: '' },
    lastResolvedProxyTransport: { type: String, default: '' },
    lastHostEnvironment: { type: String, default: '' },

    ua: { type: String, default: '' },
    seed: { type: String, default: '' },
    isMobile: { type: Boolean, default: false },

    groupId: { type: String, default: '' },
    runtimeSessionId: { type: String, default: '' },

    startupPlatform: { type: String, default: '' },
    startupUrl: { type: String, default: '' },

    startupNavigation: {
      ok: { type: Boolean, default: false },
      requestedUrl: { type: String, default: '' },
      finalUrl: { type: String, default: '' },
      error: { type: String, default: '' },
    },

    proxyVerification: {
      type: Schema.Types.Mixed,
      default: null,
    },

    configFingerprintHash: { type: String, default: '' },
    proxyFingerprintHash: { type: String, default: '' },
    lastQuickIsolationCheck: {
      type: Schema.Types.Mixed,
      default: null,
    },
    trustedLaunchSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
    },
    workspace: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export type ProfileDocument = InferSchemaType<typeof ProfileSchema>;
export const ProfileModel = mongoose.models.Profile || mongoose.model('Profile', ProfileSchema);
