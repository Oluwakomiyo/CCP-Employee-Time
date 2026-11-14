const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code ?? DEFAULT_CODES[statusCode] ?? 'ERROR';
    this.isOperational = true;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg: string, details?: unknown) {
    return new AppError(msg, 400, details);
  }

  static unauthorized(msg = 'Authentication required') {
    return new AppError(msg, 401);
  }

  static forbidden(msg = 'You do not have permission to access this resource.') {
    return new AppError(msg, 403);
  }

  static notFound(msg = 'Resource not found') {
    return new AppError(msg, 404);
  }

  static conflict(msg: string, code?: string) {
    return new AppError(msg, 409, undefined, code);
  }
}
