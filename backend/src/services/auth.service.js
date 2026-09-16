import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.util.js';
import { generateToken } from '../utils/token.util.js';

export const registerUser = async ({ fullName, email, phone, password }) => {
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const user = await User.create({
    fullName,
    email,
    phone,
    password,
  });

  return user.toSafeObject();
};

export const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
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
