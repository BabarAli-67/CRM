import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { blockReadOnlyAdmin } from '../middlewares/permission.middleware.js';
import {
  getTodayStatus,
  markCheckIn,
  requestLate,
  markCheckOut,
  requestExtend,
  getHistory,
  getLateQueue,
  getGrid,
  exportGrid,
  approveAttendance,
  overrideForceAbsent,
} from '../controllers/attendance.controller.js';
import {
  lateRequestValidator,
  approveAttendanceValidator,
  forceAbsentValidator,
} from '../utils/validators.util.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();

// Department personal check-in/out — Super Admin / Auditor get 403 by design
const personalRouter = Router();
personalRouter.use(
  protect,
  restrictTo('sales_agent', 'closer', 'cst_manager', 'tech_team')
);
personalRouter.get('/today', getTodayStatus);
personalRouter.get('/history', getHistory);
personalRouter.post('/check-in', markCheckIn);
personalRouter.post('/late-request', lateRequestValidator, validate, requestLate);
personalRouter.post('/check-out', markCheckOut);
personalRouter.post('/extend', requestExtend);

// Admin manage tier — both roles can read; only super_admin can write
router.use('/manage', protect, restrictTo('super_admin', 'admin'), blockReadOnlyAdmin);
router.get('/manage/late-requests', getLateQueue);
router.get('/manage/grid', getGrid);
router.get('/manage/export', exportGrid);
router.patch(
  '/manage/:id/approve',
  approveAttendanceValidator,
  validate,
  approveAttendance
);
router.patch(
  '/manage/:id/force-absent',
  forceAbsentValidator,
  validate,
  overrideForceAbsent
);

// Mount personal after /manage so the dept role guard cannot block admin paths
router.use(personalRouter);

export default router;
