import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { getShift, updateShift } from '../controllers/shift.controller.js';
import { shiftUpdateValidator } from '../utils/validators.util.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();

router.use(protect);

router.get('/', getShift);
router.patch('/', restrictTo('super_admin'), shiftUpdateValidator, validate, updateShift);

export default router;
