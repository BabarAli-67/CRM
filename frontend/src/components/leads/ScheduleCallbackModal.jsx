import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCallback } from '../../services/callback.service.js';

const pad = (n) => String(n).padStart(2, '0');

const todayDateValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const digitsOnly = (raw, maxLen) => {
  const d = String(raw || '').replace(/\D/g, '');
  return maxLen ? d.slice(0, maxLen) : d;
};

const clampOnBlur = (raw, min, max, { padTo = 0 } = {}) => {
  if (raw === '' || raw == null) return '';
  const n = Number(raw);
  if (Number.isNaN(n)) return '';
  const clamped = Math.min(max, Math.max(min, Math.trunc(n)));
  return padTo > 0 ? String(clamped).padStart(padTo, '0') : String(clamped);
};

const splitDateTime = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) {
    return {
      date: todayDateValue(),
      hour: '09',
      minute: '00',
      period: 'AM',
    };
  }

  let h24 = d.getHours();
  const period = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;

  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour: pad(h12),
    minute: pad(d.getMinutes()),
    period,
  };
};

/** Combine local date + 12h clock into an ISO timestamp. */
const toIsoTimestamp = ({ date, hour, minute, period }) => {
  if (
    !date ||
    hour === '' ||
    minute === '' ||
    hour == null ||
    minute == null ||
    !period
  ) {
    return null;
  }

  let h = Number(hour);
  const mi = Number(minute);
  if (
    Number.isNaN(h) ||
    Number.isNaN(mi) ||
    h < 1 ||
    h > 12 ||
    mi < 0 ||
    mi > 59
  ) {
    return null;
  }

  if (period === 'AM') {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }

  const [y, m, day] = date.split('-').map(Number);
  const local = new Date(y, m - 1, day, h, mi, 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
};

const fieldClass =
  'w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

const numInputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 text-center text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

/**
 * Schedule a callback against an existing lead.
 * Date + 12h time (hour / minute / AM·PM) — no native datetime-local.
 */
export default function ScheduleCallbackModal({
  open,
  lead,
  onClose,
  onSuccess,
}) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayDateValue);
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('AM');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !lead) return;
    setError('');
    setNotes('');
    const parts = splitDateTime(lead.followUp?.callbackAt);
    setDate(parts.date);
    setHour(parts.hour);
    setMinute(parts.minute);
    setPeriod(parts.period);
  }, [open, lead]);

  const previewLabel = useMemo(() => {
    if (!date) return '';
    try {
      const iso = toIsoTimestamp({ date, hour, minute, period });
      if (!iso) return '';
      return new Date(iso).toLocaleString('en-PK', {
        timeZone: 'Asia/Karachi',
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }, [date, hour, minute, period]);

  const mutation = useMutation({
    mutationFn: (payload) => createCallback(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', lead?._id] });
      onSuccess?.();
      onClose?.();
    },
    onError: (err) => {
      setError(
        err?.response?.data?.message || 'Failed to schedule callback.'
      );
    },
  });

  if (!open || !lead) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!date) {
      setError('Please pick a callback date.');
      return;
    }

    const normalizedHour = clampOnBlur(hour, 1, 12, { padTo: 2 });
    const normalizedMinute = clampOnBlur(minute, 0, 59, { padTo: 2 });
    setHour(normalizedHour);
    setMinute(normalizedMinute);

    const iso = toIsoTimestamp({
      date,
      hour: normalizedHour,
      minute: normalizedMinute,
      period,
    });
    if (!iso) {
      setError('Please provide a valid date and time.');
      return;
    }

    mutation.mutate({
      leadId: lead._id,
      callbackAt: iso,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-4 backdrop-blur-sm sm:items-center">
      <button
        type="button"
        aria-label="Close form backdrop"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-callback-title"
        className="relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2
            id="schedule-callback-title"
            className="font-display text-lg font-semibold text-white"
          >
            Schedule Callback
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Lead
            </p>
            <p className="mt-1 font-medium text-white">{lead.businessName}</p>
            <p className="mt-0.5 text-sm text-zinc-400">{lead.phone}</p>
          </div>

          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span className="font-medium">Date</span>
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={fieldClass}
            />
          </label>

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-zinc-300">Time</p>
            <div className="grid grid-cols-3 gap-2">
              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Hour
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={12}
                  placeholder="HH"
                  value={hour}
                  onChange={(e) => setHour(digitsOnly(e.target.value, 2))}
                  onBlur={() =>
                    setHour(clampOnBlur(hour, 1, 12, { padTo: 2 }))
                  }
                  className={numInputClass}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Minute
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  placeholder="MM"
                  value={minute}
                  onChange={(e) => setMinute(digitsOnly(e.target.value, 2))}
                  onBlur={() =>
                    setMinute(clampOnBlur(minute, 0, 59, { padTo: 2 }))
                  }
                  className={numInputClass}
                />
              </label>
              <div className="space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Period
                </span>
                <div className="flex h-[42px] overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 p-0.5">
                  {['AM', 'PM'].map((p) => {
                    const active = period === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPeriod(p)}
                        className={`flex-1 rounded-md text-xs font-semibold transition ${
                          active
                            ? 'bg-orange-600 text-white shadow-sm'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {previewLabel ? (
              <p className="pt-1 text-xs text-zinc-500">
                Scheduled for{' '}
                <span className="font-medium text-zinc-300">{previewLabel}</span>{' '}
                (PKT)
              </p>
            ) : null}
          </div>

          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span className="font-medium">Callback Note</span>
            <textarea
              rows={3}
              placeholder='e.g. "Customer requested call after 9 PM"'
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`${fieldClass} resize-none`}
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutation.isPending ? 'Saving…' : 'Save Callback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
