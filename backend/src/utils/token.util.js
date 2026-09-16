import jwt from 'jsonwebtoken';
import env from '../config/env.config.js';

export const generateToken = (payload) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

export const verifyToken = (token) => jwt.verify(token, env.JWT_SECRET);
