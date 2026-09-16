import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import { registerUser, loginUser } from '../services/auth.service.js';
import env from '../config/env.config.js';

export const register = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password } = req.body;
  const user = await registerUser({ fullName, email, phone, password });

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { user },
        'Registration submitted. Your account is pending Admin approval.'
      )
    );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, token } = await loginUser({ email, password });

  res.cookie('token', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    // Cross-site cookies required for Vercel frontend ↔ Render API
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(200).json(new ApiResponse(200, { user, token }, 'Login successful'));
});
