import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { clientCommentsPath } from '../services/handover.service.js';
import { getSocket } from '../utils/socketClient.util.js';

const TOAST_TTL_MS = 7000;
const COMMENT_ROLES = new Set(['cst_manager', 'tech_team']);

/**
 * Global chat + CST↔Tech client-comment notifications:
 * chime + toast when a message/comment arrives.
 */
export default function MessageToastBridge() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  // CST ↔ Tech client comments / @mentions → live toast + browser notification
  useEffect(() => {
    if (!COMMENT_ROLES.has(user?.role)) return undefined;

    const socket = getSocket();
    const seen = new Set();

    const onComment = (payload) => {
      if (!payload?.leadId) return;
      const toastId = `comment-${payload.leadId}-${payload.commentId || Date.now()}`;
      if (seen.has(toastId)) return;
      seen.add(toastId);
      window.setTimeout(() => seen.delete(toastId), TOAST_TTL_MS + 500);

      playMessageChime();

      const isMention = Boolean(payload.isMention);
      const businessName = payload.businessName || 'a client';
      const authorName = payload.authorName || 'Team';
      const authorRole = payload.authorRole;
      const roleWord =
        authorRole === 'tech_team'
          ? 'Tech'
          : authorRole === 'cst_manager'
            ? 'CST'
            : authorName;

      const preview = isMention
        ? `${authorName} mentioned you on ${businessName}`
        : `${roleWord} commented on ${businessName} — Click to view`;

      setToasts((prev) => [
        ...prev.filter((t) => t.id !== toastId),
        {
          id: toastId,
          kind: 'client_comment',
          leadId: payload.leadId,
          senderName: isMention ? 'Mention' : roleWord,
          preview,
        },
      ]);

      showBrowserNotification({
        title: isMention
          ? `Mention · ${businessName}`
          : `Comment · ${businessName}`,
        body: preview,
        tag: toastId,
      });

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
      }, TOAST_TTL_MS);

      queryClient.invalidateQueries({
        queryKey: ['lead', payload.leadId, 'portfolio'],
      });
      queryClient.invalidateQueries({
        queryKey: ['lead', payload.leadId, 'tech-portfolio'],
      });
      queryClient.invalidateQueries({ queryKey: ['commentNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
      queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
    };

    // Prefer client:comment-new (includes isMention). Mention-only event is
    // still emitted server-side for older clients, but we ignore it here to
    // avoid duplicate toasts.
    const onNew = (payload) => onComment(payload);
    socket.on('client:comment-new', onNew);
    return () => {
      socket.off('client:comment-new', onNew);
    };
  }, [queryClient, user?.role]);

  const dismiss = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const openFromToast = (toast) => {
    dismiss(toast.id);
    if (
      (toast.kind === 'client_comment' || toast.kind === 'client_mention') &&
      toast.leadId
    ) {
      navigate(clientCommentsPath(user?.role, toast.leadId));
      return;
    }
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
            {toast.kind === 'client_comment' || toast.kind === 'client_mention'
              ? 'Open comments'
              : 'Open chat'}
          </p>
        </button>
      ))}
    </div>
  );
}
