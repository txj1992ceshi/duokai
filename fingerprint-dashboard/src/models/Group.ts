import { Schema, InferSchemaType, models, model } from 'mongoose';

const GroupSchema = new Schema(
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
    color: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

export type GroupDocument = InferSchemaType<typeof GroupSchema>;

export const GroupModel = models.Group || model('Group', GroupSchema);
