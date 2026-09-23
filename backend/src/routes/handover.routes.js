import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { blockReadOnlyAdmin } from '../middlewares/permission.middleware.js';
import {
  getHandoverQueue,
  getTechPipeline,
  getTechList,
  assignHandover,
  getMyProjects,
  updateMilestone,
  reassignHandover,
} from '../controllers/handover.controller.js';

const router = Router();

router.use(protect);

router.get(
  '/queue',
  restrictTo('cst_manager', 'super_admin', 'admin'),
  blockReadOnlyAdmin,
  getHandoverQueue
);

router.get(
  '/tech-pipeline',
  restrictTo('cst_manager', 'super_admin', 'admin'),
  getTechPipeline
);

router.get('/tech-list', restrictTo('cst_manager'), getTechList);

router.get('/my-projects', restrictTo('tech_team'), getMyProjects);

router.patch('/:id/assign', restrictTo('cst_manager'), assignHandover);

router.patch('/:id/milestone', restrictTo('tech_team'), updateMilestone);

// super_admin writes; admin is allowlisted so blockReadOnlyAdmin returns the
// auditor-specific 403 rather than a generic role deny.
router.patch(
  '/:id/reassign',
  restrictTo('super_admin', 'admin'),
  blockReadOnlyAdmin,
  reassignHandover
);

export default router;
