import Conversation from '../models/conversation.model.js';
import Message from '../models/message.model.js';
import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.util.js';
import {
  canMessage,
  getAllowedContactRoles,
} from '../utils/chatAuthorization.util.js';

/**
 * Live approved contacts the user may chat with (silo + leadership rules).
 * Newly approved users appear automatically — no separate chat registration.
 */
export async function getContactsForUser(user) {
  const allowedRoles = getAllowedContactRoles(user.role);

  const contacts = await User.find({
    role: { $in: allowedRoles },
    status: 'approved',
    _id: { $ne: user._id },
  })
    .select('fullName username role')
    .sort({ fullName: 1 });

  return contacts;
}

/**
 * Atomically get or create the 1:1 conversation between userA and contactId.
 * Enforces canMessage silo rules before upserting.
 */
export async function getOrCreateConversation(userA, contactId) {
  const contact = await User.findOne({ _id: contactId, status: 'approved' });

  if (!contact) {
    throw new ApiError(404, 'Contact not found or not approved.');
  }

  if (!canMessage(userA, contact)) {
    throw new ApiError(403, 'You are not permitted to message this user.');
  }

  const participantsKey = [String(userA._id), String(contact._id)]
    .sort()
    .join('_');

  const conversation = await Conversation.findOneAndUpdate(
    { participantsKey },
    {
      $setOnInsert: {
        participants: [userA._id, contact._id],
        participantsKey,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  return conversation;
}

/**
 * Conversations for the user, newest activity first, with peer + unreadCount.
 */
export async function listConversationsForUser(userId) {
  const conversations = await Conversation.find({ participants: userId })
    .sort({ lastMessageAt: -1 })
    .populate('participants', 'fullName username role');

  const unreadCounts = await Promise.all(
    conversations.map((conversation) =>
      Message.countDocuments({
        conversationId: conversation._id,
        senderId: { $ne: userId },
        seenAt: null,
      })
    )
  );

  const userIdStr = String(userId);

  return conversations.map((conversation, index) => {
    const otherParticipant = conversation.participants.find(
      (p) => String(p._id ?? p) !== userIdStr
    );

    return {
      conversation,
      otherParticipant,
      lastMessageAt: conversation.lastMessageAt,
      lastMessagePreview: conversation.lastMessagePreview,
      unreadCount: unreadCounts[index],
    };
  });
}

async function assertParticipant(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    throw new ApiError(404, 'Conversation not found.');
  }

  const isParticipant = conversation.participants.some(
    (p) => String(p) === String(userId)
  );

  if (!isParticipant) {
    throw new ApiError(403, 'You are not a participant in this conversation.');
  }

  return conversation;
}

/** Exported for controllers that need a participant gate without loading messages. */
export async function assertParticipantPublic(conversationId, userId) {
  await assertParticipant(conversationId, userId);
}

/**
 * Message history (newest page first from DB, returned oldest→newest).
 * Optional `before` ISO cursor for backward pagination.
 */
export async function getMessages(
  conversationId,
  userId,
  { before, limit = 30 } = {}
) {
  await assertParticipant(conversationId, userId);

  const filter = { conversationId };
  if (before) {
    filter.createdAt = { $lt: new Date(before) };
  }

  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit);

  return messages.reverse();
}

function buildLastMessagePreview(type, text) {
  if (type === 'text') {
    return (text || '').slice(0, 80);
  }
  if (type === 'image') return 'Sent a photo';
  if (type === 'document') return 'Sent a document';
  if (type === 'voice') return 'Sent a voice note';
  return null;
}

/**
 * Persist a message and bump conversation last-message metadata.
 */
export async function sendMessage(conversationId, senderId, payload) {
  const conversation = await assertParticipant(conversationId, senderId);
  const { type, text, attachment } = payload;

  if (type === 'text' && (!text || !text.trim())) {
    throw new ApiError(400, 'Message text cannot be empty.');
  }

  if (type !== 'text' && !attachment?.storedFilename) {
    throw new ApiError(
      400,
      'Attachment metadata is required for this message type.'
    );
  }

  const message = await Message.create({
    conversationId,
    senderId,
    type,
    text: text || null,
    attachment: attachment || {},
  });

  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = buildLastMessagePreview(type, text);
  await conversation.save();

  return message;
}

/**
 * Mark all inbound unread messages in a conversation as seen.
 */
export async function markConversationSeen(conversationId, userId) {
  await assertParticipant(conversationId, userId);

  const result = await Message.updateMany(
    { conversationId, senderId: { $ne: userId }, seenAt: null },
    { $set: { seenAt: new Date() } }
  );

  return { updatedCount: result.modifiedCount };
}
