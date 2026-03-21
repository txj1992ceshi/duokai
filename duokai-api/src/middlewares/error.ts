import type { NextFunction, Request, Response } from 'express';

export function errorMiddleware(
  error: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode = error.statusCode || 500;
  const message =
    statusCode === 500 ? 'Internal Server Error' : error.message || 'Request failed';

  if (statusCode >= 500) {
    console.error('[duokai-api]', error);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
  });
}
