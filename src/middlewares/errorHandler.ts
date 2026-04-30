import { Request, Response, NextFunction } from 'express';

// Centralized error handler
const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err);
  const statusCode = typeof err?.statusCode === "number" ? err.statusCode : 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal Server Error' : 'Bad Request',
    message: err.message || 'Something went wrong',
  });
};

export default errorHandler;
