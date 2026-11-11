import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { blockReadOnlyAdmin } from '../middlewares/permission.middleware.js';
import {
  createLead,
  getMyLeads,
  getAssignedLeads,
  getCloserClosedSales,
  getCloserDisqualifiedLeads,
  getCloserTeamAgents,
  getMyClosedSales,
  handLeadToCloser,
  moveLeadToCst,
  getAllLeads,
  getLeadById,
  updateLead,
  disqualifyLead,
  deleteLeadPermanently,
  setFollowUp,
  markFollowUpAlert,
  closeLead,
} from '../controllers/lead.controller.js';
import { closeLeadValidator } from '../utils/validators.util.js';
import { validate } from '../middlewares/validate.middleware.js';
import cstHandoverUpload from '../middlewares/cstHandoverUpload.middleware.js';

const router = Router();

router.use(protect);

// Sales Agent lead desk — role key is `sales_agent` (not `agent` / `sales`)
router.post('/', restrictTo('sales_agent'), createLead);

router.get('/mine', restrictTo('sales_agent'), getMyLeads);

router.get('/mine/closed', restrictTo('sales_agent'), getMyClosedSales);

router.get('/assigned-to-me', restrictTo('closer'), getAssignedLeads);

router.get('/closer-closed', restrictTo('closer'), getCloserClosedSales);

router.get(
  '/closer-disqualified',
  restrictTo('closer'),
  getCloserDisqualifiedLeads
);

router.get('/closer-team', restrictTo('closer'), getCloserTeamAgents);

router.patch(
  '/:id/hand-to-closer',
  restrictTo('sales_agent'),
  blockReadOnlyAdmin,
  handLeadToCloser
);

router.patch(
  '/:id/move-to-cst',
  restrictTo('closer', 'super_admin'),
  blockReadOnlyAdmin,
  (req, res, next) => {
    cstHandoverUpload.single('signedDocument')(req, res, (err) => {
      if (err) {
        return next(
          err.statusCode
            ? err
            : Object.assign(err, { statusCode: 400 })
        );
      }
      return next();
    });
  },
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

router.delete(
  '/:id',
  restrictTo('closer', 'super_admin'),
  blockReadOnlyAdmin,
  deleteLeadPermanently
);

router.patch(
  '/:id',
  restrictTo('sales_agent', 'closer', 'super_admin'),
  blockReadOnlyAdmin,
  updateLead
);

export default router;
