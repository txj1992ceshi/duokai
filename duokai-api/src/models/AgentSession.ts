import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const AgentSessionSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    agentId: {
      type: String,
      required: true,
      index: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

AgentSessionSchema.index({ agentId: 1, revokedAt: 1 });

export type AgentSessionDocument = InferSchemaType<typeof AgentSessionSchema>;
export const AgentSessionModel =
  mongoose.models.AgentSession || mongoose.model('AgentSession', AgentSessionSchema);
