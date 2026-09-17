import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.hook.js';
import { startAlarmLoop, stopChime } from '../../utils/audioAlert.js';

/** Auto-stop alarm + dismiss if the agent never interacts */
const AUTO_STOP_MS = 60_000;

/** @type {Array<object>} */
const queue = [];
/** @type {Set<(q: Array<object>) => void>} */
const listeners = new Set();

const notify = () => {
  const snapshot = [...queue];
  for (const listener of listeners) listener(snapshot);
};

/**
 * Enqueue a reminder toast (used by useReminderScheduler showPopup).
 * Multiple alerts queue — only one is shown at a time.
 */
export function enqueueReminderPopup(payload) {
  if (!payload) return;

  const entry = {
    queueId: `${payload.kind || 'item'}-${payload.id}-${payload.alertType || 'alert'}-${Date.now()}`,
    id: payload.id,
    kind: payload.kind,
    alertType: payload.alertType,
    triggerAt: payload.triggerAt,
    businessName:
      payload.businessName ||
      payload.item?.businessName ||
      'Unknown business',
    phone: payload.phone || payload.item?.phone || '—',
    item: payload.item,
  };

  queue.push(entry);
  notify();
}

function subscribe(listener) {
  listeners.add(listener);
  listener([...queue]);
  return () => listeners.delete(listener);
}

function dismissFront() {
  if (queue.length === 0) return;
  queue.shift();
  notify();
}

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const kindLabel = (kind) =>
  kind === 'followup' ? 'Lead Follow-up' : 'Callback';

const viewPathFor = (kind, id, role) => {
  const hash = `reminder-${kind}-${id}`;
  if (kind === 'callback') {
    return `/dashboard/sales-agent/callbacks#${hash}`;
  }
  if (kind === 'followup') {
    if (role === 'closer') {
      return `/dashboard/closer/leads#${hash}`;
    }
    return `/dashboard/sales-agent/leads#${hash}`;
  }
  if (role === 'closer') {
    return `/dashboard/closer#${hash}`;
  }
  return `/dashboard/sales-agent#${hash}`;
};

function scrollToReminderRow(kind, id) {
  const el = document.querySelector(
    `[data-reminder-row="${kind}-${id}"]`
  );
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('ring-2', 'ring-amber-500', 'ring-offset-2');
  window.setTimeout(() => {
    el.classList.remove('ring-2', 'ring-amber-500', 'ring-offset-2');
  }, 2500);
}

/**
 * Single toast card — amber banner language from Phase 2 attendance alerts.
 */
function ReminderPopup({ reminder, onClose, onView }) {
  if (!reminder) return null;

  const isExact = reminder.alertType === 'exact';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="pointer-events-auto w-full max-w-md overflow-hidden rounded-md border border-amber-200 bg-amber-50 shadow-lg shadow-slate-900/10"
    >
      <div className="border-b border-amber-200/80 bg-amber-100/60 px-4 py-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800/80">
              {kindLabel(reminder.kind)}
              {isExact ? ' · Due now' : ' · In 5 minutes'}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-amber-950">
              {reminder.businessName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-sm font-medium text-amber-900/70 hover:bg-amber-200/60 hover:text-amber-950"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-2 px-4 py-3 text-amber-950">
        <p className="text-sm">
          <span className="font-medium">Phone:</span> {reminder.phone}
        </p>
        <p className="text-sm">
          <span className="font-medium">Scheduled (PKT):</span>{' '}
          {formatPkt(reminder.triggerAt)}
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onView}
            className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
          >
            View
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-100"
          >
            Dismiss
          </button>
          {queue.length > 1 ? (
            <span className="ml-auto text-xs text-amber-800/70">
              +{queue.length - 1} more
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Mount once in the authenticated shell. Shows one reminder at a time from the queue.
 * Starts a looping alarm while a popup is visible; silences on dismiss / view / 60s.
 */
export function ReminderPopupHost() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState(() => [...queue]);

  useEffect(() => subscribe(setSnapshot), []);

  const active = snapshot[0] || null;

  const silenceAndDismiss = useCallback(() => {
    stopChime();
    dismissFront();
  }, []);

  const handleClose = useCallback(() => {
    silenceAndDismiss();
  }, [silenceAndDismiss]);

  const handleView = useCallback(() => {
    if (!active) return;
    const path = viewPathFor(active.kind, active.id, user?.role);
    stopChime();
    dismissFront();
    navigate(path);
    window.setTimeout(() => {
      scrollToReminderRow(active.kind, active.id);
    }, 120);
  }, [active, navigate, user?.role]);

  // Start / restart looping alarm whenever the front reminder changes
  useEffect(() => {
    if (!active) {
      stopChime();
      return undefined;
    }

    startAlarmLoop();

    const safetyId = window.setTimeout(() => {
      stopChime();
      dismissFront();
    }, AUTO_STOP_MS);

    return () => {
      window.clearTimeout(safetyId);
      stopChime();
    };
  }, [active?.queueId]);

  // Unmount / navigate away from shell
  useEffect(() => () => stopChime(), []);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:justify-end">
      <ReminderPopup
        reminder={active}
        onClose={handleClose}
        onView={handleView}
      />
    </div>
  );
}

export default ReminderPopup;
