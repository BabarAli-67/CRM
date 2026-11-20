import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createCloserCallback,
  updateCloserCallback,
} from '../../services/callback.service.js';
import { clearReminderFireKeys } from '../../hooks/useReminderScheduler.js';
import { clearQueuedReminders } from '../alerts/ReminderPopup.jsx';
import { unlockAudioPlayback } from '../../utils/audioAlert.js';

const pad = (n) => String(n).padStart(2, '0');

const PKT = 'Asia/Karachi';

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

/** YYYY-MM-DD for "today" in Asia/Karachi (PKT). */
const todayDateValue = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: PKT });

/** Read an Instant as PKT wall-clock parts for the form. */
const splitDateTime = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) {
    return splitDateTime(new Date());
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PKT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);

  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const hour24Candidate = Number(get('hour'));
  const dayPeriod = (get('dayPeriod') || 'AM').toUpperCase();
  let h12 = hour24Candidate;
  // en-US hour12 parts already yield 1–12
  if (h12 === 0) h12 = 12;

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: pad(h12),
    minute: pad(Number(get('minute')) || 0),
    period: dayPeriod.startsWith('P') ? 'PM' : 'AM',
  };
};

/** Default date/time = now in PKT. */
const nowDateTimeParts = () => splitDateTime(new Date());

/**
 * Interpret Date + 12h Time as Asia/Karachi (PKT, +05:00) wall time → UTC ISO.
 * BUG FIX: previously used `new Date(y, m-1, day, h, mi)` (browser-local), which
 * stored PKT wall clock ~5h early when the OS timezone was not Asia/Karachi —
 * callbacks saved "1–2 min from now" landed overdue with no ring (past catch-up).
 */
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

  const isoWithOffset = `${date}T${pad(h)}:${pad(mi)}:00+05:00`;
  const instant = new Date(isoWithOffset);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toISOString();
};

const fieldClass =
  'w-full rounded-lg border border-white/15 bg-[#0A0A0A] px-3 py-2 text-sm text-white outline-none transition focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20';

const selectClass = `${fieldClass} appearance-none cursor-pointer`;

const numInputClass =
  'w-full rounded-lg border border-white/15 bg-[#0A0A0A] py-2 text-center text-sm text-white outline-none transition focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

const blankContact = () => ({
  businessName: '',
  personalPhone: '',
  businessPhone: '',
  businessLink: '',
  notes: '',
  selectedLeadId: '',
});

const callbackBusinessPhone = (cb) =>
  cb?.businessPhone || cb?.personalPhone || '';

const normalizeWebsite = (raw) => {
  let link = String(raw || '').trim();
  if (!link) return '';
  if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
  return link;
};

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
  const [personalPhone, setPersonalPhone] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessLink, setBusinessLink] = useState('');
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
    setPersonalPhone(blank.personalPhone);
    setBusinessPhone(blank.businessPhone);
    setBusinessLink(blank.businessLink);
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
      setPersonalPhone(callback.personalPhone || '');
      setBusinessPhone(callbackBusinessPhone(callback));
      setBusinessLink(callback.businessLink || '');
      setSourceMode('manual');
      setSelectedLeadId('');
      return;
    }

    if (lead && !allowStandalone) {
      const parts = splitDateTime(lead.followUp?.callbackAt);
      applyDateTime(parts);
      setNotes(lead.followUp?.notes || '');
      setBusinessName(lead.businessName || '');
      setPersonalPhone(lead.personalPhone || '');
      setBusinessPhone(lead.businessPhone || lead.personalPhone || '');
      setBusinessLink(lead.websiteLink || '');
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
      setPersonalPhone('');
      setBusinessPhone('');
      setBusinessLink('');
      return;
    }
    setBusinessName(selectedLead.businessName || '');
    setPersonalPhone(selectedLead.personalPhone || '');
    setBusinessPhone(
      selectedLead.businessPhone || selectedLead.personalPhone || ''
    );
    setBusinessLink(selectedLead.websiteLink || '');
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
    setPersonalPhone('');
    setBusinessPhone('');
    setBusinessLink('');
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
      // Allow the new/rescheduled time to ring (clear session mute + queue)
      if (isReschedule && callback?._id) {
        clearReminderFireKeys({ kind: 'closer_callback', id: callback._id });
        clearQueuedReminders({ kind: 'closer_callback', id: callback._id });
      }
      unlockAudioPlayback();
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

  const hasExistingFollowUp = Boolean(
    lockedLead?.followUp?.callbackAt && !isReschedule
  );
  const modalTitle = isReschedule
    ? 'Reschedule Callback'
    : hasExistingFollowUp
      ? 'View / Override Schedule'
      : 'Schedule Callback';
  const modalSubtitle = hasExistingFollowUp
    ? 'Existing follow-up is prefilled — save to override the schedule'
    : null;

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
    const link = normalizeWebsite(businessLink);
    if (!name || !link) {
      setError('Business Name and Website Link are required.');
      return;
    }

    mutation.mutate({
      businessName: name,
      personalPhone: personalPhone.trim() || null,
      businessPhone: businessPhone.trim() || null,
      businessLink: link,
      callbackAt: iso,
      notes: notes.trim() || null,
    });
  };

  const isDirectContactForm =
    allowStandalone &&
    !isReschedule &&
    !lockedLead &&
    sourceMode === 'manual';

  const dateTimeNotesBlock = (
    <>
      <label className="block space-y-1 text-sm text-[#A3A3A3]">
        <span className="font-medium text-white">
          Date <span className="text-[#F25E26]">*</span>
        </span>
        <input
          required
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`${fieldClass} [color-scheme:dark]`}
        />
      </label>

      <div className="space-y-1">
        <p className="text-sm font-medium text-white">
          Time <span className="text-[#F25E26]">*</span>
          <span className="ml-1 text-xs font-normal text-[#A3A3A3]">(PKT)</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-[#A3A3A3]">
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
              onBlur={() => setHour(clampOnBlur(hour, 1, 12, { padTo: 2 }))}
              className={numInputClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-[#A3A3A3]">
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
            <span className="text-[11px] uppercase tracking-wide text-[#A3A3A3]">
              AM/PM
            </span>
            <div className="flex h-[38px] overflow-hidden rounded-lg border border-white/15 bg-[#0A0A0A] p-0.5">
              {['AM', 'PM'].map((p) => {
                const active = period === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`flex-1 rounded-md text-xs font-semibold transition ${
                      active
                        ? 'bg-[#F25E26] text-white shadow-sm'
                        : 'text-[#A3A3A3] hover:text-white'
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
          <p className="pt-0.5 text-xs text-[#A3A3A3]">
            Scheduled for{' '}
            <span className="font-medium text-white">{previewLabel}</span> (PKT)
          </p>
        ) : null}
      </div>

      <label className="block space-y-1 text-sm text-[#A3A3A3] sm:col-span-2">
        <span className="font-medium text-white">Notes</span>
        <textarea
          rows={isDirectContactForm ? 2 : 3}
          placeholder='e.g. "Customer requested call after 9 PM"'
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${fieldClass} resize-none`}
        />
      </label>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-6">
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
        className={`relative z-10 my-4 flex w-full flex-col overflow-hidden rounded-2xl border border-[#222222] bg-[#111111] shadow-2xl shadow-black/50 sm:my-8 ${
          isDirectContactForm
            ? 'max-h-[min(92vh,640px)] max-w-2xl'
            : 'max-h-[min(85vh,720px)] max-w-md'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#222222] px-5 py-3.5">
          <div className="min-w-0">
            <h2
              id="closer-schedule-callback-title"
              className="font-display text-lg font-semibold text-white"
            >
              {modalTitle}
            </h2>
            {modalSubtitle ? (
              <p className="mt-0.5 text-sm text-[#A3A3A3]">{modalSubtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-sm text-[#A3A3A3] transition hover:bg-white/5 hover:text-white"
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
          <div
            className={`min-h-0 flex-1 space-y-3 px-5 py-4 ${
              isDirectContactForm
                ? 'overflow-hidden'
                : 'overflow-y-auto overscroll-contain pr-3'
            }`}
          >
            {allowStandalone && !isReschedule && !lockedLead ? (
              <div className="space-y-3">
                <div className="flex overflow-hidden rounded-lg border border-white/15 bg-[#0A0A0A] p-0.5">
                  <button
                    type="button"
                    onClick={() => switchSourceMode('claimed')}
                    disabled={claimedLeads.length === 0}
                    className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      sourceMode === 'claimed'
                        ? 'bg-[#F25E26] text-white shadow-sm'
                        : 'text-[#A3A3A3] hover:text-white'
                    }`}
                  >
                    Claimed Leads
                  </button>
                  <button
                    type="button"
                    onClick={() => switchSourceMode('manual')}
                    className={`flex-1 rounded-md px-2 py-2 text-xs font-semibold transition ${
                      sourceMode === 'manual'
                        ? 'bg-[#F25E26] text-white shadow-sm'
                        : 'text-[#A3A3A3] hover:text-white'
                    }`}
                  >
                    Direct Contact
                  </button>
                </div>

                {sourceMode === 'claimed' ? (
                  claimedLeads.length === 0 ? (
                    <p className="rounded-xl border border-[#222222] bg-[#0A0A0A]/60 px-3.5 py-3 text-sm text-[#A3A3A3]">
                      No claimed leads — switch to Direct Contact to schedule
                      anyway.
                    </p>
                  ) : (
                    <label className="block space-y-1.5 text-sm text-[#A3A3A3]">
                      <span className="font-medium text-white">
                        Select claimed lead
                      </span>
                      <select
                        value={selectedLeadId}
                        onChange={(e) => setSelectedLeadId(e.target.value)}
                        className={selectClass}
                      >
                        <option value="">Choose a lead…</option>
                        {claimedLeads.map((l) => (
                          <option key={l._id} value={l._id}>
                            {l.businessName} ·{' '}
                            {l.businessPhone || l.personalPhone || '—'}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                ) : null}
              </div>
            ) : null}

            {isDirectContactForm ? (
              <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                <label className="block space-y-1 text-sm text-[#A3A3A3]">
                  <span className="font-medium text-white">
                    Business Name <span className="text-[#F25E26]">*</span>
                  </span>
                  <input
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className={fieldClass}
                    placeholder="Acme Plumbing"
                    aria-required="true"
                  />
                </label>

                <label className="block space-y-1 text-sm text-[#A3A3A3]">
                  <span className="font-medium text-white">
                    Website Link <span className="text-[#F25E26]">*</span>
                  </span>
                  <input
                    required
                    type="url"
                    placeholder="https://"
                    value={businessLink}
                    onChange={(e) => setBusinessLink(e.target.value)}
                    className={fieldClass}
                    aria-required="true"
                  />
                </label>

                <label className="block space-y-1 text-sm text-[#A3A3A3]">
                  <span className="font-medium text-white">
                    Personal Phone No
                  </span>
                  <input
                    value={personalPhone}
                    onChange={(e) => setPersonalPhone(e.target.value)}
                    className={fieldClass}
                    placeholder="+92 …"
                  />
                </label>

                <label className="block space-y-1 text-sm text-[#A3A3A3]">
                  <span className="font-medium text-white">
                    Business Phone No
                  </span>
                  <input
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                    className={fieldClass}
                    placeholder="+92 …"
                  />
                </label>

                {dateTimeNotesBlock}
              </div>
            ) : (
              <>
                {contactReadOnly &&
                (selectedLead || lockedLead || callback) ? (
                  <div className="rounded-xl border border-[#222222] bg-[#0A0A0A]/60 px-3.5 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A3A3A3]">
                      {callback && !callback.leadId && isReschedule
                        ? 'Direct Contact'
                        : 'Lead / Business Name'}
                    </p>
                    <p className="mt-1 font-medium text-white">
                      {(selectedLead || lockedLead || callback)?.businessName}
                    </p>
                    <p className="mt-0.5 text-sm text-[#A3A3A3]">
                      {selectedLead?.businessPhone ||
                        selectedLead?.personalPhone ||
                        lockedLead?.businessPhone ||
                        lockedLead?.personalPhone ||
                        callbackBusinessPhone(callback) ||
                        '—'}
                    </p>
                  </div>
                ) : sourceMode === 'claimed' &&
                  allowStandalone &&
                  !lockedLead &&
                  !isReschedule ? (
                  <p className="rounded-xl border border-dashed border-white/15 bg-[#0A0A0A]/40 px-3.5 py-3 text-sm text-[#A3A3A3]">
                    Select a claimed lead above to load business name and phone.
                  </p>
                ) : null}

                <div className="space-y-4">{dateTimeNotesBlock}</div>
              </>
            )}

            {error ? (
              <p role="alert" className="text-sm text-[#F25E26]">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[#222222] bg-[#111111] px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              disabled={mutation.isPending}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-xl bg-[#F25E26] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#F25E26]/25 transition hover:bg-[#ff6a33] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutation.isPending ? 'Saving…' : 'Save Callback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
