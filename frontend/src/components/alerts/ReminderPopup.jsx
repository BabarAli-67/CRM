import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.hook.js';
import {
  updateCallback,
  updateCloserCallback,
} from '../../services/callback.service.js';
import { setLeadFollowUp } from '../../services/lead.service.js';
import { startAlarmLoop, stopChime } from '../../utils/audioAlert.js';
import { showBrowserNotification } from '../../utils/browserNotification.util.js';

/** Auto-stop alarm + dismiss if the agent never interacts */
const AUTO_STOP_MS = 60_000;
/** Snooze pushes the next ring this far ahead */
const SNOOZE_MS = 3 * 60 * 1000;

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
  if (kind === 'closer_callback') {
    return `/dashboard/closer/callbacks#${hash}`;
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
  const el = document.querySelector(`[data-reminder-row="${kind}-${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('ring-2', 'ring-amber-500', 'ring-offset-2');
  window.setTimeout(() => {
    el.classList.remove('ring-2', 'ring-amber-500', 'ring-offset-2');
  }, 2500);
}

async function persistSnooze(reminder) {
  const nextAt = new Date(Date.now() + SNOOZE_MS).toISOString();
  const kind = reminder.kind;

  if (kind === 'callback') {
    await updateCallback(reminder.id, { callbackAt: nextAt });
    return nextAt;
  }
  if (kind === 'closer_callback') {
    await updateCloserCallback(reminder.id, {
      callbackAt: nextAt,
      status: 'pending',
    });
    return nextAt;
  }
  if (kind === 'followup') {
    await setLeadFollowUp(reminder.id, {
      callbackAt: nextAt,
      notes: reminder.item?.followUp?.notes || reminder.item?.notes || null,
    });
    return nextAt;
  }
  return nextAt;
}

/** Mark callback as attended so OVERDUE clears and chimes stop. */
async function persistAttended(reminder) {
  if (!reminder?.id) return null;

  if (reminder.kind === 'callback') {
    const updated = await updateCallback(reminder.id, { status: 'attended' });
    const leadId =
      reminder.item?.leadId?._id ||
      reminder.item?.leadId ||
      updated?.leadId?._id ||
      updated?.leadId;
    if (leadId) {
      try {
        await setLeadFollowUp(leadId, { acknowledged: true });
      } catch {
        // Backend updateCallback already syncs when possible
      }
    }
    return updated;
  }
  if (reminder.kind === 'closer_callback') {
    const updated = await updateCloserCallback(reminder.id, {
      status: 'attended',
    });
    const leadId =
      reminder.item?.leadId?._id ||
      reminder.item?.leadId ||
      updated?.leadId?._id ||
      updated?.leadId;
    if (leadId) {
      try {
        await setLeadFollowUp(leadId, { acknowledged: true });
      } catch {
        // ignore — closer path may sync via updateCloserCallback
      }
    }
    return updated;
  }
  if (reminder.kind === 'followup') {
    return setLeadFollowUp(reminder.id, { acknowledged: true });
  }
  return null;
}

function patchCallbackCache(queryClient, queryKey, id, patch) {
  queryClient.setQueryData(queryKey, (old) => {
    if (!Array.isArray(old)) return old;
    return old.map((cb) =>
      String(cb._id) === String(id) ? { ...cb, ...patch } : cb
    );
  });
}

function patchLeadFollowUpAcknowledged(queryClient, leadId) {
  if (!leadId) return;
  const patchList = (old) => {
    if (!Array.isArray(old)) return old;
    return old.map((lead) => {
      if (String(lead._id) !== String(leadId)) return lead;
      return {
        ...lead,
        followUp: {
          ...(lead.followUp || {}),
          acknowledged: true,
          alerts: {
            fiveMinFired: true,
            exactTimeFired: true,
            ...(lead.followUp?.alerts || {}),
          },
        },
      };
    });
  };
  queryClient.setQueryData(['myLeads'], patchList);
  queryClient.setQueryData(['assignedLeads'], patchList);
}

/**
 * Single toast card — prominent callback / follow-up alert with Close + Snooze.
 */
function ReminderPopup({
  reminder,
  onClose,
  onView,
  onSnooze,
  snoozing = false,
}) {
  if (!reminder) return null;

  const isExact = reminder.alertType === 'exact';
  const headline = isExact
    ? `Callback DUE NOW: ${reminder.businessName} - ${reminder.phone}`
    : `Upcoming Callback in 5 mins: ${reminder.businessName} - ${reminder.phone}`;

  const followupHeadline = isExact
    ? `Follow-up DUE NOW: ${reminder.businessName} - ${reminder.phone}`
    : `Upcoming Follow-up in 5 mins: ${reminder.businessName} - ${reminder.phone}`;

  const title = reminder.kind === 'followup' ? followupHeadline : headline;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-amber-400/40 bg-amber-50 shadow-2xl shadow-slate-900/30"
    >
      <div className="border-b border-amber-200/80 bg-amber-100/80 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800/80">
              {kindLabel(reminder.kind)}
              {isExact ? ' · Due now' : ' · In 5 minutes'}
            </p>
            <p className="mt-1 text-sm font-semibold leading-snug text-amber-950">
              {title}
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
          <span className="font-medium">Business:</span> {reminder.businessName}
        </p>
        <p className="text-sm">
          <span className="font-medium">Phone:</span> {reminder.phone}
        </p>
        <p className="text-sm">
          <span className="font-medium">Scheduled (PKT):</span>{' '}
          {formatPkt(reminder.triggerAt)}
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-950 hover:bg-amber-100"
          >
            Close
          </button>
          <button
            type="button"
            disabled={snoozing}
            onClick={onSnooze}
            className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {snoozing ? 'Snoozing…' : 'Snooze (+3 min)'}
          </button>
          <button
            type="button"
            onClick={onView}
            className="rounded-md border border-amber-400/50 bg-amber-100/60 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-200/70"
          >
            View
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
 * Starts a looping alarm while a popup is visible; silences on Close / Snooze / View / 60s.
 */
export function ReminderPopupHost() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState(() => [...queue]);
  const [snoozing, setSnoozing] = useState(false);

  useEffect(() => subscribe(setSnapshot), []);

  const active = snapshot[0] || null;

  const silenceAndDismiss = useCallback(() => {
    stopChime();
    dismissFront();
  }, []);

  const markAttendedOptimistic = useCallback(
    (reminder) => {
      if (!reminder) return;
      const patch = {
        status: 'attended',
        alerts: { fiveMinFired: true, exactTimeFired: true },
      };
      if (reminder.kind === 'callback') {
        patchCallbackCache(queryClient, ['myCallbacks'], reminder.id, patch);
        const leadId = reminder.item?.leadId?._id || reminder.item?.leadId;
        patchLeadFollowUpAcknowledged(queryClient, leadId);
      } else if (reminder.kind === 'closer_callback') {
        patchCallbackCache(
          queryClient,
          ['closerCallbacks'],
          reminder.id,
          patch
        );
        const leadId = reminder.item?.leadId?._id || reminder.item?.leadId;
        patchLeadFollowUpAcknowledged(queryClient, leadId);
      } else if (reminder.kind === 'followup') {
        patchLeadFollowUpAcknowledged(queryClient, reminder.id);
      }
    },
    [queryClient]
  );

  const handleClose = useCallback(async () => {
    if (!active) {
      silenceAndDismiss();
      return;
    }
    // Close = acknowledge: stop ringing + clear overdue
    markAttendedOptimistic(active);
    silenceAndDismiss();
    try {
      await persistAttended(active);
      queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
    } catch {
      queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
    }
  }, [active, silenceAndDismiss, markAttendedOptimistic, queryClient]);

  const handleView = useCallback(async () => {
    if (!active) return;
    const path = viewPathFor(active.kind, active.id, user?.role);
    const kind = active.kind;
    const id = active.id;

    markAttendedOptimistic(active);
    stopChime();
    dismissFront();
    navigate(path);

    window.setTimeout(() => {
      scrollToReminderRow(kind, id);
    }, 120);

    try {
      await persistAttended(active);
      queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
    } catch {
      queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
    }
  }, [active, navigate, user?.role, markAttendedOptimistic, queryClient]);

  const handleSnooze = useCallback(async () => {
    if (!active || snoozing) return;
    setSnoozing(true);
    try {
      stopChime();
      const nextAt = await persistSnooze(active);

      // Optimistic local update so the agenda reflects the snooze immediately
      if (active.kind === 'callback') {
        queryClient.setQueryData(['myCallbacks'], (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((cb) =>
            String(cb._id) === String(active.id)
              ? {
                  ...cb,
                  callbackAt: nextAt,
                  alerts: { fiveMinFired: false, exactTimeFired: false },
                }
              : cb
          );
        });
      } else if (active.kind === 'closer_callback') {
        queryClient.setQueryData(['closerCallbacks'], (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((cb) =>
            String(cb._id) === String(active.id)
              ? {
                  ...cb,
                  callbackAt: nextAt,
                  alerts: { fiveMinFired: false, exactTimeFired: false },
                }
              : cb
          );
        });
      }

      queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
      dismissFront();
    } catch {
      // Keep popup visible if persist failed so the agent can Close
    } finally {
      setSnoozing(false);
    }
  }, [active, snoozing, queryClient]);

  // Start / restart looping alarm + OS notification whenever the front reminder changes
  useEffect(() => {
    if (!active) {
      stopChime();
      return undefined;
    }

    const isExact = active.alertType === 'exact';
    const label =
      active.kind === 'followup'
        ? isExact
          ? `Follow-up DUE NOW: ${active.businessName} - ${active.phone}`
          : `Upcoming Follow-up in 5 mins: ${active.businessName} - ${active.phone}`
        : isExact
          ? `Callback DUE NOW: ${active.businessName} - ${active.phone}`
          : `Upcoming Callback in 5 mins: ${active.businessName} - ${active.phone}`;

    showBrowserNotification({
      title: isExact ? 'Flash CRM · Due Now' : 'Flash CRM · 5 min warning',
      body: label,
      tag: `flashcrm-${active.kind}-${active.id}-${active.alertType}`,
    });

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
        onSnooze={handleSnooze}
        snoozing={snoozing}
      />
    </div>
  );
}

export default ReminderPopup;
