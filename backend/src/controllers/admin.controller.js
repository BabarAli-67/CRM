import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import { ApiError } from '../utils/apiError.util.js';
import User from '../models/user.model.js';

export const getPendingUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ status: 'pending' }).select('-password');

  res.status(200).json(new ApiResponse(200, { users }, 'Pending users retrieved'));
});

export const getAllUsers = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.role) {
    filter.role = req.query.role;
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const users = await User.find(filter).select('-password').sort({ createdAt: -1 });

  res.status(200).json(new ApiResponse(200, { users }, 'Users retrieved'));
});

export const approveUser = asyncHandler(async (req, res) => {
  const { id: userId } = req.params;
  const { role } = req.body;

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (user.status !== 'pending') {
    throw new ApiError(400, 'Only pending users can be approved');
  }

  user.role = role;
  user.status = 'approved';
  await user.save();

  res
    .status(200)
    .json(
      new ApiResponse(200, { user: user.toSafeObject() }, 'User approved and activated successfully')
    );
});

export const rejectUser = asyncHandler(async (req, res) => {
  const { id: userId } = req.params;

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  user.status = 'rejected';
  await user.save();

  res
    .status(200)
    .json(new ApiResponse(200, { user: user.toSafeObject() }, 'User rejected successfully'));
});

export const resetUserPassword = asyncHandler(async (req, res) => {
  const { id: userId } = req.params;
  const { newPassword } = req.body;

  const user = await User.findById(userId).select('+password');

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  user.password = newPassword;
  await user.save();

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {},
        'Password reset successfully. The employee can now log in with the new password.'
      )
    );
});

export const updateUserProfile = asyncHandler(async (req, res) => {
  const { id: userId } = req.params;

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const { fullName, email, phone, role } = req.body;

  if (fullName !== undefined) user.fullName = fullName;
  if (email !== undefined) user.email = email;
  if (phone !== undefined) user.phone = phone;
  if (role !== undefined) user.role = role;

  await user.save();

  res
    .status(200)
    .json(
      new ApiResponse(200, { user: user.toSafeObject() }, 'User profile updated successfully')
    );
});

export const deleteUser = asyncHandler(async (req, res) => {
  const { id: userId } = req.params;

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (user.role === 'super_admin') {
    throw new ApiError(403, 'Super Admin accounts cannot be deleted');
  }

  await user.deleteOne();

  res.status(200).json(new ApiResponse(200, {}, 'User deleted successfully'));
});
