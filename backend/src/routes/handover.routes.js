import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { blockReadOnlyAdmin } from '../middlewares/permission.middleware.js';
import monthlyReportUpload from '../middlewares/monthlyReportUpload.middleware.js';
import {
  getHandoverQueue,
  getTechPipeline,
  getTechList,
  markClientOnboarded,
  setActivationCall,
  setWelcomeEmail,
  getRetentionReminders,
  setRetention,
  markRetentionAlert,
  markRetentionDone,
  setServiceScope,
  saveClientPortfolio,
  saveLivePortfolio,
  uploadMonthlyReport,
  serveMonthlyReport,
  updateChangeRequestStatus,
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

router.get(
  '/retention-reminders',
  restrictTo('cst_manager'),
  getRetentionReminders
);

router.get('/my-projects', restrictTo('tech_team'), getMyProjects);

router.patch(
  '/:id/onboard',
  restrictTo('cst_manager'),
  markClientOnboarded
);

router.patch(
  '/:id/activation-call',
  restrictTo('cst_manager'),
  setActivationCall
);

router.patch(
  '/:id/welcome-email',
  restrictTo('cst_manager'),
  setWelcomeEmail
);

router.patch('/:id/retention', restrictTo('cst_manager'), setRetention);

router.patch(
  '/:id/retention/alert',
  restrictTo('cst_manager'),
  markRetentionAlert
);

router.patch(
  '/:id/retention/done',
  restrictTo('cst_manager'),
  markRetentionDone
);

router.patch(
  '/:id/service-scope',
  restrictTo('cst_manager'),
  setServiceScope
);

router.patch(
  '/:id/portfolio',
  restrictTo('cst_manager'),
  saveClientPortfolio
);

router.patch(
  '/:id/live-portfolio',
  restrictTo('cst_manager', 'tech_team', 'super_admin'),
  saveLivePortfolio
);

router.post(
  '/:id/monthly-reports',
  restrictTo('tech_team', 'cst_manager', 'super_admin'),
  (req, res, next) => {
    monthlyReportUpload.single('report')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'Failed to upload PDF',
        });
      }
      return next();
    });
  },
  uploadMonthlyReport
);

router.get(
  '/:id/monthly-reports/:filename',
  restrictTo('cst_manager', 'tech_team', 'super_admin', 'admin'),
  serveMonthlyReport
);

router.patch(
  '/:id/change-requests/:requestId/status',
  restrictTo('tech_team', 'cst_manager', 'super_admin'),
  updateChangeRequestStatus
);

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
