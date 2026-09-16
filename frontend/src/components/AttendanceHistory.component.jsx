import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHistory } from '../services/attendance.service.js';

const STATUS_BADGE = {
  present: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  late: 'bg-amber-100 text-amber-900 ring-amber-200',
  pending_approval:
    'bg-transparent text-amber-800 ring-2 ring-amber-400 ring-inset',
  absent: 'bg-red-100 text-red-800 ring-red-200',
  auto_absent: 'bg-red-100 text-red-800 ring-red-200',
  weekend_off: 'bg-slate-200 text-slate-700 ring-slate-300',
};

const STATUS_LABEL = {
  present: 'Present',
  late: 'Late',
  pending_approval: 'Pending approval',
  absent: 'Absent',
  auto_absent: 'Auto absent',
  weekend_off: 'Weekend off',
};

const currentMonthValue = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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

const StatusBadge = ({ status }) => {
  const classes = STATUS_BADGE[status] || 'bg-slate-100 text-slate-700 ring-slate-200';
  const label = STATUS_LABEL[status] || status;

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${classes}`}
    >
      {label}
    </span>
  );
};

export default function AttendanceHistory() {
  const [month, setMonth] = useState(currentMonthValue);

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

  return (
    <section className="w-full max-w-5xl rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">
            Attendance
          </h2>
          <p className="mt-1 text-sm text-ink/70">
            Your shift history for the selected month
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm text-ink/80">
          <span>Month</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border border-white/15 bg-obsidian px-3 py-2 text-ink outline-none focus:border-flash-secondary"
          />
        </label>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-ink/60">Loading…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-300">
          {error?.response?.data?.message || 'Failed to load attendance history.'}
        </p>
      ) : sortedRecords.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink/60">
          No attendance records for this month yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-ink">
            <thead className="border-b border-white/10 text-ink/70">
              <tr>
                <th className="px-3 py-2 font-medium">Shift Date</th>
                <th className="px-3 py-2 font-medium">Check-In</th>
                <th className="px-3 py-2 font-medium">Check-Out</th>
                <th className="px-3 py-2 font-medium">Worked Duration</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.map((row) => (
                <tr
                  key={row._id}
                  className="border-b border-white/5 last:border-0"
                >
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {row.shiftDate}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatDateTime(row.checkInTime)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatDateTime(row.checkOutTime)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatWorkedDuration(row.workedMinutes)}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
