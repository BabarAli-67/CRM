import { ApiError } from '../utils/apiError.util.js';

export const blockReadOnlyAdmin = (req, res, next) => {
  if (req.user.role === 'admin' && !['GET', 'HEAD'].includes(req.method)) {
    throw new ApiError(
      403,
      'Your account has read-only access. Contact a Super Admin to make changes.'
    );
  }

  next();
};
