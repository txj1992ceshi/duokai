import mongoose, { type InferSchemaType } from 'mongoose';

const { Schema } = mongoose;

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
