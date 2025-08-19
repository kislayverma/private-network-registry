import { Request, Response, NextFunction } from 'express';

interface CustomError extends Error {
  code?: string;
}

export function errorHandler(err: CustomError, req: Request, res: Response, next: NextFunction): void {
  console.error('Error:', err);

  // Default error
  let status = 500;
  let message = 'Internal server error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    message = err.message;
  } else if (err.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized';
  } else if (err.code === 'SQLITE_CONSTRAINT') {
    status = 409;
    message = 'Resource already exists';
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && status === 500) {
    message = 'Internal server error';
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}