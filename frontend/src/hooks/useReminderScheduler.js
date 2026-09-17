import { useEffect, useMemo, useRef } from 'react';
import { enqueueReminderPopup } from '../components/alerts/ReminderPopup.jsx';
import useAuth from './useAuth.hook.js';

const FIVE_MIN_MS = 5 * 60 * 1000;
const CATCHUP_WINDOW_MS = 60 * 1000;

/**
 * Schedule 5-minute and exact-time reminder chimes for callbacks / lead follow-ups.
 *
 * @param {Array<{
 *   id: string,
 *   kind: 'callback' | 'followup',
 *   triggerAt: string | number | Date,
 *   notifyUserIds: Array<string>,
 *   alerts?: { fiveMinFired?: boolean, exactTimeFired?: boolean }
 * }>} items
 * @param {{
 *   showPopup?: (payload: object) => void,
 *   markAlert?: (payload: {
 *     id: string,
 *     kind: 'callback' | 'followup',
 *     fiveMinFired?: boolean,
 *     exactTimeFired?: boolean
 *   }) => void | Promise<void>,
 *   currentUserId?: string
 * }} [options]
 */
export default function useReminderScheduler(items = [], options = {}) {
  const { user } = useAuth();
  const currentUserId = String(options.currentUserId ?? user?._id ?? user?.id ?? '');
  const showPopup = options.showPopup ?? enqueueReminderPopup;
  const markAlert = options.markAlert;

  const showPopupRef = useRef(showPopup);
  const markAlertRef = useRef(markAlert);
  showPopupRef.current = showPopup;
  markAlertRef.current = markAlert;

  // Session guard so a slow mark-alert mutation / rapid refetch doesn't double-chime
  const firedRef = useRef(new Set());

  // Re-derive when schedule-relevant fields change (TanStack Query refetch / edits)
  const scheduleKey = useMemo(
    () =>
      JSON.stringify(
        (items || []).map((item) => ({
          id: item.id,
          kind: item.kind,
          triggerAt: item.triggerAt,
          notifyUserIds: item.notifyUserIds,
          fiveMinFired: item.alerts?.fiveMinFired ?? false,
          exactTimeFired: item.alerts?.exactTimeFired ?? false,
        }))
      ),
    [items]
  );

  useEffect(() => {
    const timers = [];
    const list = items || [];

    if (!currentUserId || list.length === 0) {
      return () => {};
    }

    const fire = async (item, alertType) => {
      const key = `${item.kind}:${item.id}:${alertType}`;
      if (firedRef.current.has(key)) return;
      firedRef.current.add(key);

      try {
        showPopupRef.current?.({
          id: item.id,
          kind: item.kind,
          alertType,
          triggerAt: item.triggerAt,
          item,
        });
      } catch {
        // Popup may not be wired yet
      }

      try {
        const payload =
          alertType === 'fiveMin'
            ? { id: item.id, kind: item.kind, fiveMinFired: true }
            : { id: item.id, kind: item.kind, exactTimeFired: true };
        await markAlertRef.current?.(payload);
      } catch {
        // Allow a later refetch to retry if mark failed
        firedRef.current.delete(key);
      }
    };

    const schedule = (item, alertType, targetMs, alreadyFired) => {
      if (alreadyFired) {
        firedRef.current.add(`${item.kind}:${item.id}:${alertType}`);
        return;
      }

      const now = Date.now();
      const delta = targetMs - now;

      if (delta > 0) {
        const timerId = setTimeout(() => {
          fire(item, alertType);
        }, delta);
        timers.push(timerId);
        return;
      }

      // Catch-up: user loaded during / just after the window (~60s)
      if (delta >= -CATCHUP_WINDOW_MS) {
        fire(item, alertType);
      }
    };

    for (const item of list) {
      if (!item?.id || !item?.triggerAt) continue;

      const notifyIds = (item.notifyUserIds || []).map(String);
      if (!notifyIds.includes(currentUserId)) continue;

      const triggerAt = new Date(item.triggerAt).getTime();
      if (Number.isNaN(triggerAt)) continue;

      const fiveMinBefore = triggerAt - FIVE_MIN_MS;
      const alerts = item.alerts || {};

      schedule(item, 'fiveMin', fiveMinBefore, Boolean(alerts.fiveMinFired));
      schedule(item, 'exact', triggerAt, Boolean(alerts.exactTimeFired));
    }

    // Drop session keys for items no longer present so a re-added schedule can fire
    const liveKeys = new Set();
    for (const item of list) {
      liveKeys.add(`${item.kind}:${item.id}:fiveMin`);
      liveKeys.add(`${item.kind}:${item.id}:exact`);
    }
    for (const key of [...firedRef.current]) {
      if (!liveKeys.has(key)) firedRef.current.delete(key);
    }

    return () => {
      for (const timerId of timers) clearTimeout(timerId);
    };
    // scheduleKey captures items content; `items` read from closure for full objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleKey, currentUserId]);
}
