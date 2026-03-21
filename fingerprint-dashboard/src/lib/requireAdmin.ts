import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/requireUser';

export function requireAdmin(req: NextRequest) {
  const user = requireUser(req);

  if (user.role !== 'admin') {
    throw new Error('Forbidden');
  }

  return user;
}
