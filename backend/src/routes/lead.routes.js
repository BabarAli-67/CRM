import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { blockReadOnlyAdmin } from '../middlewares/permission.middleware.js';
import {
  createLead,
  getMyLeads,
  getAssignedLeads,
  getCloserPool,
  getCloserClosedSales,
  sendLeadToCloserPool,
  claimLead,
  moveLeadToCst,
  getAllLeads,
  getLeadById,
  updateLead,
  disqualifyLead,
  setFollowUp,
  markFollowUpAlert,
  closeLead,
} from '../controllers/lead.controller.js';
import { closeLeadValidator } from '../utils/validators.util.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();

router.use(protect);

// Sales Agent lead desk — role key is `sales_agent` (not `agent` / `sales`)
router.post('/', restrictTo('sales_agent'), createLead);

router.get('/mine', restrictTo('sales_agent'), getMyLeads);

router.get('/assigned-to-me', restrictTo('closer'), getAssignedLeads);

router.get('/closer-pool', restrictTo('closer'), getCloserPool);

router.get('/closer-closed', restrictTo('closer'), getCloserClosedSales);

router.patch(
  '/:id/send-to-pool',
  restrictTo('sales_agent'),
  blockReadOnlyAdmin,
  sendLeadToCloserPool
);

router.patch(
  '/:id/claim',
  restrictTo('closer'),
  blockReadOnlyAdmin,
  claimLead
);

router.patch(
  '/:id/move-to-cst',
  restrictTo('closer', 'super_admin'),
  blockReadOnlyAdmin,
  moveLeadToCst
);

router.get(
  '/',
  restrictTo('super_admin', 'admin'),
  blockReadOnlyAdmin,
  getAllLeads
);

router.get(
  '/:id',
  restrictTo('sales_agent', 'closer', 'super_admin', 'admin', 'cst_manager', 'tech_team'),
  getLeadById
);

router.patch(
  '/:id/follow-up/mark-alert',
  restrictTo('sales_agent', 'closer', 'super_admin'),
  blockReadOnlyAdmin,
  markFollowUpAlert
);

router.patch(
  '/:id/follow-up',
  restrictTo('sales_agent', 'closer', 'super_admin'),
  blockReadOnlyAdmin,
  setFollowUp
);

router.patch(
  '/:id/close',
  restrictTo('sales_agent', 'closer'),
  closeLeadValidator,
  validate,
  closeLead
);

router.patch(
  '/:id/disqualify',
  restrictTo('sales_agent', 'closer', 'super_admin'),
  blockReadOnlyAdmin,
  disqualifyLead
);

router.patch(
  '/:id',
  restrictTo('sales_agent', 'closer', 'super_admin'),
  blockReadOnlyAdmin,
  updateLead
);

export default router;
