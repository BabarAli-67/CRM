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
const COMMENT_ROLES = new Set(['cst_manager', 'tech_team', 'tech_head']);
const MOCKUP_REQUESTER_ROLES = new Set(['closer', 'cst_manager']);

const mockupPathForRole = (role) =>
  role === 'closer' ? '/dashboard/closer/mockup' : '/dashboard/cst-manager/mockup';

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
          : authorRole === 'tech_head'
            ? 'Tech Head'
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
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadEscalations'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadTeamComments'] });
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

  // Mockup delivery → original CST / Closer requester
  useEffect(() => {
    const role = user?.role;
    if (!MOCKUP_REQUESTER_ROLES.has(role)) return undefined;

    const socket = getSocket();
    const seen = new Set();

    const onDelivered = (payload) => {
      if (!payload?.mockupId) return;
      const toastId = `mockup-${payload.mockupId}-${payload.at || Date.now()}`;
      if (seen.has(toastId)) return;
      seen.add(toastId);
      window.setTimeout(() => seen.delete(toastId), TOAST_TTL_MS + 500);

      playMessageChime();
      const businessName = payload.businessName || 'Business';
      const preview =
        payload.preview ||
        `Mockup ready for ${businessName} — click to view`;

      setToasts((prev) => [
        ...prev.filter((t) => t.id !== toastId),
        {
          id: toastId,
          kind: 'mockup_delivered',
          mockupId: payload.mockupId,
          senderName: 'Mockup ready',
          preview,
          path: mockupPathForRole(role),
        },
      ]);

      showBrowserNotification({
        title: `Mockup · ${businessName}`,
        body: preview,
        tag: toastId,
      });

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
      }, TOAST_TTL_MS);

      queryClient.invalidateQueries({ queryKey: ['mockupNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['mockupBadges'] });
      queryClient.invalidateQueries({ queryKey: ['myMockups'] });
    };

    socket.on('mockup:delivered', onDelivered);
    return () => {
      socket.off('mockup:delivered', onDelivered);
    };
  }, [queryClient, user?.role]);

  // Tech Head queue + specialist task notes + CST Tech Status sync
  useEffect(() => {
    const role = user?.role;
    if (
      role !== 'tech_head' &&
      role !== 'tech_team' &&
      role !== 'cst_manager'
    ) {
      return undefined;
    }

    const socket = getSocket();
    const seen = new Set();

    const pushToast = ({ toastId, kind, leadId, senderName, preview, path }) => {
      if (seen.has(toastId)) return;
      seen.add(toastId);
      window.setTimeout(() => seen.delete(toastId), TOAST_TTL_MS + 500);
      playMessageChime();
      setToasts((prev) => [
        ...prev.filter((t) => t.id !== toastId),
        { id: toastId, kind, leadId, senderName, preview, path },
      ]);
      showBrowserNotification({
        title: senderName,
        body: preview,
        tag: toastId,
      });
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
      }, TOAST_TTL_MS);
    };

    const onQueueNew = (payload) => {
      if (role !== 'tech_head' || !payload?.leadId) return;
      pushToast({
        toastId: `queue-${payload.leadId}-${payload.at || Date.now()}`,
        kind: 'tech_queue',
        leadId: payload.leadId,
        senderName: 'Incoming Handover',
        preview: `${payload.businessName || 'Client'} is ready in the Unassigned queue`,
        path: '/dashboard/tech-head/queue',
      });
      queryClient.invalidateQueries({ queryKey: ['techHeadQueue'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
    };

    const onTaskNote = (payload) => {
      if (role !== 'tech_team' || !payload?.leadId) return;
      pushToast({
        toastId: `task-${payload.noteId || payload.leadId}`,
        kind: 'tech_task',
        leadId: payload.leadId,
        senderName: 'Task from Tech Head',
        preview: payload.guidance
          ? `${payload.businessName || 'Client'} — ${payload.guidance}`
          : `${payload.businessName || 'Client'} — ${payload.bodyPreview || 'New task note'}`,
        path: `/dashboard/tech-team/client/${payload.leadId}?tab=comments`,
      });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      queryClient.invalidateQueries({ queryKey: ['commentNotifications'] });
      queryClient.invalidateQueries({
        queryKey: ['lead', payload.leadId, 'tech-portfolio'],
      });
    };

    const onStatusUpdated = (payload) => {
      if (!payload?.leadId) return;
      queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadAssigned'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadCompleted'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadQueue'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myCompletedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myTaskStats'] });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
      queryClient.invalidateQueries({
        queryKey: ['lead', payload.leadId, 'tech-portfolio'],
      });
      queryClient.invalidateQueries({
        queryKey: ['techHeadClient', payload.leadId],
      });
    };

    const onSeoHandover = (payload) => {
      if (!payload?.leadId) return;
      const pn = payload.projectNumber ? `#${payload.projectNumber} · ` : '';
      if (role === 'tech_head') {
        pushToast({
          toastId: `seo-ho-${payload.leadId}-${payload.at || Date.now()}`,
          kind: 'seo_handover',
          leadId: payload.leadId,
          senderName: 'Developer → SEO',
          preview: payload.needsTechHeadAttention
            ? `${pn}${payload.businessName || 'Client'} needs SEO review / reassignment`
            : `${pn}${payload.businessName || 'Client'} handed to SEO`,
          path: '/dashboard/tech-head/assigned',
        });
      } else if (role === 'tech_team') {
        pushToast({
          toastId: `seo-ho-${payload.leadId}-${payload.at || Date.now()}`,
          kind: 'seo_handover',
          leadId: payload.leadId,
          senderName: 'SEO Handover',
          preview: `${pn}${payload.businessName || 'Client'} is now Ongoing (SEO) — open Work & Reports`,
          path: `/dashboard/tech-team/client/${payload.leadId}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myCompletedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myTaskStats'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadAssigned'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadCompleted'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      queryClient.invalidateQueries({
        queryKey: ['lead', payload.leadId, 'tech-portfolio'],
      });
    };

    const onKeywordsRanked = (payload) => {
      if (role !== 'tech_head' || !payload?.leadId) return;
      const pn = payload.projectNumber ? `#${payload.projectNumber} · ` : '';
      pushToast({
        toastId: `kw-ranked-${payload.leadId}-${payload.at || Date.now()}`,
        kind: 'keywords_ranked',
        leadId: payload.leadId,
        senderName: 'Keywords Ranked',
        preview: `${pn}${payload.businessName || 'Client'} — confirmed by ${
          payload.confirmedByName || 'SEO Expert'
        }`,
        path: `/dashboard/tech-head/client/${payload.leadId}`,
      });
      queryClient.invalidateQueries({ queryKey: ['techHeadAssigned'] });
      queryClient.invalidateQueries({
        queryKey: ['techHeadClient', payload.leadId],
      });
    };

    const onPriority = (payload) => {
      if (!payload?.leadId || !payload?.isPriority) return;
      if (role !== 'tech_team' && role !== 'tech_head') return;
      const pn = payload.projectNumber ? `#${payload.projectNumber} ` : '';
      const preview = `Priority Task Assigned: ${pn}${
        payload.businessName || 'Client'
      }`.trim();
      pushToast({
        toastId: `priority-${payload.leadId}-${payload.at || Date.now()}`,
        kind: 'priority_task',
        leadId: payload.leadId,
        senderName: 'Priority Task',
        preview,
        path:
          role === 'tech_head'
            ? '/dashboard/tech-head/priority'
            : '/dashboard/tech-team/priority',
      });
      queryClient.invalidateQueries({ queryKey: ['techHeadPriority'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      queryClient.invalidateQueries({ queryKey: ['myPriorityProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadAssigned'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadQueue'] });
    };

    const onCstClientState = () => {
      if (role !== 'cst_manager' && role !== 'super_admin') return;
      queryClient.invalidateQueries({ queryKey: ['cstClients'] });
      queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
    };

    socket.on('tech:queue-new', onQueueNew);
    socket.on('tech:task-note', onTaskNote);
    socket.on('tech:status-updated', onStatusUpdated);
    socket.on('tech:seo-handover', onSeoHandover);
    socket.on('tech:keywords-ranked', onKeywordsRanked);
    socket.on('tech:priority', onPriority);
    socket.on('cst:client-state', onCstClientState);
    return () => {
      socket.off('tech:queue-new', onQueueNew);
      socket.off('tech:task-note', onTaskNote);
      socket.off('tech:status-updated', onStatusUpdated);
      socket.off('tech:seo-handover', onSeoHandover);
      socket.off('tech:keywords-ranked', onKeywordsRanked);
      socket.off('tech:priority', onPriority);
      socket.off('cst:client-state', onCstClientState);
    };
  }, [queryClient, user?.role]);

  const dismiss = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const openFromToast = (toast) => {
    dismiss(toast.id);
    if (toast.path) {
      navigate(toast.path);
      return;
    }
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
              : toast.kind === 'tech_queue'
                ? 'Open queue'
                : toast.kind === 'tech_task'
                  ? 'Open project'
                  : toast.kind === 'mockup_delivered'
                    ? 'Open Mockup'
                    : toast.kind === 'keywords_ranked'
                      ? 'Open client'
                      : toast.kind === 'priority_task'
                        ? 'Open Priority Task'
                        : 'Open chat'}
          </p>
        </button>
      ))}
    </div>
  );
}
