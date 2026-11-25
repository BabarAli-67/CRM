import { body } from 'express-validator';

export const registerValidator = [
  body('fullName').notEmpty().withMessage('Full name is required').trim(),
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 32 })
    .withMessage('Username must be 3–32 characters')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage(
      'Username may only contain letters, numbers, dots, underscores, or hyphens'
    )
    .customSanitizer((value) => String(value).toLowerCase()),
  body('phone')
    .notEmpty()
    .withMessage('Phone is required')
    .trim()
    .matches(/^[+\d][\d\s()-]{6,19}$/)
    .withMessage('Valid phone number is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('confirmPassword')
    .optional()
    .custom((value, { req }) => {
      if (value !== undefined && value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  // Public registration: Sales Agent / Closer / CST Manager only.
  // Privileged roles (admin, tech_head, tech_team, super_admin) are rejected in auth.service with 403.
  body('requestedRole')
    .optional()
    .isIn(['sales_agent', 'closer', 'cst_manager'])
    .withMessage(
      'Public registration is limited to Sales Agent, Closer, or CST Manager'
    ),
  body('role')
    .optional()
    .isIn(['sales_agent', 'closer', 'cst_manager'])
    .withMessage(
      'Public registration is limited to Sales Agent, Closer, or CST Manager'
    ),
];

export const loginValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .customSanitizer((value) => String(value).toLowerCase()),
  body('password').notEmpty().withMessage('Password is required'),
];

export const approveUserValidator = [
  // Pending public registrants may only be activated as operational desk roles.
  // Admin (Auditor) + Tech Head are env-provisioned; Tech specialists via Tech Head.
  body('role')
    .isIn(['sales_agent', 'closer', 'cst_manager'])
    .withMessage(
      'Role must be one of: sales_agent, closer, cst_manager'
    ),
];

export const updateUserValidator = [
  body('fullName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Full name cannot be empty'),
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 32 })
    .withMessage('Username must be 3–32 characters')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage(
      'Username may only contain letters, numbers, dots, underscores, or hyphens'
    )
    .customSanitizer((value) => String(value).toLowerCase()),
  body('phone').optional().trim(),
  body('email').optional({ nullable: true }).trim(),
  body('status')
    .optional()
    .isIn(['approved', 'rejected', 'pending'])
    .withMessage('status must be approved, rejected, or pending'),
  body('jd').optional({ nullable: true }).trim(),
  body('assignedMentorId').optional({ nullable: true }).trim(),
  body('role')
    .optional()
    .isIn(['sales_agent', 'closer', 'cst_manager'])
    .withMessage(
      'Role must be one of: sales_agent, closer, cst_manager'
    ),
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
    .isIn(['present', 'late', 'absent'])
    .withMessage("decision must be 'present', 'late', or 'absent'"),
];

export const forceAbsentValidator = [
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Reason must be at most 300 characters'),
];

export const closeLeadValidator = [
  body('closerId')
    .optional({ nullable: true })
    .isMongoId()
    .withMessage('closerId must be a valid Mongo id'),
  body('payment.method')
    .isIn(['via_card', 'other'])
    .withMessage("payment.method must be 'via_card' or 'other'"),
  body('payment.cardLast4')
    .if(body('payment.method').equals('via_card'))
    .notEmpty()
    .withMessage('payment.cardLast4 is required when method is via_card')
    .trim()
    .isLength({ min: 4, max: 4 })
    .withMessage('payment.cardLast4 must be exactly 4 characters')
    .matches(/^\d{4}$/)
    .withMessage('payment.cardLast4 must be 4 digits'),
  body('payment.cardReferenceToken')
    .if(body('payment.method').equals('via_card'))
    .notEmpty()
    .withMessage('payment.cardReferenceToken is required when method is via_card')
    .trim(),
  body('payment.cardBrand')
    .if(body('payment.method').equals('via_card'))
    .notEmpty()
    .withMessage('payment.cardBrand is required when method is via_card')
    .trim(),
  body('payment.cardHolderName')
    .if(body('payment.method').equals('via_card'))
    .notEmpty()
    .withMessage('payment.cardHolderName is required when method is via_card')
    .trim()
    .isLength({ max: 120 })
    .withMessage('payment.cardHolderName must be at most 120 characters'),
  body('payment.billingZip')
    .if(body('payment.method').equals('via_card'))
    .notEmpty()
    .withMessage('payment.billingZip is required when method is via_card')
    .trim()
    .isLength({ max: 20 })
    .withMessage('payment.billingZip must be at most 20 characters'),
  body('payment.otherDetails')
    .if(body('payment.method').equals('other'))
    .notEmpty()
    .withMessage('payment.otherDetails is required when method is other')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('payment.otherDetails must be 2–200 characters'),
];

export const createConversationValidator = [
  body('contactId')
    .notEmpty()
    .withMessage('contactId is required')
    .isMongoId()
    .withMessage('contactId must be a valid Mongo id'),
];

export const sendMessageValidator = [
  body('type')
    .isIn(['text', 'image', 'document', 'voice'])
    .withMessage("type must be 'text', 'image', 'document', or 'voice'"),
  body('text')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 4000 })
    .withMessage('text must be at most 4000 characters'),
  body('attachment')
    .optional({ nullable: true })
    .isObject()
    .withMessage('attachment must be an object'),
];
