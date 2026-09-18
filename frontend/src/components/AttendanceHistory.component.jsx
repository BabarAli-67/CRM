import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getHistory } from '../services/attendance.service.js';

const STATUS_BADGE = {
  present: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  late: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  pending_approval: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  absent: 'bg-red-500/10 text-red-400 border-red-500/20',
  auto_absent: 'bg-red-500/10 text-red-400 border-red-500/20',
  weekend_off: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
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
  const classes =
    STATUS_BADGE[status] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  const label = STATUS_LABEL[status] || status;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${classes}`}
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
    <section className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Attendance
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Your shift history for the selected month
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          <span>Month</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20"
          />
        </label>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-400">
          {error?.response?.data?.message || 'Failed to load attendance history.'}
        </p>
      ) : sortedRecords.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          No attendance records for this month yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-zinc-200">
            <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Shift Date</th>
                <th className="px-3 py-2.5 font-medium">Check-In</th>
                <th className="px-3 py-2.5 font-medium">Check-Out</th>
                <th className="px-3 py-2.5 font-medium">Worked Duration</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.map((row) => (
                <tr
                  key={row._id}
                  className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-3 py-3 whitespace-nowrap">{row.shiftDate}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {formatDateTime(row.checkInTime)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {formatDateTime(row.checkOutTime)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {formatWorkedDuration(row.workedMinutes)}
                  </td>
                  <td className="px-3 py-3">
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
