import type { NextFunction, Request, Response } from 'express';
import { connectMongo } from '../lib/mongodb.js';
import { verifyToken } from '../lib/auth.js';
import { UserModel } from '../models/User.js';

type JwtUser = {
  userId: string;
  email: string;
  role: string;
  deviceId?: string;
  sessionToken?: string;
  iat: number;
  exp: number;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: JwtUser;
    }
  }
}

function getTokenFromRequest(req: Request) {
  const authHeader = req.header('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      throw new Error('Unauthorized');
    }
    const user = verifyToken(token);
    await connectMongo();
    const userDoc = await UserModel.findById(user.userId).lean();
    if (!userDoc || userDoc.status !== 'active') {
      throw new Error('Unauthorized');
    }
    if (user.deviceId) {
      const matchedDevice = Array.isArray(userDoc.devices)
        ? userDoc.devices.find((item: any) => String(item.deviceId) === user.deviceId)
        : null;
      if (
        !matchedDevice ||
        matchedDevice.revokedAt ||
        !matchedDevice.sessionToken ||
        matchedDevice.sessionToken !== user.sessionToken
      ) {
        throw new Error('Unauthorized');
      }
      await UserModel.updateOne(
        { _id: user.userId, 'devices.deviceId': user.deviceId },
        { $set: { 'devices.$.lastSeenAt': new Date() } },
      );
    }
    req.authUser = user;
    next();
  } catch {
    const error = new Error('Unauthorized') as Error & { statusCode?: number };
    error.statusCode = 401;
    next(error);
  }
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      throw new Error('Unauthorized');
    }
    const user = verifyToken(token);
    await connectMongo();
    const userDoc = await UserModel.findById(user.userId).lean();
    if (!userDoc || userDoc.status !== 'active') {
      throw new Error('Unauthorized');
    }
    if (user.deviceId) {
      const matchedDevice = Array.isArray(userDoc.devices)
        ? userDoc.devices.find((item: any) => String(item.deviceId) === user.deviceId)
        : null;
      if (
        !matchedDevice ||
        matchedDevice.revokedAt ||
        !matchedDevice.sessionToken ||
        matchedDevice.sessionToken !== user.sessionToken
      ) {
        throw new Error('Unauthorized');
      }
      await UserModel.updateOne(
        { _id: user.userId, 'devices.deviceId': user.deviceId },
        { $set: { 'devices.$.lastSeenAt': new Date() } },
      );
    }
    if (user.role !== 'admin') {
      throw new Error('Forbidden');
    }
    req.authUser = user;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unauthorized';
    const wrapped = new Error(message) as Error & { statusCode?: number };
    wrapped.statusCode = message === 'Forbidden' ? 403 : 401;
    next(wrapped);
  }
}
