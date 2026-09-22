import rateLimit from 'express-rate-limit';
import env from '../config/env.config.js';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  // Dev/test suites register+login many times; production keeps the tight cap.
  skip: () => env.NODE_ENV === 'development' || env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Too many attempts, please try again later.',
  },
});
