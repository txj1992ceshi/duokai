import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const WorkspaceManifestSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    profileId: {
      type: Schema.Types.ObjectId,
      ref: 'Profile',
      required: true,
      index: true,
    },
    manifestId: {
      type: String,
      required: true,
      trim: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    runtimeMode: {
      type: String,
      enum: ['local', 'strong-local', 'vm', 'container'],
      default: 'local',
    },
    workspace: {
      type: Schema.Types.Mixed,
      default: {},
    },
    healthSummary: {
      type: Schema.Types.Mixed,
      default: {},
    },
    consistencySummary: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

WorkspaceManifestSchema.index({ userId: 1, profileId: 1 }, { unique: true });

export type WorkspaceManifestDocument = InferSchemaType<typeof WorkspaceManifestSchema>;
export const WorkspaceManifestModel =
  mongoose.models.WorkspaceManifest || mongoose.model('WorkspaceManifest', WorkspaceManifestSchema);
