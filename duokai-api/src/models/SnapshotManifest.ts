import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const SnapshotManifestSchema = new Schema(
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

SnapshotManifestSchema.index({ userId: 1, profileId: 1, snapshotId: 1 }, { unique: true });

export type SnapshotManifestDocument = InferSchemaType<typeof SnapshotManifestSchema>;
export const SnapshotManifestModel =
  mongoose.models.SnapshotManifest || mongoose.model('SnapshotManifest', SnapshotManifestSchema);
