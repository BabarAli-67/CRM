import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import chatUpload from '../middlewares/chatUpload.middleware.js';
import {
  createConversationValidator,
  sendMessageValidator,
} from '../utils/validators.util.js';
import {
  getContacts,
  listConversations,
  createConversation,
  listMessages,
  postMessage,
  markSeen,
  uploadAttachment,
  serveAttachment,
} from '../controllers/chat.controller.js';

const router = Router();

// Chat is available to every authenticated role, including Auditor (admin).
// Deliberately no restrictTo() and no blockReadOnlyAdmin.
router.use(protect);

router.get('/contacts', getContacts);
router.get('/conversations', listConversations);
router.post(
  '/conversations',
  createConversationValidator,
  validate,
  createConversation
);
router.get('/conversations/:id/messages', listMessages);
router.post(
  '/conversations/:id/messages',
  sendMessageValidator,
  validate,
  postMessage
);
router.patch('/conversations/:id/seen', markSeen);
router.post(
  '/conversations/:id/upload',
  chatUpload.single('file'),
  uploadAttachment
);
router.get('/conversations/:id/files/:filename', serveAttachment);

export default router;
