import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import {
  assignTeamToClient,
  createTechMember,
  forwardEscalation,
  getCstEscalations,
  getInternActivity,
  getTechHeadAssigned,
  getTechHeadBadges,
  getTechHeadClient,
  getTechHeadCompleted,
  getTechHeadQueue,
  getTechTeamAttendance,
  listTechTeam,
  updateClientOpsStatus,
  updateTechMember,
} from '../controllers/techHead.controller.js';

const router = Router();

router.use(protect, restrictTo('tech_head', 'super_admin'));

router.get('/badges', getTechHeadBadges);

router.get('/team', listTechTeam);
router.post('/team', createTechMember);
router.patch('/team/:id', updateTechMember);

/** Read-only Tech Department attendance (no approve/reject actions). */
router.get('/attendance', getTechTeamAttendance);

router.get('/queue', getTechHeadQueue);
router.get('/assigned', getTechHeadAssigned);
router.get('/completed', getTechHeadCompleted);
router.patch('/assign/:id', assignTeamToClient);

router.get('/escalations', getCstEscalations);
router.post('/escalations/:leadId/forward', forwardEscalation);
router.get('/intern-activity', getInternActivity);
router.get('/clients/:id', getTechHeadClient);
router.patch('/clients/:id/ops-status', updateClientOpsStatus);

export default router;
