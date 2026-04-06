import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const WorkspaceSnapshotSchema = new Schema(
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
    snapshotId: {
      type: String,
      required: true,
      trim: true,
    },
    templateRevision: {
      type: String,
      default: '',
      trim: true,
    },
    templateFingerprintHash: {
      type: String,
      default: '',
      trim: true,
    },
    manifest: {
      type: Schema.Types.Mixed,
      default: {},
    },
    workspaceMetadata: {
      type: Schema.Types.Mixed,
      required: true,
    },
    storageState: {
      type: Schema.Types.Mixed,
      default: {},
    },
    directoryManifest: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    healthSummary: {
      type: Schema.Types.Mixed,
      default: {},
    },
    consistencySummary: {
      type: Schema.Types.Mixed,
      default: {},
    },
    validatedStartAt: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

WorkspaceSnapshotSchema.index(
  { userId: 1, profileId: 1, snapshotId: 1 },
  { unique: true }
);

export type WorkspaceSnapshotDocument = InferSchemaType<
  typeof WorkspaceSnapshotSchema
>;

export const WorkspaceSnapshotModel =
  mongoose.models.WorkspaceSnapshot ||
  mongoose.model('WorkspaceSnapshot', WorkspaceSnapshotSchema);
