import { Server } from 'socket.io';
import { verifyToken } from '../utils/token.util.js';
import User from '../models/user.model.js';
import Conversation from '../models/conversation.model.js';
import env from '../config/env.config.js';
import { addSocket, removeSocket, isOnline } from './presence.util.js';
import { setIO } from './ioInstance.util.js';

/**
 * Create and authenticate the Socket.IO server; track presence on connect/disconnect.
 */
export default function initSocketServer(httpServer) {
  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      let decoded;
      try {
        decoded = verifyToken(token);
      } catch {
        return next(new Error('Invalid or expired token'));
      }

      const user = await User.findById(decoded.id).select('-password');

      if (!user || user.status !== 'approved') {
        return next(new Error('Account not approved'));
      }

      socket.userId = String(user._id);
      socket.userRole = user.role;
      return next();
    } catch {
      return next(new Error('Invalid or expired token'));
    }
  });

  setIO(io);

  io.on('connection', (socket) => {
    addSocket(socket.userId, socket.id);
    socket.join('user:' + socket.userId);
    io.emit('presence:update', { userId: socket.userId, online: true });

    socket.on('typing:start', async ({ conversationId }) => {
      const conversation = await Conversation.findById(conversationId);
      if (
        !conversation ||
        !conversation.participants.some((p) => String(p) === socket.userId)
      ) {
        return;
      }
      const otherId = conversation.participants.find(
        (p) => String(p) !== socket.userId
      );
      if (otherId) {
        io.to('user:' + String(otherId)).emit('typing:update', {
          conversationId,
          userId: socket.userId,
          isTyping: true,
        });
      }
    });

    socket.on('typing:stop', async ({ conversationId }) => {
      const conversation = await Conversation.findById(conversationId);
      if (
        !conversation ||
        !conversation.participants.some((p) => String(p) === socket.userId)
      ) {
        return;
      }
      const otherId = conversation.participants.find(
        (p) => String(p) !== socket.userId
      );
      if (otherId) {
        io.to('user:' + String(otherId)).emit('typing:update', {
          conversationId,
          userId: socket.userId,
          isTyping: false,
        });
      }
    });

    socket.on('disconnect', () => {
      removeSocket(socket.userId, socket.id);
      if (!isOnline(socket.userId)) {
        io.emit('presence:update', { userId: socket.userId, online: false });
      }
    });
  });

  return io;
}
