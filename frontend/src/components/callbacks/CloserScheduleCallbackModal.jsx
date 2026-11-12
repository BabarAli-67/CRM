import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createCloserCallback,
  updateCloserCallback,
} from '../../services/callback.service.js';

const pad = (n) => String(n).padStart(2, '0');

/** Digits only; empty string allowed while typing. */
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

const todayDateValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const splitDateTime = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    let h24 = now.getHours();
    const period = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return {
      date: todayDateValue(),
      hour: pad(h12),
      minute: pad(now.getMinutes()),
      period,
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

/** Default date/time = now (local), used for clean Add Callback opens. */
const nowDateTimeParts = () => splitDateTime(new Date());

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

const selectClass = `${fieldClass} appearance-none cursor-pointer`;

const numInputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 text-center text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

const blankContact = () => ({
  businessName: '',
  phone: '',
  notes: '',
  selectedLeadId: '',
});

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
  /** Bumps on open / tab change so controlled inputs remount cleanly. */
  const [formKey, setFormKey] = useState(0);

  const selectedLead = useMemo(() => {
    if (lockedLead) return lockedLead;
    if (isReschedule) return null;
    if (sourceMode !== 'claimed' || !selectedLeadId) return null;
    return claimedLeads.find((l) => String(l._id) === String(selectedLeadId)) || null;
  }, [lockedLead, isReschedule, sourceMode, selectedLeadId, claimedLeads]);

  const applyDateTime = (parts) => {
    setDate(parts.date);
    setHour(parts.hour);
    setMinute(parts.minute);
    setPeriod(parts.period);
  };

  const clearContactFields = () => {
    const blank = blankContact();
    setBusinessName(blank.businessName);
    setPhone(blank.phone);
    setNotes(blank.notes);
    setSelectedLeadId(blank.selectedLeadId);
  };

  // Lock background page scroll while the popup is open
  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Reset every time the modal opens (or locked lead / reschedule target changes)
  useEffect(() => {
    if (!open) return;
    setError('');
    setFormKey((k) => k + 1);

    if (callback?._id) {
      const parts = splitDateTime(callback.callbackAt);
      applyDateTime(parts);
      setNotes(callback.notes || '');
      setBusinessName(callback.businessName || '');
      setPhone(callback.phone || '');
      setSourceMode('manual');
      setSelectedLeadId('');
      return;
    }

    if (lead && !allowStandalone) {
      const parts = splitDateTime(lead.followUp?.callbackAt);
      applyDateTime(parts);
      setNotes('');
      setBusinessName(lead.businessName || '');
      setPhone(lead.phone || '');
      setSourceMode('claimed');
      setSelectedLeadId(lead._id);
      return;
    }

    // Standalone Add Callback — always start clean (no auto-picked lead)
    applyDateTime(nowDateTimeParts());
    clearContactFields();
    setSourceMode('manual');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open / target change
  }, [open, lead?._id, callback?._id, allowStandalone]);

  // When a claimed lead is explicitly selected, fill contact from that lead only
  useEffect(() => {
    if (!open || lockedLead || isReschedule) return;
    if (sourceMode !== 'claimed') return;
    if (!selectedLead) {
      setBusinessName('');
      setPhone('');
      return;
    }
    setBusinessName(selectedLead.businessName || '');
    setPhone(selectedLead.phone || '');
  }, [open, lockedLead, isReschedule, sourceMode, selectedLead]);

  const switchSourceMode = (mode) => {
    if (mode === sourceMode) return;
    setError('');
    setSourceMode(mode);
    setFormKey((k) => k + 1);
    applyDateTime(nowDateTimeParts());
    setNotes('');
    setSelectedLeadId('');
    setBusinessName('');
    setPhone('');
  };

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
    isReschedule ||
    Boolean(lockedLead) ||
    (sourceMode === 'claimed' && Boolean(selectedLead));

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

    if (isReschedule) {
      mutation.mutate({
        callbackAt: iso,
        notes: notes.trim() || null,
        status: 'pending',
      });
      return;
    }

    if (lockedLead?._id) {
      mutation.mutate({
        leadId: lockedLead._id,
        callbackAt: iso,
        notes: notes.trim() || null,
      });
      return;
    }

    if (sourceMode === 'claimed') {
      if (!selectedLead?._id) {
        setError('Select a claimed lead, or switch to Direct contact.');
        return;
      }
      mutation.mutate({
        leadId: selectedLead._id,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/75 p-4 backdrop-blur-sm sm:p-6">
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
        className="relative z-10 my-4 flex max-h-[min(85vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50 sm:my-8"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2
            id="closer-schedule-callback-title"
            className="font-display text-lg font-semibold text-white"
          >
            {isReschedule ? 'Reschedule Callback' : 'Schedule Callback'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form
          key={`${open}-${sourceMode}-${formKey}`}
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 pr-3">
          {allowStandalone && !isReschedule && !lockedLead ? (
            <div className="space-y-3">
              <div className="flex overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 p-0.5">
                <button
                  type="button"
                  onClick={() => switchSourceMode('claimed')}
                  disabled={claimedLeads.length === 0}
                  className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    sourceMode === 'claimed'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Claimed Leads
                </button>
                <button
                  type="button"
                  onClick={() => switchSourceMode('manual')}
                  className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition ${
                    sourceMode === 'manual'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Direct Contact
                </button>
              </div>

              {sourceMode === 'claimed' ? (
                claimedLeads.length === 0 ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3 text-sm text-zinc-500">
                    No claimed leads — switch to Direct Contact to schedule
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
                      <option value="">Choose a lead…</option>
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
                  ? 'Direct Contact'
                  : 'Lead / Business Name'}
              </p>
              <p className="mt-1 font-medium text-white">
                {(selectedLead || lockedLead || callback)?.businessName}
              </p>
              <p className="mt-0.5 text-sm text-zinc-400">
                {(selectedLead || lockedLead || callback)?.phone}
              </p>
            </div>
          ) : sourceMode === 'claimed' && allowStandalone && !lockedLead && !isReschedule ? (
            <p className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 px-3.5 py-3 text-sm text-zinc-500">
              Select a claimed lead above to load business name and phone.
            </p>
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
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-zinc-800 bg-zinc-900 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-60"
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
