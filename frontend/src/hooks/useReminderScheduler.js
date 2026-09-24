import { useEffect, useMemo, useRef } from 'react';
import { enqueueReminderPopup } from '../components/alerts/ReminderPopup.jsx';
import useAuth from './useAuth.hook.js';

const FIVE_MIN_MS = 5 * 60 * 1000;
const CATCHUP_WINDOW_MS = 90 * 1000;
/** Backup poll — catches timers throttled while the tab was backgrounded. */
const POLL_MS = 15_000;

/**
 * Schedule 5-minute and exact-time reminder chimes for callbacks / lead follow-ups.
 * Uses setTimeout plus a visibility/poll safety net so alerts still fire when
 * the agent is on another dashboard tab or the browser throttles timers.
 */
export default function useReminderScheduler(items = [], options = {}) {
  const { user } = useAuth();
  const currentUserId = String(
    options.currentUserId ?? user?._id ?? user?.id ?? ''
  );
  const showPopup = options.showPopup ?? enqueueReminderPopup;
  const markAlert = options.markAlert;

  const showPopupRef = useRef(showPopup);
  const markAlertRef = useRef(markAlert);
  const itemsRef = useRef(items);
  showPopupRef.current = showPopup;
  markAlertRef.current = markAlert;
  itemsRef.current = items;

  // Session guard — once per callbackId + interval (fiveMin / exact)
  const firedRef = useRef(new Set());

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
      const key = `${item.kind}:${item.id}:${alertType}:${item.triggerAt}`;
      if (firedRef.current.has(key)) return;
      firedRef.current.add(key);

      try {
        showPopupRef.current?.({
          id: item.id,
          kind: item.kind,
          alertType,
          triggerAt: item.triggerAt,
          businessName: item.businessName,
          phone: item.phone,
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
        firedRef.current.delete(key);
      }
    };

    const maybeFire = (item, alertType, targetMs, alreadyFired) => {
      if (alreadyFired) {
        firedRef.current.add(
          `${item.kind}:${item.id}:${alertType}:${item.triggerAt}`
        );
        return;
      }

      const key = `${item.kind}:${item.id}:${alertType}:${item.triggerAt}`;
      if (firedRef.current.has(key)) return;

      const now = Date.now();
      const delta = targetMs - now;

      if (delta > 0) return;

      // Catch-up: fire if we are within the window after the target
      if (delta >= -CATCHUP_WINDOW_MS) {
        fire(item, alertType);
      }
    };

    const schedule = (item, alertType, targetMs, alreadyFired) => {
      if (alreadyFired) {
        firedRef.current.add(
          `${item.kind}:${item.id}:${alertType}:${item.triggerAt}`
        );
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

      if (delta >= -CATCHUP_WINDOW_MS) {
        fire(item, alertType);
      }
    };

    const scanAll = () => {
      const live = itemsRef.current || [];
      for (const item of live) {
        if (!item?.id || !item?.triggerAt) continue;
        const notifyIds = (item.notifyUserIds || []).map(String);
        if (!notifyIds.includes(currentUserId)) continue;

        const triggerAt = new Date(item.triggerAt).getTime();
        if (Number.isNaN(triggerAt)) continue;

        const alerts = item.alerts || {};
        maybeFire(
          item,
          'fiveMin',
          triggerAt - FIVE_MIN_MS,
          Boolean(alerts.fiveMinFired)
        );
        maybeFire(item, 'exact', triggerAt, Boolean(alerts.exactTimeFired));
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

    const liveKeys = new Set();
    for (const item of list) {
      liveKeys.add(`${item.kind}:${item.id}:fiveMin:${item.triggerAt}`);
      liveKeys.add(`${item.kind}:${item.id}:exact:${item.triggerAt}`);
    }
    for (const key of [...firedRef.current]) {
      if (!liveKeys.has(key)) firedRef.current.delete(key);
    }

    const pollId = window.setInterval(scanAll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') scanAll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      for (const timerId of timers) clearTimeout(timerId);
      window.clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleKey, currentUserId]);
}
