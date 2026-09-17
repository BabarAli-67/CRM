import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { blockReadOnlyAdmin } from '../middlewares/permission.middleware.js';
import {
  createCallback,
  getMyCallbacks,
  getAllCallbacks,
  updateCallback,
  deleteCallback,
  markAlert,
  promoteCallback,
} from '../controllers/callback.controller.js';

const router = Router();

router.use(protect);

router.post('/', restrictTo('sales_agent'), createCallback);

router.get('/mine', restrictTo('sales_agent'), getMyCallbacks);

router.get(
  '/',
  restrictTo('super_admin', 'admin'),
  blockReadOnlyAdmin,
  getAllCallbacks
);

router.post(
  '/:id/promote',
  restrictTo('sales_agent'),
  promoteCallback
);

router.patch(
  '/:id/mark-alert',
  restrictTo('sales_agent', 'super_admin'),
  blockReadOnlyAdmin,
  markAlert
);

router.patch(
  '/:id',
  restrictTo('sales_agent', 'super_admin'),
  blockReadOnlyAdmin,
  updateCallback
);

router.delete(
  '/:id',
  restrictTo('sales_agent', 'super_admin'),
  blockReadOnlyAdmin,
  deleteCallback
);

export default router;
