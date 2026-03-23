import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

const UserDeviceSchema = new Schema(
  {
    deviceId: { type: String, required: true, trim: true },
    deviceName: { type: String, default: '', trim: true },
    platform: { type: String, default: '', trim: true },
    source: { type: String, default: 'desktop', trim: true },
    sessionToken: { type: String, default: '', trim: true },
    revokedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { _id: false }
);

const UserSubscriptionSchema = new Schema(
  {
    plan: { type: String, default: 'free', trim: true },
    status: {
      type: String,
      enum: ['free', 'trial', 'active', 'expired', 'suspended'],
      default: 'free',
      trim: true,
    },
    expiresAt: { type: Date, default: null },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: '',
      trim: true,
    },
    avatarUrl: {
      type: String,
      default: '',
      trim: true,
    },
    bio: {
      type: String,
      default: '',
      trim: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'active',
    },
    devices: {
      type: [UserDeviceSchema],
      default: [],
    },
    subscription: {
      type: UserSubscriptionSchema,
      default: () => ({ plan: 'free', status: 'free', expiresAt: null }),
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.pre('validate', function ensureLoginIdentifier() {
  const user = this as InferSchemaType<typeof UserSchema>;
  const email = String(user.email || '').trim();
  const username = String(user.username || '').trim();

  if (!email && !username) {
    this.invalidate('email', 'Email or username is required');
    this.invalidate('username', 'Email or username is required');
  }

});

export type UserDocument = InferSchemaType<typeof UserSchema>;
export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
