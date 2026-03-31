import mongoose, { Schema, InferSchemaType, models, model } from 'mongoose';

const TaskEventSchema = new Schema(
  {
    taskId: {
      type: String,
      required: true,
      index: true,
    },
    agentId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'RECEIVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
      required: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      default: '',
      index: true,
    },
    detail: {
      type: Schema.Types.Mixed,
      default: null,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
      index: true,
    },
  },
  {
    versionKey: false,
  }
);

TaskEventSchema.index({ taskId: 1, status: 1, idempotencyKey: 1 });

export type TaskEventDocument = InferSchemaType<typeof TaskEventSchema>;
export const TaskEventModel = models.TaskEvent || model('TaskEvent', TaskEventSchema);
