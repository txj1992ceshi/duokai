import type { NextFunction, Request, Response } from 'express';

export function errorMiddleware(
  error: Error & { statusCode?: number },
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode = error.statusCode || 500;
  const message =
    statusCode === 500 ? 'Internal Server Error' : error.message || 'Request failed';

  if (statusCode >= 500) {
    console.error('[duokai-api]', {
      method: req.method,
      path: req.originalUrl || req.url,
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: message,
  });
}
