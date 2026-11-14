import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';

const send = (res: Response, status: number, code: string, message: string, details?: unknown) =>
  res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });

export const notFoundHandler = (req: Request, res: Response) =>
  send(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return send(
      res,
      400,
      'VALIDATION_ERROR',
      'Invalid request data',
      err.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
    );
  }

  if (err instanceof AppError) {
    return send(res, err.statusCode, err.code, err.message, err.details);
  }

  // Malformed JSON body from express.json()
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    return send(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return send(res, 409, 'CONFLICT', 'A record with these details already exists');
    if (err.code === 'P2025') return send(res, 404, 'NOT_FOUND', 'Resource not found');
    if (err.code === 'P2003') return send(res, 400, 'INVALID_REFERENCE', 'A referenced record does not exist');
  }

  console.error('[Unhandled Server Error]:', err);
  return send(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected system error occurred.');
};
