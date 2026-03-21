import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../lib/auth.js';

type JwtUser = {
  userId: string;
  email: string;
  role: string;
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

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      throw new Error('Unauthorized');
    }
    req.authUser = verifyToken(token);
    next();
  } catch {
    const error = new Error('Unauthorized') as Error & { statusCode?: number };
    error.statusCode = 401;
    next(error);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      throw new Error('Unauthorized');
    }
    const user = verifyToken(token);
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
