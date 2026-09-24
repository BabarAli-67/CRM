import { useEffect, useMemo, useState } from 'react';

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
  // Reject overflow (e.g. Feb 31 → Mar 3)
  if (
    local.getFullYear() !== y ||
    local.getMonth() !== Number(month) - 1 ||
    local.getDate() !== d
  ) {
    return null;
  }
  return local.toISOString();
};

const fieldClass =
  'w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

const selectClass = `${fieldClass} appearance-none cursor-pointer`;

const numInputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 text-center text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

/**
 * Sales-agent add / edit callback modal (standalone contact + PKT date/time).
 * Does not use closer callback APIs.
 */
export default function CallbackForm({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  initialValues = null,
  title = 'Schedule Callback',
}) {
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessLink, setBusinessLink] = useState('');
  const [notes, setNotes] = useState('');
  const [day, setDay] = useState(() => pad(new Date().getDate()));
  const [month, setMonth] = useState(() => pad(new Date().getMonth() + 1));
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('AM');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    const parts = splitDateTime(initialValues?.callbackAt);
    setBusinessName(initialValues?.businessName || '');
    setPhone(initialValues?.phone || '');
    setBusinessLink(
      initialValues?.businessLink || initialValues?.websiteLink || ''
    );
    setNotes(initialValues?.notes || '');
    setDay(parts.day);
    setMonth(parts.month);
    setYear(parts.year);
    setHour(parts.hour);
    setMinute(parts.minute);
    setPeriod(parts.period);
  }, [open, initialValues]);

  // Clamp day when month/year shrinks the calendar
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
    const phoneVal = phone.trim();
    let link = businessLink.trim();
    if (!name || !phoneVal || !link) {
      setError('Please fill all required fields.');
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
        phone: phoneVal,
        businessLink: link,
        callbackAt: iso,
        notes: notes.trim() || undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 p-4 backdrop-blur-sm sm:p-6">
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
        className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50 my-8 sm:my-12"
      >
        {/* Sticky header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-4">
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
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
          {/* Scrollable body */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 pr-3">
            <label className="block space-y-1.5 text-sm text-zinc-300">
              <span className="font-medium">
                Business Name <span className="text-red-400">*</span>
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

            <label className="block space-y-1.5 text-sm text-zinc-300">
              <span className="font-medium">
                Phone Number <span className="text-red-400">*</span>
              </span>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={fieldClass}
                placeholder="+92 …"
                aria-required="true"
              />
            </label>

            <label className="block space-y-1.5 text-sm text-zinc-300">
              <span className="font-medium">
                Website Link <span className="text-red-400">*</span>
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

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-zinc-300">Date</p>
              <div className="grid grid-cols-3 gap-2">
                <label className="block space-y-1">
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">
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
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">
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
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">
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
                  <span className="font-medium text-zinc-300">
                    {previewLabel}
                  </span>{' '}
                  (PKT)
                </p>
              ) : null}
            </div>

            <label className="block space-y-1.5 text-sm text-zinc-300">
              <span className="font-medium">Notes</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='e.g. "Call after site visit"'
                className={`${fieldClass} resize-none`}
              />
            </label>

            {error ? (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            ) : null}
          </div>

          {/* Pinned footer */}
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-zinc-800 bg-zinc-900 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Saving…' : 'Save Callback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
