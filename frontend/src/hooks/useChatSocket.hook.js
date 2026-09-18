import { useCallback, useEffect } from 'react';
import { getSocket } from '../utils/socketClient.util.js';

/**
 * Thin Socket.IO helpers for chat presence / typing / live messages.
 * Subscribe via onXxx(cb) inside useEffect; use the returned cleanup.
 */
export default function useChatSocket() {
  useEffect(() => {
    getSocket();
  }, []);

  const onMessageNew = useCallback((cb) => {
    const socket = getSocket();
    socket.on('message:new', cb);
    return () => socket.off('message:new', cb);
  }, []);

  const onTypingUpdate = useCallback((cb) => {
    const socket = getSocket();
    socket.on('typing:update', cb);
    return () => socket.off('typing:update', cb);
  }, []);

  const onPresenceUpdate = useCallback((cb) => {
    const socket = getSocket();
    socket.on('presence:update', cb);
    return () => socket.off('presence:update', cb);
  }, []);

  const onMessageSeen = useCallback((cb) => {
    const socket = getSocket();
    socket.on('message:seen', cb);
    return () => socket.off('message:seen', cb);
  }, []);

  const emitTyping = useCallback((conversationId, isTyping) => {
    if (!conversationId) return;
    const socket = getSocket();
    socket.emit(isTyping ? 'typing:start' : 'typing:stop', {
      conversationId: String(conversationId),
    });
  }, []);

  return {
    onMessageNew,
    onTypingUpdate,
    onPresenceUpdate,
    onMessageSeen,
    emitTyping,
  };
}
