import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'duokai';

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: '', trim: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function main() {
  const identifier = String(process.argv[2] || '').trim().toLowerCase();
  const password = process.argv[3];
  const name = process.argv[4] || 'Admin';

  if (!identifier || !password) {
    console.log('Usage: node scripts/create-admin.js <email-or-username> <password> [name]');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });

  const query = identifier.includes('@') ? { email: identifier } : { username: identifier };
  const exists = await User.findOne(query);
  if (exists) {
    exists.role = 'admin';
    exists.status = 'active';
    if (name) exists.name = name;
    if (password) exists.passwordHash = await bcrypt.hash(password, 10);
    await exists.save();

    console.log('Updated existing user to admin:', exists.email || exists.username);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      ...(identifier.includes('@') ? { email: identifier } : { username: identifier }),
      passwordHash,
      name,
      role: 'admin',
      status: 'active',
    });

    console.log('Created admin user:', user.email || user.username);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
