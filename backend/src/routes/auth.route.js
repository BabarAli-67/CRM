import { Router } from 'express';
import { register, login, getMe } from '../controllers/auth.controller.js';
import { registerValidator, loginValidator } from '../utils/validators.util.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authLimiter } from '../middlewares/rateLimiter.middleware.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', authLimiter, registerValidator, validate, register);
router.post('/login', authLimiter, loginValidator, validate, login);
router.get('/me', protect, getMe);

export default router;
