import { body } from 'express-validator';

export const registerValidator = [
  body('fullName').notEmpty().withMessage('Full name is required').trim(),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('phone')
    .notEmpty()
    .withMessage('Phone is required')
    .trim()
    .matches(/^[+\d][\d\s()-]{6,19}$/)
    .withMessage('Valid phone number is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
];

export const loginValidator = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const approveUserValidator = [
  body('role')
    .isIn(['admin', 'sales_agent', 'closer', 'cst_manager', 'tech_team'])
    .withMessage('Role must be one of: admin, sales_agent, closer, cst_manager, tech_team'),
];

export const updateUserValidator = [
  body('fullName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Full name cannot be empty'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('phone').optional().trim(),
  body('role')
    .optional()
    .isIn(['admin', 'sales_agent', 'closer', 'cst_manager', 'tech_team'])
    .withMessage('Role must be one of: admin, sales_agent, closer, cst_manager, tech_team'),
];
