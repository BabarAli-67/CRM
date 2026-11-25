import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import useAuth from '../hooks/useAuth.hook.js';
import {
  clientCommentsPath,
  getCommentNotifications,
} from '../services/handover.service.js';
import { getSocket } from '../utils/socketClient.util.js';

const COMMENT_ROLES = new Set(['cst_manager', 'tech_team', 'tech_head']);

const formatPktShort = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Header notification bell for CST Manager ↔ Tech Team client comments.
 */
export default function ClientCommentNotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const enabled = COMMENT_ROLES.has(user?.role);

  const { data } = useQuery({
    queryKey: ['commentNotifications'],
    queryFn: getCommentNotifications,
    enabled,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const notifications = data?.notifications || [];
  const totalUnread = data?.totalUnread || 0;

  useEffect(() => {
    if (!enabled) return undefined;
    const socket = getSocket();
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['commentNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadTeamComments'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadEscalations'] });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
      queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
    };
    socket.on('client:comment-new', refresh);
    socket.on('client:comment-mention', refresh);
    return () => {
      socket.off('client:comment-new', refresh);
      socket.off('client:comment-mention', refresh);
    };
  }, [enabled, queryClient]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!enabled) return null;

  const openItem = (item) => {
    setOpen(false);
    navigate(clientCommentsPath(user.role, item.leadId));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Client comment notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-white transition hover:bg-white/5"
      >
        <Bell className="h-4.5 w-4.5 h-[18px] w-[18px]" aria-hidden />
        {totalUnread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#F25E26] px-1 text-[10px] font-bold leading-4 text-white">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-zinc-700/80 bg-[#111111] shadow-2xl shadow-black/50">
          <div className="border-b border-zinc-800 px-3.5 py-2.5">
            <p className="text-sm font-semibold text-white">Client comments</p>
            <p className="text-[11px] text-zinc-500">
              CST ↔ Tech only · click to open Comments
            </p>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="px-3.5 py-8 text-center text-sm text-zinc-500">
                No unread comments
              </li>
            ) : (
              notifications.map((item) => {
                const author =
                  item.latestComment?.authorName ||
                  (item.latestComment?.authorRole === 'tech_team'
                    ? 'Tech'
                    : 'CST');
                const verb = item.isMention ? 'mentioned you on' : 'commented on';
                return (
                  <li key={item.leadId} className="border-b border-zinc-800/60 last:border-0">
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className="w-full px-3.5 py-3 text-left transition hover:bg-[#F25E26]/10"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-white">
                          {author} {verb}{' '}
                          <span className="text-[#F25E26]">
                            {item.businessName}
                          </span>
                        </p>
                        {item.unreadCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-[#F25E26]/15 px-2 py-0.5 text-[10px] font-bold text-[#F25E26] ring-1 ring-[#F25E26]/35">
                            {item.unreadCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                        {item.latestComment?.body || 'New comment'}
                      </p>
                      <p className="mt-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
                        {formatPktShort(item.latestComment?.createdAt)} PKT ·
                        Click to view
                      </p>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
