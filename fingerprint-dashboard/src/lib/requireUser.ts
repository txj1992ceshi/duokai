import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

export function getTokenFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }
  return authHeader.slice(7);
}

export function requireUser(req: NextRequest) {
  const token = getTokenFromRequest(req);
  if (!token) {
    throw new Error('Unauthorized');
  }
  return verifyToken(token);
}
