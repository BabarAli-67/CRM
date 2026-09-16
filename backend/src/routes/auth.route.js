import { Router } from 'express';
import { register, login } from '../controllers/auth.controller.js';
import { registerValidator, loginValidator } from '../utils/validators.util.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

router.post('/register', authLimiter, registerValidator, validate, register);
router.post('/login', authLimiter, loginValidator, validate, login);

export default router;
