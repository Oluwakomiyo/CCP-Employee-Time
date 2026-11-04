export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
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

  static forbidden(msg = 'Access denied: Insufficient permissions') {
    return new AppError(msg, 403);
  }

  static notFound(msg = 'Resource not found') {
    return new AppError(msg, 404);
  }

  static conflict(msg: string) {
    return new AppError(msg, 409);
  }
}