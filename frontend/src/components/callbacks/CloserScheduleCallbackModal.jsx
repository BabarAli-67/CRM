import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createCloserCallback,
  updateCloserCallback,
} from '../../services/callback.service.js';

const HOURS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, '0')
);
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const pad = (n) => String(n).padStart(2, '0');

const todayDateValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  if (!date || !hour || !minute || !period) return null;

  let h = Number(hour);
  if (period === 'AM') {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }

  const [y, m, day] = date.split('-').map(Number);
  const local = new Date(y, m - 1, day, h, Number(minute), 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
};

const fieldClass =
  'w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

const selectClass = `${fieldClass} appearance-none cursor-pointer`;

/**
 * Closer-only schedule / reschedule modal.
 * - Lead-linked: pass `lead` (from Claimed Leads) — contact fields read-only.
 * - Standalone: pass `allowStandalone` — pick a claimed lead OR enter contact manually.
 * Does not use sales-agent callback APIs.
 */
export default function CloserScheduleCallbackModal({
  open,
  lead = null,
  callback = null,
  claimedLeads = [],
  allowStandalone = false,
  onClose,
  onSuccess,
}) {
  const queryClient = useQueryClient();
  const isReschedule = Boolean(callback?._id);
  const lockedLead = lead && !allowStandalone ? lead : null;

  const [sourceMode, setSourceMode] = useState('manual'); // 'manual' | 'claimed'
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState(todayDateValue);
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('AM');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const selectedLead = useMemo(() => {
    if (lockedLead) return lockedLead;
    if (isReschedule) return null;
    if (sourceMode !== 'claimed' || !selectedLeadId) return null;
    return claimedLeads.find((l) => l._id === selectedLeadId) || null;
  }, [lockedLead, isReschedule, sourceMode, selectedLeadId, claimedLeads]);

  useEffect(() => {
    if (!open) return;
    setError('');

    const sourceAt = callback?.callbackAt || lead?.followUp?.callbackAt;
    const parts = splitDateTime(sourceAt);
    setDate(parts.date);
    setHour(parts.hour);
    setMinute(parts.minute);
    setPeriod(parts.period);
    setNotes(callback?.notes || '');

    if (callback?._id) {
      setBusinessName(callback?.businessName || '');
      setPhone(callback?.phone || '');
      setSourceMode('manual');
      setSelectedLeadId('');
      return;
    }

    if (lead && !allowStandalone) {
      setBusinessName(lead.businessName || '');
      setPhone(lead.phone || '');
      setSourceMode('claimed');
      setSelectedLeadId(lead._id);
      return;
    }

    // Standalone / flexible entry from My Callbacks
    const hasClaimed = claimedLeads.length > 0;
    setSourceMode(hasClaimed ? 'claimed' : 'manual');
    setSelectedLeadId(hasClaimed ? claimedLeads[0]._id : '');
    if (hasClaimed) {
      setBusinessName(claimedLeads[0].businessName || '');
      setPhone(claimedLeads[0].phone || '');
    } else {
      setBusinessName('');
      setPhone('');
    }
    // Only re-init when the dialog opens (or the locked lead / callback target changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- claimedLeads snapshot at open time
  }, [open, lead?._id, callback?._id, allowStandalone]);

  useEffect(() => {
    if (!open || lockedLead || isReschedule) return;
    if (sourceMode === 'claimed' && selectedLead) {
      setBusinessName(selectedLead.businessName || '');
      setPhone(selectedLead.phone || '');
    }
  }, [open, lockedLead, isReschedule, sourceMode, selectedLead]);

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
    mutationFn: (payload) => {
      if (isReschedule) {
        return updateCloserCallback(callback._id, payload);
      }
      return createCloserCallback(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
      queryClient.invalidateQueries({ queryKey: ['adminCallbacks'] });
      onSuccess?.();
      onClose?.();
    },
    onError: (err) => {
      setError(
        err?.response?.data?.message || 'Failed to schedule callback.'
      );
    },
  });

  if (!open) return null;
  if (isReschedule && !callback) return null;
  if (!allowStandalone && !lockedLead && !isReschedule) return null;

  const contactReadOnly =
    isReschedule || Boolean(lockedLead) || (sourceMode === 'claimed' && selectedLead);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!date) {
      setError('Please pick a callback date.');
      return;
    }

    const iso = toIsoTimestamp({ date, hour, minute, period });
    if (!iso) {
      setError('Please provide a valid date and time.');
      return;
    }

    if (isReschedule) {
      mutation.mutate({
        callbackAt: iso,
        notes: notes.trim() || null,
        status: 'pending',
      });
      return;
    }

    if (lockedLead?._id || (sourceMode === 'claimed' && selectedLead?._id)) {
      mutation.mutate({
        leadId: lockedLead?._id || selectedLead._id,
        callbackAt: iso,
        notes: notes.trim() || null,
      });
      return;
    }

    const name = businessName.trim();
    const phoneVal = phone.trim();
    if (!name || !phoneVal) {
      setError('Business name and phone number are required.');
      return;
    }

    mutation.mutate({
      businessName: name,
      phone: phoneVal,
      callbackAt: iso,
      notes: notes.trim() || null,
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
        aria-labelledby="closer-schedule-callback-title"
        className="relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2
            id="closer-schedule-callback-title"
            className="font-display text-lg font-semibold text-white"
          >
            {isReschedule ? 'Reschedule Callback' : 'Schedule Callback'}
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
          {allowStandalone && !isReschedule && !lockedLead ? (
            <div className="space-y-3">
              <div className="flex overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 p-0.5">
                <button
                  type="button"
                  onClick={() => setSourceMode('claimed')}
                  disabled={claimedLeads.length === 0}
                  className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    sourceMode === 'claimed'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Claimed lead
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('manual');
                    setSelectedLeadId('');
                  }}
                  className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition ${
                    sourceMode === 'manual'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Direct contact
                </button>
              </div>

              {sourceMode === 'claimed' ? (
                claimedLeads.length === 0 ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3 text-sm text-zinc-500">
                    No claimed leads — switch to Direct contact to schedule
                    anyway.
                  </p>
                ) : (
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span className="font-medium">Select claimed lead</span>
                    <select
                      value={selectedLeadId}
                      onChange={(e) => setSelectedLeadId(e.target.value)}
                      className={selectClass}
                    >
                      {claimedLeads.map((l) => (
                        <option key={l._id} value={l._id}>
                          {l.businessName} · {l.phone}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              ) : null}
            </div>
          ) : null}

          {contactReadOnly && (selectedLead || lockedLead || callback) ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {callback && !callback.leadId && isReschedule
                  ? 'Direct contact'
                  : 'Lead / Business Name'}
              </p>
              <p className="mt-1 font-medium text-white">
                {(selectedLead || lockedLead || callback)?.businessName}
              </p>
              <p className="mt-0.5 text-sm text-zinc-400">
                {(selectedLead || lockedLead || callback)?.phone}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block space-y-1.5 text-sm text-zinc-300">
                <span className="font-medium">
                  Business Name / Contact Person
                </span>
                <input
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className={fieldClass}
                  placeholder="e.g. Acme Plumbing"
                />
              </label>
              <label className="block space-y-1.5 text-sm text-zinc-300">
                <span className="font-medium">Phone Number</span>
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={fieldClass}
                  placeholder="+92 …"
                />
              </label>
            </div>
          )}

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
                <select
                  value={hour}
                  onChange={(e) => setHour(e.target.value)}
                  className={selectClass}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                  Minute
                </span>
                <select
                  value={minute}
                  onChange={(e) => setMinute(e.target.value)}
                  className={selectClass}
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
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
            <span className="font-medium">Notes / Follow-up Details</span>
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
