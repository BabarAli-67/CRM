import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { getMyClosedCount } from '../controllers/stats.controller.js';

const router = Router();

router.use(protect);

router.get(
  '/my-closed-count',
  restrictTo('sales_agent', 'closer'),
  getMyClosedCount
);

export default router;
