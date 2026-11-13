import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  markCallbackAlert,
  markCloserCallbackAlert,
  updateCallback,
  updateCloserCallback,
} from '../../services/callback.service.js';
import { markRetentionAlert } from '../../services/handover.service.js';
import {
  markLeadFollowUpAlert,
  setLeadFollowUp,
} from '../../services/lead.service.js';
import { startAlarmLoop, stopChime } from '../../utils/audioAlert.js';
import { showBrowserNotification } from '../../utils/browserNotification.util.js';

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

  // Avoid stacking duplicate alerts for the same target + phase
  const alreadyQueued = queue.some(
    (e) =>
      e.kind === payload.kind &&
      String(e.id) === String(payload.id) &&
      e.alertType === (payload.alertType || 'alert')
  );
  if (alreadyQueued) return;

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
    clientName:
      payload.clientName ||
      payload.item?.clientName ||
      '',
    phone: payload.phone || payload.item?.phone || '—',
    item: payload.item,
  };

  queue.push(entry);
  notify();
}

/**
 * Drop queued popups for a target (e.g. retention rescheduled) and silence
 * the alarm if the active card was removed.
 */
export function clearQueuedReminders({ kind, id } = {}) {
  if (!kind && id == null) {
    queue.length = 0;
    stopChime();
    notify();
    return;
  }
  const before = queue[0]?.queueId;
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    const row = queue[i];
    const kindOk = !kind || row.kind === kind;
    const idOk = id == null || String(row.id) === String(id);
    if (kindOk && idOk) queue.splice(i, 1);
  }
  if (before && queue[0]?.queueId !== before) {
    stopChime();
  }
  if (queue.length === 0) stopChime();
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

const kindLabel = (kind) => {
  if (kind === 'followup') return 'Lead Follow-up';
  if (kind === 'retention') return 'Retention Callback';
  return 'Callback';
};

function patchCallbackAlerts(queryClient, queryKey, id, alertPatch) {
  queryClient.setQueryData(queryKey, (old) => {
    if (!Array.isArray(old)) return old;
    return old.map((cb) => {
      if (String(cb._id) !== String(id)) return cb;
      return {
        ...cb,
        alerts: {
          fiveMinFired: false,
          exactTimeFired: false,
          ...(cb.alerts || {}),
          ...alertPatch,
        },
      };
    });
  });
}

function patchLeadFollowUpAlerts(queryClient, leadId, alertPatch, extra = {}) {
  if (!leadId) return;
  const patchList = (old) => {
    if (!Array.isArray(old)) return old;
    return old.map((lead) => {
      if (String(lead._id) !== String(leadId)) return lead;
      return {
        ...lead,
        followUp: {
          ...(lead.followUp || {}),
          ...extra,
          alerts: {
            fiveMinFired: false,
            exactTimeFired: false,
            ...(lead.followUp?.alerts || {}),
            ...alertPatch,
          },
        },
      };
    });
  };
  queryClient.setQueryData(['myLeads'], patchList);
  queryClient.setQueryData(['assignedLeads'], patchList);
}

function patchRetentionAlert(queryClient, id, alertPatch, extra = {}) {
  queryClient.setQueryData(['retentionReminders'], (old) => {
    if (!Array.isArray(old)) return old;
    return old.map((lead) => {
      if (String(lead._id) !== String(id)) return lead;
      return {
        ...lead,
        handover: {
          ...(lead.handover || {}),
          retention: {
            ...(lead.handover?.retention || {}),
            ...extra,
            alerts: {
              fiveMinFired: true,
              exactTimeFired: false,
              ...(lead.handover?.retention?.alerts || {}),
              ...alertPatch,
            },
          },
        },
      };
    });
  });
}

/**
 * Persist only the phase that was dismissed — never both flags together.
 * Warning OK → fiveMinFired only (due alert must still fire).
 * Due OK → exactTimeFired only (+ attend so OVERDUE clears after due).
 */
async function persistPhaseAck(reminder, queryClient) {
  if (!reminder?.id) return;

  const isWarning = reminder.alertType === 'fiveMin';
  const alertPatch = isWarning
    ? { fiveMinFired: true }
    : { exactTimeFired: true };

  if (reminder.kind === 'retention') {
    patchRetentionAlert(queryClient, reminder.id, { exactTimeFired: true });
    await markRetentionAlert(reminder.id, { exactTimeFired: true });
    queryClient.invalidateQueries({ queryKey: ['retentionReminders'] });
    queryClient.invalidateQueries({ queryKey: ['lead', reminder.id] });
    queryClient.invalidateQueries({
      queryKey: ['lead', reminder.id, 'portfolio'],
    });
    return;
  }

  // Optimistic local flags (phase-scoped)
  if (reminder.kind === 'callback') {
    patchCallbackAlerts(queryClient, ['myCallbacks'], reminder.id, alertPatch);
  } else if (reminder.kind === 'closer_callback') {
    patchCallbackAlerts(
      queryClient,
      ['closerCallbacks'],
      reminder.id,
      alertPatch
    );
  } else if (reminder.kind === 'followup') {
    patchLeadFollowUpAlerts(
      queryClient,
      reminder.id,
      alertPatch,
      isWarning ? {} : { acknowledged: true }
    );
  }

  // Persist phase flag
  if (reminder.kind === 'callback') {
    await markCallbackAlert(reminder.id, alertPatch);
  } else if (reminder.kind === 'closer_callback') {
    await markCloserCallbackAlert(reminder.id, alertPatch);
  } else if (reminder.kind === 'followup') {
    await markLeadFollowUpAlert(reminder.id, alertPatch);
  }

  // Due phase only: clear overdue / stop future rings for this schedule
  if (!isWarning) {
    if (reminder.kind === 'callback') {
      await updateCallback(reminder.id, { status: 'attended' });
      const leadId = reminder.item?.leadId?._id || reminder.item?.leadId;
      if (leadId) {
        try {
          await setLeadFollowUp(leadId, { acknowledged: true });
        } catch {
          // optional sync
        }
      }
    } else if (reminder.kind === 'closer_callback') {
      await updateCloserCallback(reminder.id, { status: 'attended' });
    } else if (reminder.kind === 'followup') {
      await setLeadFollowUp(reminder.id, { acknowledged: true });
    }
  }

  queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
  queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
  queryClient.invalidateQueries({ queryKey: ['myLeads'] });
  queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
}

/**
 * Single toast card — phase-specific alert with OK.
 * Retention: Business + Client + OK only.
 */
function ReminderPopup({ reminder, onOk, acknowledging = false }) {
  if (!reminder) return null;

  const isRetention = reminder.kind === 'retention';
  const isExact = reminder.alertType === 'exact';

  if (isRetention) {
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-live="assertive"
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-orange-400/40 bg-zinc-950 shadow-2xl shadow-black/50"
      >
        <div className="border-b border-orange-500/30 bg-orange-600/20 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-300/90">
            Retention Callback · Due now
          </p>
        </div>

        <div className="space-y-2 px-4 py-3 text-zinc-100">
          <p className="text-sm">
            <span className="font-medium text-zinc-400">Business Name:</span>{' '}
            {reminder.businessName}
          </p>
          <p className="text-sm">
            <span className="font-medium text-zinc-400">Client Name:</span>{' '}
            {reminder.clientName?.trim() || '—'}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="button"
              disabled={acknowledging}
              onClick={onOk}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
            >
              {acknowledging ? 'OK…' : 'OK'}
            </button>
            {queue.length > 1 ? (
              <span className="ml-auto text-xs text-zinc-500">
                +{queue.length - 1} more
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const headline = isExact
    ? `Callback Due Now: ${reminder.businessName}`
    : `Upcoming Callback in 5 mins: ${reminder.businessName}`;

  const followupHeadline = isExact
    ? `Follow-up Due Now: ${reminder.businessName}`
    : `Upcoming Follow-up in 5 mins: ${reminder.businessName}`;

  const title = reminder.kind === 'followup' ? followupHeadline : headline;
  const message = isExact
    ? 'It is now scheduled time for this callback.'
    : `Scheduled for ${formatPkt(reminder.triggerAt)}`;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-amber-400/40 bg-amber-50 shadow-2xl shadow-slate-900/30"
    >
      <div className="border-b border-amber-200/80 bg-amber-100/80 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800/80">
          {kindLabel(reminder.kind)}
          {isExact ? ' · Due now' : ' · In 5 minutes'}
        </p>
        <p className="mt-1 text-sm font-semibold leading-snug text-amber-950">
          {title}
        </p>
      </div>

      <div className="space-y-2 px-4 py-3 text-amber-950">
        <p className="text-sm text-amber-900/90">{message}</p>
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
            disabled={acknowledging}
            onClick={onOk}
            className="rounded-md bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {acknowledging ? 'OK…' : 'OK'}
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
 * Alarm loops while visible; OK stops audio immediately and acknowledges.
 * Retention stays until OK (no 60s auto-ack). Other kinds keep 60s auto-ack.
 */
export function ReminderPopupHost() {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState(() => [...queue]);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => subscribe(setSnapshot), []);

  const active = snapshot[0] || null;

  const handleOk = useCallback(async () => {
    if (!active || acknowledging) return;
    // Stop audio first — before any await — so the beep never sticks
    stopChime();
    setAcknowledging(true);
    const current = active;
    dismissFront();
    // If queue is now empty, guarantee silence again after unmount path
    if (queue.length === 0) stopChime();
    try {
      await persistPhaseAck(current, queryClient);
    } catch {
      queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
      queryClient.invalidateQueries({ queryKey: ['retentionReminders'] });
    } finally {
      stopChime();
      setAcknowledging(false);
    }
  }, [active, acknowledging, queryClient]);

  // Start / restart looping alarm + OS notification whenever the front reminder changes
  useEffect(() => {
    if (!active) {
      stopChime();
      return undefined;
    }

    const isExact = active.alertType === 'exact';
    const isRetention = active.kind === 'retention';
    const label = isRetention
      ? `Retention Due Now: ${active.businessName}`
      : active.kind === 'followup'
        ? isExact
          ? `Follow-up Due Now: ${active.businessName}`
          : `Upcoming Follow-up in 5 mins: ${active.businessName}`
        : isExact
          ? `Callback Due Now: ${active.businessName}`
          : `Upcoming Callback in 5 mins: ${active.businessName}`;

    showBrowserNotification({
      title: isRetention
        ? 'Flash CRM · Retention Due'
        : isExact
          ? 'Flash CRM · Due Now'
          : 'Flash CRM · 5 min warning',
      body: label,
      tag: `flashcrm-${active.kind}-${active.id}-${active.alertType}`,
    });

    let cancelled = false;
    startAlarmLoop().then(() => {
      // If this popup was already closed while audio was loading, stay silent
      if (cancelled) stopChime();
    });

    // Retention: stay until OK. Other kinds: 60s auto-ack.
    if (isRetention) {
      return () => {
        cancelled = true;
        stopChime();
      };
    }

    const safetyId = window.setTimeout(() => {
      stopChime();
      const current = queue[0];
      if (current && current.queueId === active.queueId) {
        dismissFront();
        persistPhaseAck(current, queryClient).catch(() => {
          queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
          queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
          queryClient.invalidateQueries({ queryKey: ['myLeads'] });
          queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
        });
      }
    }, AUTO_STOP_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(safetyId);
      stopChime();
    };
  }, [active?.queueId, queryClient]);

  useEffect(() => () => stopChime(), []);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:justify-end">
      <ReminderPopup
        reminder={active}
        onOk={handleOk}
        acknowledging={acknowledging}
      />
    </div>
  );
}

export default ReminderPopup;
