import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { blockReadOnlyAdmin } from '../middlewares/permission.middleware.js';
import { getMonthlyReport } from '../controllers/report.controller.js';

const router = Router();

router.use(protect);

router.get(
  '/monthly',
  restrictTo('super_admin', 'admin'),
  blockReadOnlyAdmin,
  getMonthlyReport
);

export default router;
