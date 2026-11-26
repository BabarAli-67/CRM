import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { blockReadOnlyAdmin } from '../middlewares/permission.middleware.js';
import monthlyReportUpload from '../middlewares/monthlyReportUpload.middleware.js';
import clientCommentUpload from '../middlewares/clientCommentUpload.middleware.js';
import cstHandoverUpload from '../middlewares/cstHandoverUpload.middleware.js';
import {
  getHandoverQueue,
  getTechPipeline,
  getCstClients,
  setCstClientState,
  getTechList,
  markClientOnboarded,
  setActivationCall,
  setWelcomeEmail,
  getRetentionReminders,
  setRetention,
  markRetentionAlert,
  markRetentionDone,
  markRetentionPaid,
  setServiceScope,
  saveClientPortfolio,
  addClientUpsell,
  updateClientBalances,
  updateClientSignedDocument,
  serveClientSignedDocument,
  addClientComment,
  markClientCommentsRead,
  getCommentNotifications,
  serveClientCommentAttachment,
  saveLivePortfolio,
  uploadMonthlyReport,
  serveMonthlyReport,
  updateChangeRequestStatus,
  assignHandover,
  getMyProjects,
  getMyCompletedProjects,
  getMyPriorityProjects,
  getMyTaskStats,
  confirmKeywordsRanked,
  saveDevelopedWebsiteUrl,
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

router.get(
  '/cst-clients',
  restrictTo('cst_manager', 'super_admin', 'admin'),
  getCstClients
);

router.patch(
  '/:id/cst-client-state',
  restrictTo('cst_manager'),
  setCstClientState
);

router.get('/tech-list', restrictTo('cst_manager'), getTechList);

router.get(
  '/retention-reminders',
  restrictTo('cst_manager'),
  getRetentionReminders
);

router.get(
  '/my-projects',
  restrictTo('tech_team'),
  getMyProjects
);

router.get(
  '/my-projects/completed',
  restrictTo('tech_team'),
  getMyCompletedProjects
);

router.get(
  '/my-projects/priority',
  restrictTo('tech_team'),
  getMyPriorityProjects
);

router.get(
  '/my-task-stats',
  restrictTo('tech_team'),
  getMyTaskStats
);

router.get(
  '/comment-notifications',
  restrictTo('cst_manager', 'tech_team', 'tech_head', 'super_admin'),
  getCommentNotifications
);

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
  '/:id/retention/paid',
  restrictTo('cst_manager'),
  markRetentionPaid
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
  '/:id/balances',
  restrictTo('cst_manager', 'super_admin'),
  updateClientBalances
);

router.patch(
  '/:id/signed-document',
  restrictTo('cst_manager', 'super_admin'),
  (req, res, next) => {
    cstHandoverUpload.single('signedDocument')(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'Failed to upload signed document',
        });
      }
      return next();
    });
  },
  updateClientSignedDocument
);

router.get(
  '/:id/signed-document',
  restrictTo('cst_manager', 'super_admin', 'admin', 'tech_team'),
  serveClientSignedDocument
);

router.post(
  '/:id/upsell',
  restrictTo('cst_manager'),
  addClientUpsell
);

router.post(
  '/:id/comments',
  restrictTo('cst_manager', 'tech_team', 'tech_head', 'super_admin'),
  (req, res, next) => {
    clientCommentUpload.array('files', 5)(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'Failed to upload attachment',
        });
      }
      return next();
    });
  },
  addClientComment
);

router.patch(
  '/:id/comments/read',
  restrictTo('cst_manager', 'tech_team', 'tech_head', 'super_admin'),
  markClientCommentsRead
);

router.get(
  '/:id/comments/:commentId/files/:filename',
  restrictTo('cst_manager', 'tech_team', 'tech_head', 'super_admin', 'admin'),
  serveClientCommentAttachment
);

router.patch(
  '/:id/live-portfolio',
  restrictTo('cst_manager', 'tech_team', 'tech_head', 'super_admin'),
  saveLivePortfolio
);

router.post(
  '/:id/monthly-reports',
  restrictTo('tech_team', 'cst_manager', 'tech_head', 'super_admin'),
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

// Legacy single-assign kept for Super Admin overrides; day-to-day assign is Tech Head.
router.patch(
  '/:id/assign',
  restrictTo('tech_head', 'super_admin'),
  assignHandover
);

router.patch(
  '/:id/milestone',
  restrictTo('tech_team', 'tech_head', 'super_admin'),
  updateMilestone
);

router.patch(
  '/:id/developed-website-url',
  restrictTo('tech_team', 'tech_head', 'super_admin'),
  saveDevelopedWebsiteUrl
);

router.patch(
  '/:id/confirm-keywords-ranked',
  restrictTo('tech_team', 'tech_head', 'super_admin'),
  confirmKeywordsRanked
);

// super_admin writes; admin is allowlisted so blockReadOnlyAdmin returns the
// auditor-specific 403 rather than a generic role deny.
router.patch(
  '/:id/reassign',
  restrictTo('super_admin', 'admin'),
  blockReadOnlyAdmin,
  reassignHandover
);

export default router;
