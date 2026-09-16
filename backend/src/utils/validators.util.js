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

export const shiftUpdateValidator = [
  body('startTime')
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('startTime must be in HH:mm format (00:00–23:59)'),
  body('endTime')
    .optional()
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('endTime must be in HH:mm format (00:00–23:59)'),
  body('weekendDays')
    .optional()
    .isArray()
    .withMessage('weekendDays must be an array'),
  body('weekendDays.*')
    .optional()
    .isInt({ min: 0, max: 6 })
    .withMessage('Each weekendDays entry must be an integer between 0 and 6'),
];

export const lateRequestValidator = [
  body('reason')
    .notEmpty()
    .withMessage('Reason is required')
    .trim()
    .isLength({ min: 5, max: 300 })
    .withMessage('Reason must be between 5 and 300 characters'),
];

export const approveAttendanceValidator = [
  body('decision')
    .isIn(['present', 'late'])
    .withMessage("decision must be 'present' or 'late'"),
];

export const forceAbsentValidator = [
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Reason must be at most 300 characters'),
];
