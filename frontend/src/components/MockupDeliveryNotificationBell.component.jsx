import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutTemplate } from 'lucide-react';
import useAuth from '../hooks/useAuth.hook.js';
import {
  getMockupNotifications,
  markMockupViewed,
} from '../services/mockup.service.js';
import { getSocket } from '../utils/socketClient.util.js';

const MOCKUP_ROLES = new Set(['closer', 'cst_manager']);

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

const mockupPathForRole = (role) =>
  role === 'closer' ? '/dashboard/closer/mockup' : '/dashboard/cst-manager/mockup';

/**
 * Header bell for CST / Closer when Tech Head delivers a completed mockup URL.
 */
export default function MockupDeliveryNotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const enabled = MOCKUP_ROLES.has(user?.role);

  const { data } = useQuery({
    queryKey: ['mockupNotifications'],
    queryFn: getMockupNotifications,
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
      queryClient.invalidateQueries({ queryKey: ['mockupNotifications'] });
      queryClient.invalidateQueries({ queryKey: ['mockupBadges'] });
      queryClient.invalidateQueries({ queryKey: ['myMockups'] });
    };
    socket.on('mockup:delivered', refresh);
    return () => {
      socket.off('mockup:delivered', refresh);
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

  const openItem = async (item) => {
    setOpen(false);
    try {
      if (item?.mockupId) {
        await markMockupViewed(item.mockupId);
      }
    } catch {
      // Non-blocking — still navigate to Mockup tab
    }
    queryClient.invalidateQueries({ queryKey: ['mockupNotifications'] });
    queryClient.invalidateQueries({ queryKey: ['mockupBadges'] });
    queryClient.invalidateQueries({ queryKey: ['myMockups'] });
    navigate(mockupPathForRole(user.role));
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Mockup delivery notifications"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-white transition hover:bg-white/5"
      >
        <LayoutTemplate className="h-[18px] w-[18px]" aria-hidden />
        {totalUnread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#F25E26] px-1 text-[10px] font-bold leading-4 text-white">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-zinc-700/80 bg-[#111111] shadow-2xl shadow-black/50">
          <div className="border-b border-zinc-800 px-3.5 py-2.5">
            <p className="text-sm font-semibold text-white">Mockup deliveries</p>
            <p className="text-[11px] text-zinc-500">
              Tech Head delivered URLs · click to open Mockup
            </p>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="px-3.5 py-8 text-center text-sm text-zinc-500">
                No unread mockup deliveries
              </li>
            ) : (
              notifications.map((item) => (
                <li
                  key={item.mockupId}
                  className="border-b border-zinc-800/60 last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className="w-full px-3.5 py-3 text-left transition hover:bg-[#F25E26]/10"
                  >
                    <p className="text-sm font-semibold text-white">
                      Mockup ready for{' '}
                      <span className="text-[#F25E26]">
                        {item.businessName}
                      </span>
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                      {item.preview || 'Click to view'}
                    </p>
                    <p className="mt-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
                      {formatPktShort(item.deliveredAt)} PKT · Click to view
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
