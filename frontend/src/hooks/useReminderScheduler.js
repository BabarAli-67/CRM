import { useEffect, useMemo, useRef } from 'react';
import { enqueueReminderPopup } from '../components/alerts/ReminderPopup.jsx';
import useAuth from './useAuth.hook.js';

const FIVE_MIN_MS = 5 * 60 * 1000;
/** Exact due: fire when callbackAt <= now; keep overdue armed up to 24h. */
const EXACT_OVERDUE_MAX_MS = 24 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const POLL_MS = 5_000;
const FAST_POLL_MS = 3_000;

/** Module-level fire guards so reschedule can clear them from outside the hook. */
const firedKeys = new Set();

/**
 * Clear session fire guards (and optionally only for one reminder target).
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

function parseTriggerMs(triggerAt) {
  if (triggerAt == null || triggerAt === '') return NaN;
  const ms = new Date(triggerAt).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function isWithinFiveMinuteWindow(triggerMs, now = Date.now()) {
  const diffMs = triggerMs - now;
  return diffMs > 0 && diffMs <= FIVE_MIN_MS;
}

function isDueNowWindow(triggerMs, now = Date.now()) {
  const diffMs = triggerMs - now;
  return diffMs <= 0 && diffMs >= -EXACT_OVERDUE_MAX_MS;
}

function wasScheduledInsideFiveMinuteWindow(item, triggerMs) {
  const createdRaw =
    item?.item?.updatedAt ??
    item?.updatedAt ??
    item?.createdAt ??
    item?.item?.createdAt;
  if (createdRaw == null || createdRaw === '') return false;
  const createdMs = new Date(createdRaw).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return triggerMs - createdMs < FIVE_MIN_MS;
}

function isNotifiable(item, currentUserId) {
  if (item?.notifyAll) return true;
  const notifyIds = (item?.notifyUserIds || []).map(String);
  return notifyIds.includes(currentUserId);
}

/**
 * Schedule 5-minute and exact-time reminder chimes for callbacks / lead follow-ups.
 * Persist alert flags only after the popup is successfully enqueued.
 */
export default function useReminderScheduler(items = [], options = {}) {
  const { user } = useAuth();
  const currentUserId = String(
    options.currentUserId ?? user?._id ?? user?.id ?? ''
  );
  const showPopup = options.showPopup ?? enqueueReminderPopup;
  const markAlert = options.markAlert;
  const pollIntervalMs =
    typeof options.pollIntervalMs === 'number' && options.pollIntervalMs > 0
      ? options.pollIntervalMs
      : null;

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
          updatedAt: item.updatedAt ?? item?.item?.updatedAt ?? null,
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

    const needsFastPoll = list.some((item) => item?.kind === 'retention');
    const pollMs = pollIntervalMs || (needsFastPoll ? FAST_POLL_MS : POLL_MS);

    const fire = async (item, alertType) => {
      const key = `${item.kind}:${item.id}:${alertType}:${item.triggerAt}`;
      if (firedKeys.has(key)) return;

      const triggerMs = parseTriggerMs(item.triggerAt);
      if (Number.isNaN(triggerMs)) return;

      const now = Date.now();
      if (alertType === 'fiveMin') {
        if (wasScheduledInsideFiveMinuteWindow(item, triggerMs)) return;
        if (!isWithinFiveMinuteWindow(triggerMs, now)) return;
      }
      if (alertType === 'exact') {
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
        firedKeys.delete(key);
        return;
      }

      try {
        const payload =
          alertType === 'fiveMin'
            ? { id: item.id, kind: item.kind, fiveMinFired: true }
            : { id: item.id, kind: item.kind, exactTimeFired: true };
        await markAlertRef.current?.(payload);
      } catch {
        // Keep firedKeys so we don't spam popups if the mark-alert API fails
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

      if (delta > 0) {
        if (delta > MAX_TIMEOUT_MS) return;
        const timerId = setTimeout(() => {
          fire(item, alertType);
        }, delta);
        timers.push(timerId);
        return;
      }

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

    scanAll();

    return () => {
      for (const timerId of timers) clearTimeout(timerId);
      window.clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleKey, currentUserId, pollIntervalMs]);
}
