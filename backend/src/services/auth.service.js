import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.util.js';
import { generateToken } from '../utils/token.util.js';

const normalizeUsername = (username) =>
  String(username || '')
    .trim()
    .toLowerCase();

export const registerUser = async ({
  fullName,
  username,
  phone,
  password,
  requestedRole,
}) => {
  const normalized = normalizeUsername(username);

  const existingUser = await User.findOne({ username: normalized });

  if (existingUser) {
    throw new ApiError(409, 'An account with this username already exists');
  }

  const user = await User.create({
    fullName,
    username: normalized,
    phone,
    password,
    requestedRole: requestedRole || null,
  });

  return user.toSafeObject();
};

export const loginUser = async ({ username, password }) => {
  const normalized = normalizeUsername(username);
  const user = await User.findOne({ username: normalized }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid username or password');
  }

  if (user.status === 'pending') {
    throw new ApiError(
      403,
      'Your registration is awaiting Admin verification. Please check back later.'
    );
  }

  if (user.status === 'rejected') {
    throw new ApiError(
      403,
      'Your registration request was not approved. Contact your administrator.'
    );
  }

  const token = generateToken({
    id: user._id,
    role: user.role,
    isAdmin: user.isAdmin,
  });

  return {
    user: user.toSafeObject(),
    token,
  };
};
