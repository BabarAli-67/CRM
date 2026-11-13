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
/** Faster poll for CST retention exact-time items. */
const FAST_POLL_MS = 3_000;

/** Module-level fire guards so reschedule can clear them from outside the hook. */
const firedKeys = new Set();

/**
 * Clear session fire guards (and optionally only for one reminder target).
 * Call when CST saves a new Retention Date/Time so the new schedule can ring.
 */
export function clearReminderFireKeys({ kind, id } = {}) {
  if (!kind && !id) {
    firedKeys.clear();
    return;
  }
  for (const key of [...firedKeys]) {
    if (kind && id) {
      if (key.startsWith(`${kind}:${id}:`)) firedKeys.delete(key);
    } else if (kind) {
      if (key.startsWith(`${kind}:`)) firedKeys.delete(key);
    } else if (String(key).includes(`:${id}:`)) {
      firedKeys.delete(key);
    }
  }
}

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
 * Skip the early warning when the callback was created/rescheduled with less
 * than 5 minutes of lead time (5-min mark was already in the past at save).
 * Backend also sets alerts.fiveMinFired in that case; this is a client guard.
 */
function wasScheduledInsideFiveMinuteWindow(item, triggerMs) {
  const createdRaw = item?.createdAt ?? item?.item?.createdAt;
  if (createdRaw == null || createdRaw === '') return false;
  const createdMs = new Date(createdRaw).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return triggerMs - createdMs < FIVE_MIN_MS;
}

/**
 * Should this signed-in user be alerted for the item?
 *
 * Callbacks / lead follow-ups stay owner-scoped (notifyUserIds must contain the
 * current user). CST retention is desk-wide — any signed-in CST Manager must
 * hear it — so those items opt out with `notifyAll` instead of relying on an
 * id match against the session user payload.
 */
function isNotifiable(item, currentUserId) {
  if (item?.notifyAll) return true;
  const notifyIds = (item?.notifyUserIds || []).map(String);
  return notifyIds.includes(currentUserId);
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

  const scheduleKey = useMemo(
    () =>
      JSON.stringify(
        (items || []).map((item) => ({
          id: item.id,
          kind: item.kind,
          triggerAt: item.triggerAt,
          notifyUserIds: item.notifyUserIds,
          notifyAll: Boolean(item.notifyAll),
          fiveMinFired: item.alerts?.fiveMinFired ?? false,
          exactTimeFired: item.alerts?.exactTimeFired ?? false,
          createdAt: item.createdAt ?? null,
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

    // Retention uses the same dual-phase scheduler as callbacks; poll a bit
    // faster so CST exact-time alerts land close to the scheduled minute.
    const needsFastPoll = list.some((item) => item?.kind === 'retention');
    const pollMs = needsFastPoll ? FAST_POLL_MS : POLL_MS;

    const fire = async (item, alertType) => {
      const key = `${item.kind}:${item.id}:${alertType}:${item.triggerAt}`;
      if (firedKeys.has(key)) return;

      const triggerMs = parseTriggerMs(item.triggerAt);
      if (Number.isNaN(triggerMs)) return;

      // Final guard — never fire for distant future / wrong calendar day
      const now = Date.now();
      if (alertType === 'fiveMin') {
        if (wasScheduledInsideFiveMinuteWindow(item, triggerMs)) return;
        if (!isWithinFiveMinuteWindow(triggerMs, now)) return;
      }
      if (alertType === 'exact') {
        // Same due window as Agent / Closer callbacks (arrived or ≤2 min late)
        if (!isDueNowWindow(triggerMs, now)) return;
      }

      firedKeys.add(key);

      try {
        showPopupRef.current?.({
          id: item.id,
          kind: item.kind,
          alertType,
          triggerAt: item.triggerAt,
          businessName: item.businessName,
          clientName: item.clientName,
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
        firedKeys.delete(key);
      }
    };

    const schedule = (item, alertType, targetMs, alreadyFired) => {
      if (alreadyFired) {
        firedKeys.add(
          `${item.kind}:${item.id}:${alertType}:${item.triggerAt}`
        );
        return;
      }

      const key = `${item.kind}:${item.id}:${alertType}:${item.triggerAt}`;
      if (firedKeys.has(key)) return;

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
        if (!isNotifiable(item, currentUserId)) continue;

        const triggerAt = parseTriggerMs(item.triggerAt);
        if (Number.isNaN(triggerAt)) continue;

        const alerts = item.alerts || {};
        const skipFiveMin =
          Boolean(alerts.fiveMinFired) ||
          wasScheduledInsideFiveMinuteWindow(item, triggerAt);

        if (!skipFiveMin && isWithinFiveMinuteWindow(triggerAt, now)) {
          fire(item, 'fiveMin');
        }
        if (!alerts.exactTimeFired && isDueNowWindow(triggerAt, now)) {
          fire(item, 'exact');
        }
      }
    };

    for (const item of list) {
      if (!item?.id || !item?.triggerAt) continue;

      if (!isNotifiable(item, currentUserId)) continue;

      const triggerAt = parseTriggerMs(item.triggerAt);
      if (Number.isNaN(triggerAt)) continue;

      const fiveMinBefore = triggerAt - FIVE_MIN_MS;
      const alerts = item.alerts || {};
      const skipFiveMin =
        Boolean(alerts.fiveMinFired) ||
        wasScheduledInsideFiveMinuteWindow(item, triggerAt);

      schedule(item, 'fiveMin', fiveMinBefore, skipFiveMin);
      schedule(item, 'exact', triggerAt, Boolean(alerts.exactTimeFired));
    }

    const liveKeys = new Set();
    for (const item of list) {
      liveKeys.add(`${item.kind}:${item.id}:fiveMin:${item.triggerAt}`);
      liveKeys.add(`${item.kind}:${item.id}:exact:${item.triggerAt}`);
    }
    for (const key of [...firedKeys]) {
      if (!liveKeys.has(key)) firedKeys.delete(key);
    }

    const pollId = window.setInterval(scanAll, pollMs);
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
