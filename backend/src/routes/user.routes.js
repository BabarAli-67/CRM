import { Router } from 'express';
import { protect, restrictTo } from '../middlewares/auth.middleware.js';
import { listUsers } from '../controllers/user.controller.js';

const router = Router();

router.use(protect);

router.get(
  '/',
  restrictTo(
    'sales_agent',
    'closer',
    'super_admin',
    'admin',
    'cst_manager',
    'tech_team'
  ),
  listUsers
);

export default router;
