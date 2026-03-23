import type { Request } from 'express';

export function getRuntimeUrl() {
  return (process.env.RUNTIME_URL || 'http://127.0.0.1:3101').replace(/\/$/, '');
}

export function getRuntimeApiKey() {
  return process.env.RUNTIME_API_KEY || '';
}

export function getForwardAuthHeaders(req: Request) {
  const authorization = req.header('authorization');
  return authorization ? { authorization } : {};
}
