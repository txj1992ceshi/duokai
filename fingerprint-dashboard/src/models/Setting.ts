import { Schema, InferSchemaType, models, model } from 'mongoose';

const SettingSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    autoFingerprint: {
      type: Boolean,
      default: true,
    },
    autoProxyVerification: {
      type: Boolean,
      default: true,
    },
    defaultStartupPlatform: {
      type: String,
      default: '',
    },
    defaultStartupUrl: {
      type: String,
      default: '',
    },
    runtimeUrl: {
      type: String,
      default: 'http://127.0.0.1:3101',
    },
    runtimeApiKey: {
      type: String,
      default: '',
    },

    theme: {
      type: String,
      default: 'system',
    },
  },
  {
    timestamps: true,
  }
);

SettingSchema.index({ userId: 1 }, { unique: true });

export type SettingDocument = InferSchemaType<typeof SettingSchema>;

export const SettingModel = models.Setting || model('Setting', SettingSchema);
