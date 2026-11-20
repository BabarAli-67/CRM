import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateCloserCallback } from '../../services/callback.service.js';
import CloserScheduleCallbackModal from './CloserScheduleCallbackModal.jsx';

const DUE_SOON_MS = 15 * 60 * 1000;

/** e.g. Wed, 23 Sept, 07:59 pm PKT */
const formatPkt = (value) => {
  if (!value) return '—';
  const raw = new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  // en-GB may yield "Wed, 23 Sept, 07:59 pm" or comma variants — normalize + PKT
  return `${raw.replace(/\s+/g, ' ').trim()} PKT`;
};

const displayOrDash = (value) => {
  const s = value == null ? '' : String(value).trim();
  return s || '—';
};

/** Prefer callback fields; fall back to populated leadId. */
const resolveContact = (row) => {
  const lead =
    row.leadId && typeof row.leadId === 'object' ? row.leadId : null;
  return {
    personalEmail: displayOrDash(row.personalEmail || lead?.personalEmail),
    businessEmail: displayOrDash(row.businessEmail || lead?.businessEmail),
    personalPhone: displayOrDash(row.personalPhone || lead?.personalPhone),
    businessPhone: displayOrDash(row.businessPhone || lead?.businessPhone),
  };
};

const isFromAgent = (row) => Boolean(row.agentId);

function statusBucket(row, now = Date.now()) {
  if (row.status === 'attended') return 'attended';
  if (row.status === 'completed') return 'completed';
  if (row.status === 'cancelled') return 'cancelled';
  const at = new Date(row.callbackAt).getTime();
  if (Number.isNaN(at)) return 'pending';
  if (at < now) return 'overdue';
  if (at - now <= DUE_SOON_MS) return 'due_soon';
  return 'upcoming';
}

const BADGE = {
  upcoming: {
    label: 'Upcoming',
    className: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/35',
  },
  due_soon: {
    label: 'Due soon',
    className: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40',
  },
  overdue: {
    label: 'Overdue',
    className:
      'animate-pulse bg-red-500/20 text-red-300 ring-1 ring-red-500/50',
  },
  attended: {
    label: 'Attended',
    className: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/35',
  },
  completed: {
    label: 'Completed',
    className: 'bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-600/40',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-600/40',
  },
  pending: {
    label: 'Pending',
    className: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  },
};

/** Closer-created Direct Contact: owned by closer, no linked lead, not from agent. */
export function isCloserDirectContactCallback(row) {
  if (!row) return false;
  const leadId = row.leadId?._id || row.leadId || null;
  if (leadId || row.promotedLeadId) return false;
  if (row.status === 'promoted') return false;
  if (row.agentId) return false;
  return Boolean(row.closerId);
}

/**
 * Closer personal callback agenda — card list with urgency badges.
 */
export default function CloserCallbackTable({
  callbacks = [],
  onOpenLead = null,
  onMoveToLeads = null,
  emptyMessage = 'No callbacks scheduled. Use + Add Callback or schedule from Leads.',
}) {
  const queryClient = useQueryClient();
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [actionError, setActionError] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(
    () =>
      [...callbacks].sort(
        (a, b) => new Date(a.callbackAt) - new Date(b.callbackAt)
      ),
    [callbacks]
  );

  const doneMutation = useMutation({
    mutationFn: (id) => updateCloserCallback(id, { status: 'completed' }),
    onSuccess: () => {
      setActionError('');
      queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['adminCallbacks'] });
    },
    onError: (err) => {
      setActionError(
        err?.response?.data?.message || 'Failed to mark callback done.'
      );
    },
  });

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">{emptyMessage}</p>
    );
  }

  return (
    <div className="space-y-3">
      {actionError ? (
        <p role="alert" className="text-sm text-red-400">
          {actionError}
        </p>
      ) : null}

      <ul className="space-y-3">
        {rows.map((row) => {
          const bucket = statusBucket(row, nowTick);
          const badge = BADGE[bucket] || BADGE.pending;
          const leadId = row.leadId?._id || row.leadId || null;
          const contact = resolveContact(row);
          const fromAgent = isFromAgent(row);
          const canMoveToLeads =
            typeof onMoveToLeads === 'function' &&
            isCloserDirectContactCallback(row);
          const marking =
            doneMutation.isPending && doneMutation.variables === row._id;

          return (
            <li
              key={row._id}
              data-reminder-row={`closer_callback-${row._id}`}
              className={[
                'rounded-2xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-4 transition-colors hover:border-zinc-700/80',
                bucket === 'overdue' ? 'border-red-500/30 bg-red-950/20' : '',
                bucket === 'due_soon' ? 'border-amber-500/25 bg-amber-950/10' : '',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-white">
                      {row.businessName || '—'}
                    </h3>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    {fromAgent ? (
                      <span className="inline-flex rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-300 ring-1 ring-orange-500/30">
                        From Agent
                      </span>
                    ) : null}
                  </div>

                  <dl className="grid gap-1 text-sm sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Personal Email
                      </dt>
                      <dd className="truncate text-zinc-300">
                        {contact.personalEmail}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Business Email
                      </dt>
                      <dd className="truncate text-zinc-300">
                        {contact.businessEmail}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Personal Number
                      </dt>
                      <dd className="truncate text-zinc-300">
                        {contact.personalPhone}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Business Number
                      </dt>
                      <dd className="truncate text-zinc-300">
                        {contact.businessPhone}
                      </dd>
                    </div>
                  </dl>

                  <p className="pt-0.5 text-sm font-medium text-zinc-200">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                      Date &amp; Time (PKT){' '}
                    </span>
                    {formatPkt(row.callbackAt)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {bucket !== 'completed' && bucket !== 'cancelled' ? (
                    <>
                      <button
                        type="button"
                        disabled={marking}
                        onClick={() => {
                          setActionError('');
                          doneMutation.mutate(row._id);
                        }}
                        className="rounded-lg bg-emerald-600/90 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {marking ? 'Saving…' : 'Mark Done'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRescheduleTarget(row)}
                        className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60"
                      >
                        Reschedule
                      </button>
                    </>
                  ) : null}
                  {leadId && onOpenLead ? (
                    <button
                      type="button"
                      onClick={() => onOpenLead(row)}
                      className="rounded-lg border border-orange-500/40 bg-orange-600/15 px-2.5 py-1.5 text-xs font-semibold text-orange-200 hover:bg-orange-600/30"
                    >
                      Open Lead
                    </button>
                  ) : null}
                  {canMoveToLeads ? (
                    <button
                      type="button"
                      onClick={() => onMoveToLeads(row)}
                      className="rounded-lg bg-[#F25E26] px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#F25E26]/25 hover:bg-[#ff6a33]"
                    >
                      Move to Leads
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <CloserScheduleCallbackModal
        open={Boolean(rescheduleTarget)}
        callback={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onSuccess={() => setRescheduleTarget(null)}
      />
    </div>
  );
}

/** Shared bucket helper for summary cards on My Callbacks page. */
export function summarizeCloserCallbacks(callbacks = [], now = Date.now()) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  let today = 0;
  let overdue = 0;
  let upcoming = 0;

  for (const row of callbacks) {
    if (
      row.status === 'completed' ||
      row.status === 'attended' ||
      row.status === 'cancelled'
    ) {
      continue;
    }
    const at = new Date(row.callbackAt).getTime();
    if (Number.isNaN(at)) continue;
    if (at < now) {
      overdue += 1;
      continue;
    }
    if (at >= startOfDay.getTime() && at <= endOfDay.getTime()) {
      today += 1;
    }
    upcoming += 1;
  }

  return { today, overdue, upcoming };
}
