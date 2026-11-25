import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import { ApiError } from '../utils/apiError.util.js';
import User from '../models/user.model.js';
import { usernameFromEmail } from '../utils/techTeam.util.js';

export const getPendingUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ status: 'pending' }).select('-password');

  res.status(200).json(new ApiResponse(200, { users }, 'Pending users retrieved'));
});

export const getAllUsers = asyncHandler(async (req, res) => {
  const filter = {
    // Super Admin is never an operational "system user" for listings/KPIs.
    role: { $ne: 'super_admin' },
  };

  if (req.query.role) {
    filter.role = req.query.role;
  }

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const users = await User.find(filter)
    .select('-password')
    .populate('assignedMentorId', 'fullName username jd')
    .sort({ createdAt: -1 });

  res.status(200).json(new ApiResponse(200, { users }, 'Users retrieved'));
});

/**
 * POST /admin/users — Super Admin bootstraps an account (e.g. Tech Head).
 */
export const createUser = asyncHandler(async (req, res) => {
  const {
    fullName,
    username,
    phone,
    email,
    password,
    role,
    jd,
    assignedMentorId,
  } = req.body;

  const name = String(fullName || '').trim();
  const contact = String(phone || '').trim();
  const pass = String(password || '');
  const nextRole = String(role || '').trim();

  if (!name) throw new ApiError(400, 'Full Name is required');
  if (!contact) throw new ApiError(400, 'Contact Number is required');
  if (pass.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }

  // Admin/Tech Head = .env only; Tech specialists = Tech Head Team Management only.
  const allowedRoles = ['sales_agent', 'closer', 'cst_manager'];
  if (!allowedRoles.includes(nextRole)) {
    throw new ApiError(
      403,
      'Forbidden: Admin (Auditor) and Tech Head are provisioned via .env; Tech specialists are created by Tech Head only'
    );
  }

  let mail =
    typeof email === 'string' && email.trim()
      ? email.trim().toLowerCase()
      : null;
  let uname =
    typeof username === 'string' && username.trim()
      ? username.trim().toLowerCase()
      : null;

  if (!uname) {
    if (!mail || !mail.includes('@')) {
      throw new ApiError(400, 'Username or a valid Email is required');
    }
    uname = usernameFromEmail(mail);
  }

  const clashUser = await User.findOne({
    $or: [{ username: uname }, ...(mail ? [{ email: mail }] : [])],
  });
  if (clashUser) {
    throw new ApiError(409, 'A user with this username or email already exists');
  }

  const user = await User.create({
    fullName: name,
    username: uname,
    phone: contact,
    email: mail || undefined,
    password: pass,
    role: nextRole,
    requestedRole: nextRole,
    status: 'approved',
    isAdmin: false,
  });

  const populated = await User.findById(user._id)
    .select('-password')
    .populate('assignedMentorId', 'fullName username jd');

  res
    .status(201)
    .json(new ApiResponse(201, { user: populated }, 'User created'));
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

  if (user.role === 'super_admin') {
    throw new ApiError(403, 'Super Admin accounts cannot be edited here');
  }

  const {
    fullName,
    username,
    phone,
    email,
    role,
    status,
    jd,
    assignedMentorId,
  } = req.body;

  if (fullName !== undefined) user.fullName = fullName;
  if (username !== undefined) {
    user.username = String(username).trim().toLowerCase();
  }
  if (phone !== undefined) user.phone = phone;
  if (email !== undefined) {
    user.email =
      email === null || email === ''
        ? null
        : String(email).trim().toLowerCase();
  }
  if (role !== undefined) {
    const nextRole = String(role).trim();
    // Do not allow promoting into env-only or Tech Head–owned roles via SA roster.
    if (['admin', 'tech_head', 'tech_team', 'super_admin'].includes(nextRole)) {
      throw new ApiError(
        403,
        'Forbidden: cannot assign Admin, Tech Head, or Tech Team via this endpoint'
      );
    }
    if (!['sales_agent', 'closer', 'cst_manager'].includes(nextRole)) {
      throw new ApiError(400, 'Invalid role');
    }
    user.role = nextRole;
    user.jd = undefined;
    user.assignedMentorId = undefined;
  }

  // Deactivate / reactivate (rejected = deactivated for login)
  if (status !== undefined) {
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      throw new ApiError(400, 'status must be approved, rejected, or pending');
    }
    user.status = status;
  }

  // JD / mentor for Tech Team remain owned by Tech Head Team Management only.
  if (jd !== undefined || assignedMentorId !== undefined) {
    if (user.role !== 'tech_team') {
      throw new ApiError(
        400,
        'jd / mentor apply only to Tech Team members (manage via Tech Head)'
      );
    }
  }

  await user.save();

  const populated = await User.findById(user._id)
    .select('-password')
    .populate('assignedMentorId', 'fullName username jd');

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { user: populated },
        'User profile updated successfully'
      )
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
