import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { blockReadOnlyAdmin } from '../middlewares/permission.middleware.js';
import {
  getPendingUsers,
  getAllUsers,
  approveUser,
  rejectUser,
  resetUserPassword,
  updateUserProfile,
  deleteUser,
} from '../controllers/admin.controller.js';
import { approveUserValidator, updateUserValidator } from '../utils/validators.util.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();

router.use(protect, restrictTo('super_admin', 'admin'), blockReadOnlyAdmin);

router.get('/users/pending', getPendingUsers);
router.patch('/users/:id/approve', approveUserValidator, validate, approveUser);
router.patch('/users/:id/reject', rejectUser);
router.patch('/users/:id/reset-password', resetUserPassword);
router.get('/users', getAllUsers);
router.patch('/users/:id', restrictTo('super_admin'), updateUserValidator, validate, updateUserProfile);
router.delete('/users/:id', restrictTo('super_admin'), deleteUser);

export default router;
