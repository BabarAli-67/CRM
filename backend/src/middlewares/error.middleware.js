import { ApiError } from '../utils/apiError.util.js';
import env from '../config/env.config.js';

const notFound = (req, res, next) => {
  const error = new ApiError(404, `Route not found - ${req.originalUrl}`);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: err.message,
    errors: err.errors || [],
    stack: env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

export { notFound, errorHandler };
