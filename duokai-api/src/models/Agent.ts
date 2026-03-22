import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const AgentSchema = new Schema(
  {
    agentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      default: '',
      trim: true,
    },
    ownerUserId: {
      type: String,
      default: '',
      index: true,
    },
    status: {
      type: String,
      enum: ['ONLINE', 'OFFLINE', 'DISABLED'],
      default: 'OFFLINE',
      index: true,
    },
    registrationCodeHash: {
      type: String,
      default: '',
    },
    registrationCodeExpiresAt: {
      type: Date,
      default: null,
    },
    registrationCodeUsedAt: {
      type: Date,
      default: null,
    },
    agentVersion: {
      type: String,
      default: '',
    },
    capabilities: {
      type: [String],
      default: [],
    },
    hostInfo: {
      type: Schema.Types.Mixed,
      default: null,
    },
    runtimeStatus: {
      type: Schema.Types.Mixed,
      default: null,
    },
    lastSeenAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export type AgentDocument = InferSchemaType<typeof AgentSchema>;
export const AgentModel = mongoose.models.Agent || mongoose.model('Agent', AgentSchema);
