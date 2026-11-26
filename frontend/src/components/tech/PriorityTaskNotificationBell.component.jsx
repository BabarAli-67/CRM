import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import useAuth from '../../hooks/useAuth.hook.js';
import { getSocket } from '../../utils/socketClient.util.js';

const TECH_ROLES = new Set(['tech_head', 'tech_team']);
const MAX_ITEMS = 20;

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
 * Header bell for Priority Task alerts (Tech Head + Tech Team).
 * Session-local feed fed by `tech:priority` socket events.
 */
export default function PriorityTaskNotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const rootRef = useRef(null);
  const enabled = TECH_ROLES.has(user?.role);

  useEffect(() => {
    if (!enabled) return undefined;
    const socket = getSocket();
    const onPriority = (payload) => {
      if (!payload?.leadId || !payload?.isPriority) return;
      const pn = payload.projectNumber ? `#${payload.projectNumber} ` : '';
      const entry = {
        id: `priority-${payload.leadId}-${payload.at || Date.now()}`,
        leadId: payload.leadId,
        title: `Priority Task Assigned: ${pn}${
          payload.businessName || 'Client'
        }`.trim(),
        at: payload.at || new Date().toISOString(),
      };
      setItems((prev) => [entry, ...prev.filter((x) => x.id !== entry.id)].slice(0, MAX_ITEMS));
      setUnread((n) => n + 1);
      queryClient.invalidateQueries({ queryKey: ['techHeadPriority'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      queryClient.invalidateQueries({ queryKey: ['myPriorityProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
    };
    socket.on('tech:priority', onPriority);
    return () => socket.off('tech:priority', onPriority);
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

  const openPanel = () => {
    setOpen((v) => !v);
    setUnread(0);
  };

  const openItem = (item) => {
    setOpen(false);
    setUnread(0);
    navigate(
      user?.role === 'tech_head'
        ? '/dashboard/tech-head/priority'
        : '/dashboard/tech-team/priority'
    );
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Priority task notifications"
        aria-expanded={open}
        onClick={openPanel}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-white transition hover:bg-white/5"
      >
        <Flag className="h-5 w-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[#F25E26] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-700 bg-[#111111] shadow-2xl">
          <div className="border-b border-zinc-800 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Priority Task alerts
            </p>
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">
              No priority alerts yet.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className="w-full border-b border-zinc-800/80 px-3 py-2.5 text-left transition hover:bg-white/5"
                  >
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {formatPktShort(item.at)} PKT
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
