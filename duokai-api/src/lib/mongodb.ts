import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || '';

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in environment variables');
}

type GlobalMongoose = typeof globalThis & {
  mongooseConn?: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};

const globalForMongoose = global as GlobalMongoose;

if (!globalForMongoose.mongooseConn) {
  globalForMongoose.mongooseConn = {
    conn: null,
    promise: null,
  };
}

export async function connectMongo() {
  if (globalForMongoose.mongooseConn?.conn) {
    return globalForMongoose.mongooseConn.conn;
  }

  if (!globalForMongoose.mongooseConn?.promise) {
    globalForMongoose.mongooseConn!.promise = mongoose.connect(MONGODB_URI, {
      dbName: process.env.MONGODB_DB || 'duokai',
    });
  }

  globalForMongoose.mongooseConn!.conn = await globalForMongoose.mongooseConn!.promise;
  return globalForMongoose.mongooseConn!.conn;
}
