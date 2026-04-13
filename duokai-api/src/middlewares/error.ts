import type { NextFunction, Request, Response } from 'express';

export function errorMiddleware(
  error: Error & { statusCode?: number; status?: number; exposeMessage?: boolean; type?: string },
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode = error.statusCode || error.status || 500;
  const exposeMessage = error.exposeMessage === true || statusCode < 500 || error.type === 'entity.too.large';
  const message =
    exposeMessage ? error.message || 'Request failed' : 'Internal Server Error';

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
