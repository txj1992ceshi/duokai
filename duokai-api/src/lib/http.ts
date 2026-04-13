import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  statusCode: number;
  exposeMessage: boolean;

  constructor(statusCode: number, message: string, options: { exposeMessage?: boolean } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.exposeMessage = options.exposeMessage ?? statusCode < 500;
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

export function getErrorMessage(error: unknown, fallback = 'Request failed') {
  return error instanceof Error ? error.message : fallback;
}
