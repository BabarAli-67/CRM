import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useAuth from '../../hooks/useAuth.hook.js';
import { getSocket } from '../../utils/socketClient.util.js';

/** Soft-refresh cadence while the Tech dashboard tab is visible. */
const POLL_MS = 4_000;
/** Batch rapid socket bursts into one invalidate pass. */
const DEBOUNCE_MS = 350;

const TECH_ROLES = new Set(['tech_head', 'tech_team']);

/**
 * Query families Tech Head / Tech Team rely on for live boards.
 * invalidateQueries merges into existing cache — local tab/filter/scroll state
 * in page components is untouched.
 */
const TECH_QUERY_KEYS = [
  ['techHeadQueue'],
  ['techHeadAssigned'],
  ['techHeadCompleted'],
  ['techHeadPriority'],
  ['techHeadBadges'],
  ['techHeadEscalations'],
  ['techHeadTeamComments'],
  ['techHeadInternActivity'],
  ['techHeadClient'],
  ['myProjects'],
  ['myCompletedProjects'],
  ['myPriorityProjects'],
  ['myTaskStats'],
  ['commentNotifications'],
  ['mockupBadges'],
  ['assignedMockups'],
  ['mockupQueue'],
  ['mockupRequester'],
  ['lead'],
];

const SOCKET_EVENTS = [
  'tech:project-sync',
  'tech:status-updated',
  'tech:seo-handover',
  'tech:queue-new',
  'tech:keywords-ranked',
  'tech:task-note',
  'tech:priority',
  'client:comment-new',
  'client:comment-mention',
  'mockup:new',
  'mockup:assigned',
  'mockup:ready',
  'mockup:delivered',
];

/**
 * Background real-time sync for Tech Head + all Tech Team JDs.
 * Socket-driven invalidation + focus/visibility refetch + light polling.
 * Renders nothing.
 */
export default function TechLiveSyncBridge() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const timerRef = useRef(null);
  const role = user?.role;

  useEffect(() => {
    if (!TECH_ROLES.has(role)) return undefined;

    const softRefresh = () => {
      for (const queryKey of TECH_QUERY_KEYS) {
        // Active queries only — preserves inactive cache and avoids UI thrash
        queryClient.invalidateQueries({
          queryKey,
          refetchType: 'active',
        });
      }
    };

    const scheduleRefresh = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        softRefresh();
      }, DEBOUNCE_MS);
    };

    const socket = getSocket();
    for (const event of SOCKET_EVENTS) {
      socket.on(event, scheduleRefresh);
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    const onFocus = () => scheduleRefresh();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    const pollId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      softRefresh();
    }, POLL_MS);

    // Initial sync shortly after mount
    scheduleRefresh();

    return () => {
      for (const event of SOCKET_EVENTS) {
        socket.off(event, scheduleRefresh);
      }
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(pollId);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [queryClient, role]);

  return null;
}
