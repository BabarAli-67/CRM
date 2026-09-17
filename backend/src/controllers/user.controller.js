import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import User from '../models/user.model.js';

/**
 * Lightweight user directory for dropdowns (e.g. closer assignment).
 * Defaults to approved users; supports ?role= and ?status= filters.
 */
export const listUsers = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.role) {
    filter.role = req.query.role;
  }

  filter.status = req.query.status || 'approved';

  const users = await User.find(filter)
    .select('fullName email role status')
    .sort({ fullName: 1 });

  res
    .status(200)
    .json(new ApiResponse(200, { users }, 'Users retrieved'));
});
