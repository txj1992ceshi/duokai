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
    workspaceManifestRef: {
      type: String,
      default: '',
      trim: true,
    },
    storageStateRef: {
      type: String,
      default: '',
      trim: true,
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
    fileRef: {
      type: String,
      default: '',
      trim: true,
    },
    checksum: {
      type: String,
      default: '',
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    contentType: {
      type: String,
      default: 'application/json',
      trim: true,
    },
    retentionPolicy: {
      type: String,
      default: 'recent-n',
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
