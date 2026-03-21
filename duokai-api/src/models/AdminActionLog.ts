import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const AdminActionLogSchema = new Schema(
  {
    adminUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    adminEmail: {
      type: String,
      default: '',
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      required: true,
      index: true,
    },
    targetId: {
      type: String,
      default: '',
      index: true,
    },
    targetLabel: {
      type: String,
      default: '',
    },
    detail: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export type AdminActionLogDocument = InferSchemaType<typeof AdminActionLogSchema>;

export const AdminActionLogModel =
  mongoose.models.AdminActionLog ||
  mongoose.model('AdminActionLog', AdminActionLogSchema);
