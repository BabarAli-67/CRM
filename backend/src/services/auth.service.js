import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.util.js';
import { generateToken } from '../utils/token.util.js';
import { resolveTechWorkspaceJd } from '../utils/techTeam.util.js';

/** Session payload with Intern mentor jd populated for workspace routing. */
export const toSessionUser = async (userDoc) => {
  const obj =
    typeof userDoc.toSafeObject === 'function'
      ? userDoc.toSafeObject()
      : { ...userDoc };
  if (
    obj.role === 'tech_team' &&
    obj.jd === 'Intern' &&
    obj.assignedMentorId
  ) {
    const mentorId =
      typeof obj.assignedMentorId === 'object'
        ? obj.assignedMentorId._id || obj.assignedMentorId
        : obj.assignedMentorId;
    const mentor = await User.findById(mentorId).select(
      'fullName username jd'
    );
    if (mentor) {
      obj.assignedMentorId = {
        _id: mentor._id,
        fullName: mentor.fullName,
        username: mentor.username,
        jd: mentor.jd,
      };
    }
  }
  obj.workspaceJd = resolveTechWorkspaceJd(obj);
  return obj;
};

const normalizeUsername = (username) =>
  String(username || '')
    .trim()
    .toLowerCase();

/** Roles that must never be requested via public /register. */
const FORBIDDEN_PUBLIC_ROLES = new Set([
  'admin',
  'auditor',
  'super_admin',
  'tech_head',
  'tech',
  'tech_team',
]);

const PUBLIC_REGISTER_ROLES = new Set([
  'sales_agent',
  'closer',
  'cst_manager',
]);

export const registerUser = async ({
  fullName,
  username,
  phone,
  password,
  requestedRole,
}) => {
  const normalized = normalizeUsername(username);
  const roleKey = String(requestedRole || '')
    .trim()
    .toLowerCase();

  // Hard-lock: reject privileged / Tech roles even if validation was bypassed.
  if (!roleKey || FORBIDDEN_PUBLIC_ROLES.has(roleKey) || !PUBLIC_REGISTER_ROLES.has(roleKey)) {
    throw new ApiError(
      403,
      'Forbidden: Admin (Auditor), Tech Head, and Tech specialists cannot self-register. Contact your administrator.'
    );
  }

  const existingUser = await User.findOne({ username: normalized });

  if (existingUser) {
    throw new ApiError(409, 'An account with this username already exists');
  }

  const user = await User.create({
    fullName,
    username: normalized,
    phone,
    password,
    requestedRole: roleKey,
  });

  return user.toSafeObject();
};

export const loginUser = async ({ username, password }) => {
  const normalized = normalizeUsername(username);
  // Match login identifier against username (case-insensitive) or email.
  const user = await User.findOne({
    $or: [{ username: normalized }, { email: normalized }],
  }).select('+password');

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
    user: await toSessionUser(user),
    token,
  };
};
