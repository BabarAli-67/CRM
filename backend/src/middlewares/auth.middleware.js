import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { verifyToken } from '../utils/token.util.js';
import User from '../models/user.model.js';

export const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    throw new ApiError(401, 'Not authorized, no token provided');
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    throw new ApiError(401, 'Not authorized, token invalid or expired');
  }

  const user = await User.findById(decoded.id);

  if (!user) {
    throw new ApiError(401, 'Not authorized, token invalid or expired');
  }

  req.user = user;
  next();
});

export const restrictTo = (...allowedRoles) => (req, res, next) => {
  if (req.user.isAdmin) {
    return next();
  }

  if (!allowedRoles.includes(req.user.role)) {
    throw new ApiError(403, 'You do not have permission to access this resource');
  }

  next();
};
