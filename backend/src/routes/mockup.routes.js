import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { ApiError } from '../utils/apiError.util.js';
import {
  prepareMockupUploadFolder,
  mockupCreateUpload,
} from '../middlewares/mockupUpload.middleware.js';
import {
  assignMockup,
  createMockupRequest,
  forwardMockupToSender,
  getMockupBadges,
  listAssignedMockups,
  listMyMockups,
  listTechHeadMockups,
  serveMockupFile,
  submitMockupUrl,
} from '../controllers/mockup.controller.js';

const router = Router();

router.use(protect);

const runMockupCreateUpload = (req, res, next) => {
  mockupCreateUpload(req, res, (err) => {
    if (!err) return next();
    return next(new ApiError(400, err.message || 'Invalid mockup upload'));
  });
};

router.get(
  '/badges',
  restrictTo('tech_head', 'tech_team', 'super_admin', 'closer', 'cst_manager'),
  getMockupBadges
);

router.post(
  '/',
  restrictTo('closer', 'cst_manager'),
  prepareMockupUploadFolder,
  runMockupCreateUpload,
  createMockupRequest
);

router.get('/mine', restrictTo('closer', 'cst_manager'), listMyMockups);

router.get(
  '/tech-head',
  restrictTo('tech_head', 'super_admin'),
  listTechHeadMockups
);

router.get('/assigned', restrictTo('tech_team'), listAssignedMockups);

router.patch(
  '/:id/assign',
  restrictTo('tech_head', 'super_admin'),
  assignMockup
);

router.patch('/:id/submit-url', restrictTo('tech_team'), submitMockupUrl);

router.patch(
  '/:id/forward',
  restrictTo('tech_head', 'super_admin'),
  forwardMockupToSender
);

router.get(
  '/:id/files/:field',
  restrictTo(
    'closer',
    'cst_manager',
    'tech_head',
    'tech_team',
    'super_admin'
  ),
  serveMockupFile
);

export default router;
