import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../../services/lead.service.js';

const MONTHS = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' },
  { value: '05', label: 'May' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
];

const pad = (n) => String(n).padStart(2, '0');

const daysInMonth = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m) return 31;
  return new Date(y, m, 0).getDate();
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
    const now = new Date();
    return {
      day: pad(now.getDate()),
      month: pad(now.getMonth() + 1),
      year: String(now.getFullYear()),
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
    day: pad(d.getDate()),
    month: pad(d.getMonth() + 1),
    year: String(d.getFullYear()),
    hour: pad(h12),
    minute: pad(d.getMinutes()),
    period,
  };
};

const toIsoTimestamp = ({ day, month, year, hour, minute, period }) => {
  if (
    day === '' ||
    month === '' ||
    year === '' ||
    hour === '' ||
    minute === '' ||
    !period
  ) {
    return null;
  }

  let h = Number(hour);
  const d = Number(day);
  const y = Number(year);
  const mi = Number(minute);
  if (
    Number.isNaN(h) ||
    Number.isNaN(d) ||
    Number.isNaN(y) ||
    Number.isNaN(mi) ||
    h < 1 ||
    h > 12 ||
    mi < 0 ||
    mi > 59 ||
    y < 2024 ||
    y > 2035
  ) {
    return null;
  }

  if (period === 'AM') {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }

  const local = new Date(y, Number(month) - 1, d, h, mi, 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  if (
    local.getFullYear() !== y ||
    local.getMonth() !== Number(month) - 1 ||
    local.getDate() !== d
  ) {
    return null;
  }
  return local.toISOString();
};

const resolveCloserId = (ref) => {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'object' && ref._id) return String(ref._id);
  return '';
};

const fieldClass =
  'w-full rounded-lg border border-white/15 bg-[#0A0A0A] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20';

const closerSelectClass =
  'w-full cursor-pointer appearance-none rounded-lg border border-white/15 bg-[#0A0A0A] p-2.5 text-white outline-none focus:ring-2 focus:ring-[#F25E26]';

const selectClass = `${fieldClass} appearance-none cursor-pointer`;

const numInputClass =
  'w-full rounded-lg border border-white/15 bg-[#0A0A0A] py-2 text-center text-sm text-white outline-none transition focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

/**
 * Sales-agent add / edit callback modal.
 * Fields: Business Name*, Personal Phone, Business Phone, Website*,
 * Assign Closer*, Date*, Time* (PKT), Notes.
 */
export default function CallbackForm({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  initialValues = null,
  title = 'Schedule a Callback',
}) {
  const [businessName, setBusinessName] = useState('');
  const [personalPhone, setPersonalPhone] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessLink, setBusinessLink] = useState('');
  const [notes, setNotes] = useState('');
  const [assignedCloserId, setAssignedCloserId] = useState('');
  const [day, setDay] = useState(() => pad(new Date().getDate()));
  const [month, setMonth] = useState(() => pad(new Date().getMonth() + 1));
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('AM');
  const [error, setError] = useState('');

  const { data: closers = [], isLoading: closersLoading } = useQuery({
    queryKey: ['users', 'closer'],
    queryFn: () => getUsers({ role: 'closer', status: 'approved' }),
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    const parts = splitDateTime(initialValues?.callbackAt);
    setBusinessName(initialValues?.businessName || '');
    setPersonalPhone(initialValues?.personalPhone || '');
    setBusinessPhone(initialValues?.businessPhone || '');
    setBusinessLink(
      initialValues?.businessLink || initialValues?.websiteLink || ''
    );
    setNotes(initialValues?.notes || '');
    setAssignedCloserId(
      resolveCloserId(
        initialValues?.assignedCloserId ||
          initialValues?.leadId?.closerId ||
          null
      )
    );
    setDay(parts.day);
    setMonth(parts.month);
    setYear(parts.year);
    setHour(parts.hour);
    setMinute(parts.minute);
    setPeriod(parts.period);
  }, [open, initialValues]);

  useEffect(() => {
    const max = daysInMonth(year, month);
    if (day !== '' && Number(day) > max) {
      setDay(pad(max));
    }
  }, [day, year, month]);

  const previewLabel = useMemo(() => {
    try {
      const iso = toIsoTimestamp({ day, month, year, hour, minute, period });
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
  }, [day, month, year, hour, minute, period]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const name = businessName.trim();
    let link = businessLink.trim();
    if (!name || !link) {
      setError('Business Name and Website Link are required.');
      return;
    }
    if (!assignedCloserId) {
      setError('Please assign a closer.');
      return;
    }
    if (!/^https?:\/\//i.test(link)) {
      link = `https://${link}`;
    }

    const maxDay = daysInMonth(year, month) || 31;
    const normalized = {
      day: clampOnBlur(day, 1, maxDay, { padTo: 2 }),
      month,
      year: clampOnBlur(year, 2024, 2035),
      hour: clampOnBlur(hour, 1, 12, { padTo: 2 }),
      minute: clampOnBlur(minute, 0, 59, { padTo: 2 }),
      period,
    };
    setDay(normalized.day);
    setYear(normalized.year);
    setHour(normalized.hour);
    setMinute(normalized.minute);

    const iso = toIsoTimestamp(normalized);
    if (!iso) {
      setError('Please provide a valid date and time.');
      return;
    }

    try {
      await onSubmit({
        businessName: name,
        personalPhone: personalPhone.trim() || null,
        businessPhone: businessPhone.trim() || null,
        businessLink: link,
        callbackAt: iso,
        notes: notes.trim() || undefined,
        assignedCloserId,
      });
      onClose?.();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          'Failed to save callback. Please try again.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm sm:p-6">
      <button
        type="button"
        aria-label="Close form backdrop"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="callback-form-title"
        className="relative z-10 my-8 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#222222] bg-[#111111] shadow-2xl shadow-black/50 sm:my-12"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#222222] px-5 py-4">
          <h2
            id="callback-form-title"
            className="font-display text-lg font-semibold text-white"
          >
            {title}
          </h2>
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
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 pr-3">
            <label className="block space-y-1.5 text-sm text-[#A3A3A3]">
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

            <label className="block space-y-1.5 text-sm text-[#A3A3A3]">
              <span className="font-medium text-white">Personal Phone No</span>
              <input
                value={personalPhone}
                onChange={(e) => setPersonalPhone(e.target.value)}
                className={fieldClass}
                placeholder="+92 …"
              />
            </label>

            <label className="block space-y-1.5 text-sm text-[#A3A3A3]">
              <span className="font-medium text-white">Business Phone No</span>
              <input
                value={businessPhone}
                onChange={(e) => setBusinessPhone(e.target.value)}
                className={fieldClass}
                placeholder="+92 …"
              />
            </label>

            <label className="block space-y-1.5 text-sm text-[#A3A3A3]">
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

            <label className="block space-y-1.5 text-sm text-[#A3A3A3]">
              <span className="font-medium text-white">
                Assign Closer <span className="text-[#F25E26]">*</span>
              </span>
              <select
                required
                value={assignedCloserId}
                onChange={(e) => setAssignedCloserId(e.target.value)}
                disabled={isSubmitting || closersLoading}
                className={closerSelectClass}
                aria-required="true"
              >
                <option value="">
                  {closersLoading ? 'Loading closers…' : 'Select a closer'}
                </option>
                {closers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.fullName || c.username}
                    {c.fullName && c.username ? ` (@${c.username})` : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-white">
                Date <span className="text-[#F25E26]">*</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-[#A3A3A3]">
                    Day
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    placeholder="DD"
                    value={day}
                    onChange={(e) => setDay(digitsOnly(e.target.value, 2))}
                    onBlur={() =>
                      setDay(
                        clampOnBlur(day, 1, daysInMonth(year, month) || 31, {
                          padTo: 2,
                        })
                      )
                    }
                    className={numInputClass}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-[#A3A3A3]">
                    Month
                  </span>
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className={selectClass}
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-[#A3A3A3]">
                    Year
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={2024}
                    max={2035}
                    placeholder="YYYY"
                    value={year}
                    onChange={(e) => setYear(digitsOnly(e.target.value, 4))}
                    onBlur={() =>
                      setYear(clampOnBlur(year, 2024, 2035) || year)
                    }
                    className={numInputClass}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-white">
                Time <span className="text-[#F25E26]">*</span>
                <span className="ml-1 text-xs font-normal text-[#A3A3A3]">
                  (PKT)
                </span>
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
                    onBlur={() =>
                      setHour(clampOnBlur(hour, 1, 12, { padTo: 2 }))
                    }
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
                    Period
                  </span>
                  <div className="flex h-[42px] overflow-hidden rounded-lg border border-white/15 bg-[#0A0A0A] p-0.5">
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
                <p className="pt-1 text-xs text-[#A3A3A3]">
                  Scheduled for{' '}
                  <span className="font-medium text-white">{previewLabel}</span>{' '}
                  (PKT)
                </p>
              ) : null}
            </div>

            <label className="block space-y-1.5 text-sm text-[#A3A3A3]">
              <span className="font-medium text-white">Notes</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='e.g. "Call after site visit"'
                className={`${fieldClass} resize-none`}
              />
            </label>

            {error ? (
              <p role="alert" className="text-sm text-[#F25E26]">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[#222222] bg-[#111111] px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-[#F25E26] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#F25E26]/25 transition hover:bg-[#ff6a33] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Scheduling…' : 'Schedule a Callback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
