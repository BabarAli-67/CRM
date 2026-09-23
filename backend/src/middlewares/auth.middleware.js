import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { verifyToken } from '../utils/token.util.js';
import User from '../models/user.model.js';

/** Map legacy / display aliases to canonical role keys. */
export const normalizeRole = (role) => {
  const raw = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const aliases = {
    agent: 'sales_agent',
    sales: 'sales_agent',
    salesagent: 'sales_agent',
    sales_agent: 'sales_agent',
    auditor: 'admin',
    tech: 'tech_team',
    techteam: 'tech_team',
    cst: 'cst_manager',
    cstmanager: 'cst_manager',
  };

  return aliases[raw] || raw;
};

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
  // Role allowlist only — Super Admin / Auditor must not bypass department-only
  // routes (e.g. personal attendance, lead create) via isAdmin.
  const userRole = normalizeRole(req.user?.role);
  const allowed = allowedRoles.map(normalizeRole);

  if (!allowed.includes(userRole)) {
    throw new ApiError(403, 'You do not have permission to access this resource');
  }

  next();
};
