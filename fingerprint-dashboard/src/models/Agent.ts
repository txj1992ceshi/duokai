import mongoose, { Schema, InferSchemaType, models, model } from 'mongoose';

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
    capabilities: {
      type: [String],
      default: [],
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
export const AgentModel = models.Agent || model('Agent', AgentSchema);
