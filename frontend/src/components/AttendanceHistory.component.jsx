import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react';
import { getHistory } from '../services/attendance.service.js';
import { formatLateDuration } from '../utils/formatLateDuration.util.js';

const STATUS_BADGE = {
  present: 'bg-[#F25E26]/15 text-white border-[#F25E26]/40',
  late: 'bg-white/5 text-white border-white/20',
  pending_approval: 'bg-transparent text-[#F25E26] border-[#F25E26]/50 border-dashed',
  absent: 'bg-white/5 text-[#A3A3A3] border-white/15',
  auto_absent: 'bg-white/5 text-[#A3A3A3] border-white/15',
  weekend_off: 'bg-white/5 text-[#A3A3A3] border-white/10',
};

const STATUS_LABEL = {
  present: 'Present',
  late: 'Late',
  pending_approval: 'Pending approval',
  absent: 'Absent',
  auto_absent: 'Auto absent',
  weekend_off: 'Weekend off',
};

const QUICK_FILTERS = [
  { id: 'last7', label: 'Last 7 Days' },
  { id: 'last30', label: 'Last 30 Days' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'custom', label: 'Custom Range' },
];

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'present', label: 'Present' },
  { value: 'auto_absent', label: 'Auto absent' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'weekend_off', label: 'Weekend off' },
];

const pktTodayYmd = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

const addDaysYmd = (ymd, deltaDays) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d) + deltaDays * 86_400_000;
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const currentMonthValue = () => pktTodayYmd().slice(0, 7);

const rangeForQuickFilter = (filterId, customFrom, customTo) => {
  const today = pktTodayYmd();
  if (filterId === 'last7') {
    return { from: addDaysYmd(today, -6), to: today };
  }
  if (filterId === 'last30') {
    return { from: addDaysYmd(today, -29), to: today };
  }
  if (filterId === 'thisMonth') {
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  if (filterId === 'custom' && customFrom && customTo) {
    return customFrom <= customTo
      ? { from: customFrom, to: customTo }
      : { from: customTo, to: customFrom };
  }
  return null;
};

const subtitleForFilter = (filterId, range) => {
  if (filterId === 'last7') return 'Your shift history for the last 7 days';
  if (filterId === 'last30') return 'Your shift history for the last 30 days';
  if (filterId === 'thisMonth') return 'Your shift history for this month';
  if (filterId === 'custom') {
    if (!range) return 'Select a custom From / To date range';
    return `Your shift history from ${range.from} to ${range.to}`;
  }
  return 'Your shift history for the selected month';
};

const formatWorkedDuration = (workedMinutes) => {
  if (workedMinutes === null || workedMinutes === undefined) return '—';
  const hours = Math.floor(workedMinutes / 60);
  const minutes = workedMinutes % 60;
  return `${hours}h ${minutes}m`;
};

const formatDateTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const StatusBadge = ({ status, lateMinutes }) => {
  const classes =
    STATUS_BADGE[status] || 'bg-white/5 text-[#A3A3A3] border-white/10';
  const label = STATUS_LABEL[status] || status;
  const lateLabel =
    (status === 'late' || status === 'pending_approval') &&
    lateMinutes != null
      ? formatLateDuration(lateMinutes)
      : '';

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${classes}`}
      >
        {label}
      </span>
      {lateLabel ? (
        <span className="text-xs font-medium text-[#A3A3A3]">{lateLabel}</span>
      ) : null}
    </span>
  );
};

/** Dark-theme date input with a bright, always-clickable calendar button. */
function DarkDateInput({ id, label, value, onChange, max }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        /* fall through */
      }
    }
    el.focus();
    el.click();
  };

  return (
    <label className="flex flex-col gap-1 text-xs text-[#A3A3A3]" htmlFor={id}>
      <span>{label}</span>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          type="date"
          value={value}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-white/15 bg-[#0A0A0A] py-2 pl-3 pr-11 text-sm text-white outline-none transition [color-scheme:dark] focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20"
        />
        <button
          type="button"
          aria-label={`Open ${label} calendar`}
          onClick={openPicker}
          className="absolute right-1.5 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-[#F25E26]/15 text-[#F25E26] transition hover:bg-[#F25E26]/25 hover:text-white"
        >
          <Calendar className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </label>
  );
}

function MonthPickerHistory() {
  const [month, setMonth] = useState(currentMonthValue);
  const monthInputRef = useRef(null);

  const {
    data: records = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['attendanceHistory', month],
    queryFn: () => getHistory(month),
    enabled: Boolean(month),
  });

  const sortedRecords = useMemo(
    () =>
      [...records].sort((a, b) =>
        String(b.shiftDate).localeCompare(String(a.shiftDate))
      ),
    [records]
  );

  const openMonthPicker = () => {
    const el = monthInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        /* fall through */
      }
    }
    el.focus();
    el.click();
  };

  return (
    <section className="w-full rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Attendance
          </h2>
          <p className="mt-1 text-sm text-[#A3A3A3]">
            Your shift history for the selected month
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm text-[#A3A3A3]">
          <span>Month</span>
          <div className="relative flex items-center">
            <input
              ref={monthInputRef}
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-white/15 bg-[#0A0A0A] py-2 pl-3 pr-11 text-sm text-white outline-none transition [color-scheme:dark] focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20"
            />
            <button
              type="button"
              aria-label="Open month calendar"
              onClick={openMonthPicker}
              className="absolute right-1.5 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-[#F25E26]/15 text-[#F25E26] transition hover:bg-[#F25E26]/25 hover:text-white"
            >
              <Calendar className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </label>
      </div>

      <HistoryTable
        isLoading={isLoading}
        isError={isError}
        error={error}
        records={sortedRecords}
        emptyLabel="No attendance records for this month yet."
      />
    </section>
  );
}

function QuickFilterHistory() {
  const [quickFilter, setQuickFilter] = useState('last7');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const range = useMemo(
    () => rangeForQuickFilter(quickFilter, customFrom, customTo),
    [quickFilter, customFrom, customTo]
  );

  const {
    data: records = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['attendanceHistory', 'range', range?.from, range?.to],
    queryFn: () => getHistory({ from: range.from, to: range.to }),
    enabled: Boolean(range?.from && range?.to),
  });

  const filteredRecords = useMemo(() => {
    const list =
      statusFilter === 'all'
        ? records
        : records.filter((row) => row.status === statusFilter);
    return [...list].sort((a, b) =>
      String(b.shiftDate).localeCompare(String(a.shiftDate))
    );
  }, [records, statusFilter]);

  const subtitle = subtitleForFilter(quickFilter, range);
  const waitingCustom = quickFilter === 'custom' && !range;

  return (
    <section className="w-full rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-xl">
      <div className="mb-5 space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Attendance
          </h2>
          <p className="mt-1 text-sm text-[#A3A3A3]">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Date range filters"
          >
            {QUICK_FILTERS.map((item) => {
              const active = quickFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setQuickFilter(item.id)}
                  className={`min-h-9 cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'border-[#F25E26] bg-[#F25E26] text-white'
                      : 'border-white/15 bg-transparent text-[#A3A3A3] hover:border-white/25 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-[#A3A3A3]">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-9 rounded-lg border border-white/15 bg-[#0A0A0A] px-3 py-2 text-sm text-white outline-none transition [color-scheme:dark] focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20"
            >
              {STATUS_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {quickFilter === 'custom' ? (
          <div className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
            <DarkDateInput
              id="attendance-from"
              label="From Date"
              value={customFrom}
              max={pktTodayYmd()}
              onChange={setCustomFrom}
            />
            <DarkDateInput
              id="attendance-to"
              label="To Date"
              value={customTo}
              max={pktTodayYmd()}
              onChange={setCustomTo}
            />
          </div>
        ) : null}
      </div>

      {waitingCustom ? (
        <p className="py-8 text-center text-sm text-[#A3A3A3]">
          Choose From and To dates to load attendance.
        </p>
      ) : (
        <HistoryTable
          isLoading={isLoading}
          isError={isError}
          error={error}
          records={filteredRecords}
          emptyLabel="No attendance records for this filter yet."
        />
      )}
    </section>
  );
}

function HistoryTable({ isLoading, isError, error, records, emptyLabel }) {
  if (isLoading) {
    return <p className="py-8 text-center text-sm text-[#A3A3A3]">Loading…</p>;
  }
  if (isError) {
    return (
      <p className="py-8 text-center text-sm text-[#F25E26]">
        {error?.response?.data?.message || 'Failed to load attendance history.'}
      </p>
    );
  }
  if (!records.length) {
    return (
      <p className="py-8 text-center text-sm text-[#A3A3A3]">{emptyLabel}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm text-white">
        <thead className="border-b border-[#222222] text-xs uppercase tracking-wide text-[#A3A3A3]">
          <tr>
            <th className="px-3 py-2.5 font-medium">Shift Date</th>
            <th className="px-3 py-2.5 font-medium">Check-In</th>
            <th className="px-3 py-2.5 font-medium">Check-Out</th>
            <th className="px-3 py-2.5 font-medium">Worked Duration</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((row) => (
            <tr
              key={row._id}
              className="border-b border-[#222222] last:border-0 transition-colors hover:bg-white/[0.03]"
            >
              <td className="whitespace-nowrap px-3 py-3">{row.shiftDate}</td>
              <td className="whitespace-nowrap px-3 py-3">
                {formatDateTime(row.checkInTime)}
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                {formatDateTime(row.checkOutTime)}
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                {formatWorkedDuration(row.workedMinutes)}
              </td>
              <td className="px-3 py-3">
                <StatusBadge
                  status={row.status}
                  lateMinutes={row.lateMinutes}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * @param {{ variant?: 'month' | 'quickFilters' }} props
 * - month (default): original month picker — Closer / CST / Tech
 * - quickFilters: Sales Agent Attendance pills + custom range
 */
export default function AttendanceHistory({ variant = 'month' }) {
  if (variant === 'quickFilters') {
    return <QuickFilterHistory />;
  }
  return <MonthPickerHistory />;
}
