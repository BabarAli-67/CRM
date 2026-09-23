/**
 * Shared helpers for chat conversation unread badges (React Query cache).
 */

export const sameChatId = (a, b) => String(a ?? '') === String(b ?? '');

export function conversationRowId(row) {
  return row?.conversation?._id || row?._id || null;
}

/** Optimistically set unreadCount to 0 for a conversation in the cache. */
export function clearConversationUnread(queryClient, conversationId) {
  if (!queryClient || !conversationId) return;
  queryClient.setQueryData(['conversations'], (old) => {
    if (!Array.isArray(old)) return old;
    return old.map((row) => {
      if (!sameChatId(conversationRowId(row), conversationId)) return row;
      if ((row.unreadCount || 0) === 0) return row;
      return { ...row, unreadCount: 0 };
    });
  });
}

/** Bump unread for an incoming message when the thread is not actively open. */
export function bumpConversationUnread(queryClient, message, { skip = false } = {}) {
  if (!queryClient || !message || skip) return;
  const conversationId = message.conversationId;
  if (!conversationId) return;

  queryClient.setQueryData(['conversations'], (old) => {
    if (!Array.isArray(old)) return old;
    let found = false;
    const next = old.map((row) => {
      if (!sameChatId(conversationRowId(row), conversationId)) return row;
      found = true;
      const preview =
        message.type === 'text'
          ? (message.text || '').slice(0, 80)
          : message.type === 'image'
            ? 'Sent a photo'
            : message.type === 'document'
              ? 'Sent a document'
              : message.type === 'voice'
                ? 'Sent a voice note'
                : row.lastMessagePreview;
      return {
        ...row,
        unreadCount: (row.unreadCount || 0) + 1,
        lastMessageAt: message.createdAt || new Date().toISOString(),
        lastMessagePreview: preview ?? row.lastMessagePreview,
      };
    });
    return found ? next : old;
  });
}

export function messagePreviewText(message) {
  if (!message) return '';
  if (message.type === 'text') return message.text || '';
  if (message.type === 'image') return 'Sent a photo';
  if (message.type === 'document') return 'Sent a document';
  if (message.type === 'voice') return 'Sent a voice note';
  return message.text || '';
}
