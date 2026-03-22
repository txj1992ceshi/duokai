import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const ControlTaskSchema = new Schema(
  {
    taskId: {
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
    type: {
      type: String,
      enum: ['PROFILE_START', 'PROFILE_STOP', 'PROXY_TEST', 'TEMPLATE_APPLY', 'SETTINGS_SYNC', 'LOG_FLUSH'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'RECEIVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    idempotencyKey: {
      type: String,
      default: '',
      index: true,
    },
    createdByUserId: {
      type: String,
      default: '',
      index: true,
    },
    createdByEmail: {
      type: String,
      default: '',
    },
    pulledAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    errorCode: {
      type: String,
      default: '',
    },
    errorMessage: {
      type: String,
      default: '',
    },
    outputRef: {
      type: String,
      default: '',
    },
    cancelledByUserId: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

ControlTaskSchema.index({ agentId: 1, status: 1, createdAt: 1 });
ControlTaskSchema.index(
  { agentId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string', $ne: '' } },
  }
);

export type ControlTaskDocument = InferSchemaType<typeof ControlTaskSchema>;
export const ControlTaskModel =
  mongoose.models.ControlTask || mongoose.model('ControlTask', ControlTaskSchema);
