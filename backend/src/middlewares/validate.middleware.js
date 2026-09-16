import { validationResult } from 'express-validator';
import { ApiError } from '../utils/apiError.util.js';

export const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    throw new ApiError(422, 'Validation failed', errors.array());
  }

  next();
};
