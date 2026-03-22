import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const AgentConfigStateSchema = new Schema(
  {
    agentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    syncVersion: {
      type: Number,
      default: 0,
      index: true,
    },
    profiles: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    proxies: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    templates: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    cloudPhones: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    settings: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export type AgentConfigStateDocument = InferSchemaType<typeof AgentConfigStateSchema>;
export const AgentConfigStateModel =
  mongoose.models.AgentConfigState || mongoose.model('AgentConfigState', AgentConfigStateSchema);
