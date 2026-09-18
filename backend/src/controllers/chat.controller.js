import path from 'path';
import fs from 'fs';
import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import Conversation from '../models/conversation.model.js';
import { emitToUser } from '../sockets/ioInstance.util.js';
import {
  getContactsForUser,
  listConversationsForUser,
  getOrCreateConversation,
  getMessages,
  sendMessage,
  markConversationSeen,
  assertParticipantPublic,
} from '../services/chat.service.js';

const otherParticipantId = (conversation, userId) => {
  if (!conversation?.participants) return null;
  const other = conversation.participants.find(
    (p) => String(p) !== String(userId)
  );
  return other ? String(other) : null;
};

export const getContacts = asyncHandler(async (req, res) => {
  const contacts = await getContactsForUser(req.user);

  res
    .status(200)
    .json(new ApiResponse(200, { contacts }, 'Chat contacts retrieved'));
});

export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await listConversationsForUser(req.user._id);

  res
    .status(200)
    .json(
      new ApiResponse(200, { conversations }, 'Conversations retrieved')
    );
});

export const createConversation = asyncHandler(async (req, res) => {
  const conversation = await getOrCreateConversation(
    req.user,
    req.body.contactId
  );

  res
    .status(200)
    .json(
      new ApiResponse(200, { conversation }, 'Conversation ready')
    );
});

export const listMessages = asyncHandler(async (req, res) => {
  const { before, limit } = req.query;
  const messages = await getMessages(req.params.id, req.user._id, {
    before,
    limit: limit !== undefined ? Number(limit) : undefined,
  });

  res
    .status(200)
    .json(new ApiResponse(200, { messages }, 'Messages retrieved'));
});

export const postMessage = asyncHandler(async (req, res) => {
  const message = await sendMessage(req.params.id, req.user._id, req.body);

  const conversation = await Conversation.findById(req.params.id);
  const recipientId = otherParticipantId(conversation, req.user._id);
  if (recipientId) {
    emitToUser(recipientId, 'message:new', message);
  }

  res
    .status(201)
    .json(new ApiResponse(201, { message }, 'Message sent'));
});

export const markSeen = asyncHandler(async (req, res) => {
  const result = await markConversationSeen(req.params.id, req.user._id);

  if (result.updatedCount > 0) {
    const conversation = await Conversation.findById(req.params.id);
    const senderId = otherParticipantId(conversation, req.user._id);
    if (senderId) {
      emitToUser(senderId, 'message:seen', {
        conversationId: req.params.id,
        seenAt: new Date(),
      });
    }
  }

  res
    .status(200)
    .json(new ApiResponse(200, result, 'Conversation marked seen'));
});

export const uploadAttachment = asyncHandler(async (req, res) => {
  await assertParticipantPublic(req.params.id, req.user._id);

  if (!req.file) {
    throw new ApiError(400, 'No valid file was uploaded.');
  }

  res.status(201).json(
    new ApiResponse(
      201,
      {
        storedFilename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
      'File uploaded — attach it to a message next.'
    )
  );
});

export const serveAttachment = asyncHandler(async (req, res) => {
  await assertParticipantPublic(req.params.id, req.user._id);

  const { filename } = req.params;
  if (
    !filename ||
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    throw new ApiError(400, 'Invalid filename.');
  }

  const absolutePath = path.join(
    process.cwd(),
    'uploads',
    'chat',
    req.params.id,
    filename
  );

  if (!fs.existsSync(absolutePath)) {
    throw new ApiError(404, 'File not found.');
  }

  res.sendFile(absolutePath);
});
