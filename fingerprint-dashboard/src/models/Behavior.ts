import { Schema, InferSchemaType, models, model } from 'mongoose';

const BehaviorSchema = new Schema(
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
    description: {
      type: String,
      default: '',
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    actions: {
      type: [Schema.Types.Mixed],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export type BehaviorDocument = InferSchemaType<typeof BehaviorSchema>;

export const BehaviorModel = models.Behavior || model('Behavior', BehaviorSchema);
