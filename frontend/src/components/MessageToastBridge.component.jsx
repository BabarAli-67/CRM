import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useAuth from '../hooks/useAuth.hook.js';
import useChatSocket from '../hooks/useChatSocket.hook.js';
import useChatWidget from '../hooks/useChatWidget.hook.js';
import { playMessageChime } from '../utils/audioAlert.js';
import {
  bumpConversationUnread,
  messagePreviewText,
  sameChatId,
} from '../utils/chatUnread.util.js';
import {
  requestNotificationPermission,
  showBrowserNotification,
} from '../utils/browserNotification.util.js';

const TOAST_TTL_MS = 7000;

/**
 * Global chat notifications: chime + toast when a message arrives and the
 * conversation is not the focused open docked window.
 */
export default function MessageToastBridge() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { openWindows, openChatWindow } = useChatWidget();
  const { onMessageNew } = useChatSocket();
  const [toasts, setToasts] = useState([]);
  const openWindowsRef = useRef(openWindows);
  openWindowsRef.current = openWindows;

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    const off = onMessageNew((payload) => {
      const message =
        payload?.conversationId != null
          ? payload
          : payload?.message || payload;
      if (!message?.conversationId) return;
      if (sameChatId(message.senderId, user?._id)) return;

      const conversationId = String(message.conversationId);
      const focusedOpen = (openWindowsRef.current || []).some(
        (w) =>
          sameChatId(w.conversationId, conversationId) && !w.minimized
      );

      if (!focusedOpen) {
        bumpConversationUnread(queryClient, message);
        playMessageChime();

        const conversations =
          queryClient.getQueryData(['conversations']) || [];
        const contacts = queryClient.getQueryData(['chatContacts']) || [];
        const row = conversations.find((c) =>
          sameChatId(c.conversation?._id || c._id, conversationId)
        );
        const contact =
          row?.otherParticipant ||
          contacts.find((c) => sameChatId(c._id, message.senderId)) ||
          null;

        const senderName =
          contact?.username || contact?.fullName || 'New message';
        const preview = messagePreviewText(message) || 'New message';

        const toastId = `${conversationId}-${message._id || Date.now()}`;
        setToasts((prev) => [
          ...prev.filter((t) => t.id !== toastId),
          {
            id: toastId,
            conversationId,
            contact: contact || {
              _id: message.senderId,
              fullName: senderName,
              username: senderName,
            },
            senderName,
            preview,
          },
        ]);

        showBrowserNotification({
          title: senderName,
          body: preview,
          tag: `chat-${conversationId}`,
        });

        window.setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toastId));
        }, TOAST_TTL_MS);

        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    });

    return off;
  }, [onMessageNew, queryClient, user?._id]);

  const dismiss = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const openFromToast = (toast) => {
    dismiss(toast.id);
    openChatWindow(toast.conversationId, toast.contact);
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:items-end"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => openFromToast(toast)}
          className="pointer-events-auto w-full max-w-sm cursor-pointer rounded-xl border border-zinc-700/80 bg-zinc-900/95 px-4 py-3 text-left shadow-2xl shadow-black/50 backdrop-blur transition hover:border-orange-500/40"
        >
          <p className="text-sm font-semibold text-white">{toast.senderName}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">
            {toast.preview}
          </p>
          <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-orange-400/90">
            Open chat
          </p>
        </button>
      ))}
    </div>
  );
}
