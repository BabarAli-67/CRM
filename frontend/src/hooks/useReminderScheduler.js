import { useEffect, useMemo, useRef } from 'react';
import { enqueueReminderPopup } from '../components/alerts/ReminderPopup.jsx';
import useAuth from './useAuth.hook.js';

const FIVE_MIN_MS = 5 * 60 * 1000;
/** Exact due catch-up: fire if overdue by at most 2 minutes. */
const EXACT_CATCHUP_MS = 2 * 60 * 1000;
/**
 * Max setTimeout delay. Browsers store delay as a 32-bit signed int
 * (~24.8 days); longer values overflow and fire immediately.
 * Distant callbacks rely on the poll scanner instead.
 */
const MAX_TIMEOUT_MS = 12 * 60 * 60 * 1000;
/** Backup poll — catches timers throttled while the tab was backgrounded. */
const POLL_MS = 15_000;

/**
 * Parse trigger to epoch ms. Rejects invalid / NaN timestamps.
 */
function parseTriggerMs(triggerAt) {
  if (triggerAt == null || triggerAt === '') return NaN;
  const ms = new Date(triggerAt).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * 5-min warning: callback is strictly in the future and within 5 minutes.
 */
function isWithinFiveMinuteWindow(triggerMs, now = Date.now()) {
  const diffMs = triggerMs - now;
  return diffMs > 0 && diffMs <= FIVE_MIN_MS;
}

/**
 * Due-now: callback time has arrived (or just passed within 2 minutes).
 */
function isDueNowWindow(triggerMs, now = Date.now()) {
  const diffMs = triggerMs - now;
  return diffMs <= 0 && diffMs >= -EXACT_CATCHUP_MS;
}

/**
 * Schedule 5-minute and exact-time reminder chimes for callbacks / lead follow-ups.
 * Uses setTimeout plus a visibility/poll safety net so alerts still fire when
 * the agent is on another dashboard tab or the browser throttles timers.
 *
 * Distant future dates never use setTimeout (overflow would fire instantly);
 * the poll scanner only fires when the full datetime is within the window.
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

      const triggerMs = parseTriggerMs(item.triggerAt);
      if (Number.isNaN(triggerMs)) return;

      // Final guard — never fire for distant future / wrong calendar day
      const now = Date.now();
      if (alertType === 'fiveMin' && !isWithinFiveMinuteWindow(triggerMs, now)) {
        return;
      }
      if (alertType === 'exact' && !isDueNowWindow(triggerMs, now)) {
        return;
      }

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

    const schedule = (item, alertType, targetMs, alreadyFired) => {
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

      // Still in the future: only arm setTimeout for near-term targets
      if (delta > 0) {
        if (delta > MAX_TIMEOUT_MS) {
          // Too far out — poll will pick it up when the window opens
          return;
        }
        const timerId = setTimeout(() => {
          fire(item, alertType);
        }, delta);
        timers.push(timerId);
        return;
      }

      // Target already passed — only fire if still inside the live window
      fire(item, alertType);
    };

    const scanAll = () => {
      const live = itemsRef.current || [];
      const now = Date.now();

      for (const item of live) {
        if (!item?.id || !item?.triggerAt) continue;
        const notifyIds = (item.notifyUserIds || []).map(String);
        if (!notifyIds.includes(currentUserId)) continue;

        const triggerAt = parseTriggerMs(item.triggerAt);
        if (Number.isNaN(triggerAt)) continue;

        const alerts = item.alerts || {};

        if (
          !alerts.fiveMinFired &&
          isWithinFiveMinuteWindow(triggerAt, now)
        ) {
          fire(item, 'fiveMin');
        }
        if (!alerts.exactTimeFired && isDueNowWindow(triggerAt, now)) {
          fire(item, 'exact');
        }
      }
    };

    for (const item of list) {
      if (!item?.id || !item?.triggerAt) continue;

      const notifyIds = (item.notifyUserIds || []).map(String);
      if (!notifyIds.includes(currentUserId)) continue;

      const triggerAt = parseTriggerMs(item.triggerAt);
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

    // Immediate scan for anything already in-window (without arming overflow timers)
    scanAll();

    return () => {
      for (const timerId of timers) clearTimeout(timerId);
      window.clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleKey, currentUserId]);
}
