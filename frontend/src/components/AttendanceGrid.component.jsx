import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllUsers } from '../services/admin.service.js';
import {
  exportGridUrl,
  forceAbsent,
  getGrid,
} from '../services/attendance.service.js';
import {
  ADMIN_BTN_GHOST,
  ADMIN_BTN_PRIMARY,
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_ROW,
  ADMIN_TABLE_WRAP,
  ADMIN_THEAD,
  ROLE_PILL,
} from './adminBrand.js';

const DEPARTMENT_ROLES = ['sales_agent', 'closer', 'cst_manager', 'tech_team'];

const ROLE_LABELS = {
  sales_agent: 'Sales Agent',
  closer: 'Closer',
  cst_manager: 'CST Manager',
  tech_team: 'Tech Team Member',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'absent', label: 'Absent' },
  { value: 'auto_absent', label: 'Auto absent' },
  { value: 'weekend_off', label: 'Weekend off' },
];

const STATUS_BADGE = {
  present: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  late: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  pending_approval: 'bg-[#FF4B26]/15 text-[#FF8A6A] ring-1 ring-[#FF4B26]/40',
  absent: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  auto_absent: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  weekend_off: 'bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30',
};

const STATUS_LABEL = {
  present: 'Present',
  late: 'Late',
  pending_approval: 'Pending approval',
  absent: 'Absent',
  auto_absent: 'Auto absent',
  weekend_off: 'Weekend off',
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
    STATUS_BADGE[status] || 'bg-white/5 text-zinc-300 ring-1 ring-white/10';
  const label = STATUS_LABEL[status] || status;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}
    >
      {label}
    </span>
  );
};

const defaultDateRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(
    2,
    '0'
  );
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${lastDay}`,
  };
};

export default function AttendanceGrid({ readOnly = false }) {
  const queryClient = useQueryClient();
  const initialRange = defaultDateRange();
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('');
  const [forceTargetId, setForceTargetId] = useState(null);
  const [forceReason, setForceReason] = useState('');
  const [actionError, setActionError] = useState('');

  const filters = useMemo(() => {
    const next = {};
    if (from) next.from = from;
    if (to) next.to = to;
    if (userId) next.userId = userId;
    if (status) next.status = status;
    return next;
  }, [from, to, userId, status]);

  const { data: users = [] } = useQuery({
    queryKey: ['allUsers', 'department'],
    queryFn: () => getAllUsers({ status: 'approved' }),
  });

  const departmentUsers = useMemo(
    () =>
      users
        .filter((user) => DEPARTMENT_ROLES.includes(user.role))
        .sort((a, b) =>
          String(a.fullName || '').localeCompare(String(b.fullName || ''))
        ),
    [users]
  );

  const {
    data: records = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['attendanceGrid', filters],
    queryFn: () => getGrid(filters),
  });

  const forceAbsentMutation = useMutation({
    mutationFn: ({ id, reason }) => forceAbsent(id, reason),
    onSuccess: () => {
      setActionError('');
      setForceTargetId(null);
      setForceReason('');
      queryClient.invalidateQueries({ queryKey: ['attendanceGrid'] });
      queryClient.invalidateQueries({ queryKey: ['lateRequests'] });
    },
    onError: (err) => {
      setActionError(
        err.response?.data?.message || 'Failed to mark employee absent.'
      );
    },
  });

  return (
    <div
      data-readonly={readOnly ? 'true' : 'false'}
      className={`${ADMIN_CARD} space-y-4`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={ADMIN_INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={ADMIN_INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
            Employee
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className={`${ADMIN_INPUT} min-w-48`}
            >
              <option value="">All employees</option>
              {departmentUsers.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.fullName} ({ROLE_LABELS[user.role] || user.role})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${ADMIN_INPUT} min-w-40`}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <a href={exportGridUrl(filters)} download="attendance-export.csv" className={ADMIN_BTN_PRIMARY}>
          Export CSV
        </a>
      </div>

      {actionError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {actionError}
        </p>
      ) : null}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-zinc-400">Loading…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-400">
          {error?.response?.data?.message || 'Failed to load attendance grid.'}
        </p>
      ) : records.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-400">
          No attendance records match these filters.
        </p>
      ) : (
        <div className={ADMIN_TABLE_WRAP}>
          <table className="min-w-full text-left text-sm text-white">
            <thead className={ADMIN_THEAD}>
              <tr>
                <th className="px-3 py-3 font-medium">Employee</th>
                <th className="px-3 py-3 font-medium">Role</th>
                <th className="px-3 py-3 font-medium">Shift Date</th>
                <th className="px-3 py-3 font-medium">Check-In</th>
                <th className="px-3 py-3 font-medium">Check-Out</th>
                <th className="px-3 py-3 font-medium">Worked Duration</th>
                <th className="px-3 py-3 font-medium">Status</th>
                {!readOnly ? (
                  <th className="px-3 py-3 font-medium">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {records.map((row) => {
                const canForce = row.status !== 'weekend_off';
                const prompting = forceTargetId === row._id;
                const busy =
                  forceAbsentMutation.isPending &&
                  forceAbsentMutation.variables?.id === row._id;

                return (
                  <tr key={row._id} className={`${ADMIN_ROW} align-top`}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {row.user?.fullName || '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={ROLE_PILL}>
                        {ROLE_LABELS[row.user?.role] || row.user?.role || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-zinc-300">
                      {row.shiftDate}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-zinc-400">
                      {formatDateTime(row.checkInTime)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-zinc-400">
                      {formatDateTime(row.checkOutTime)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-zinc-300">
                      {formatWorkedDuration(row.workedMinutes)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    {!readOnly ? (
                      <td className="px-3 py-3">
                        {!canForce ? (
                          <span className="text-xs text-zinc-500">—</span>
                        ) : prompting ? (
                          <div className="flex min-w-52 flex-col gap-2">
                            <input
                              type="text"
                              value={forceReason}
                              onChange={(e) => setForceReason(e.target.value)}
                              placeholder="Reason (optional)"
                              maxLength={300}
                              className={ADMIN_INPUT}
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  forceAbsentMutation.mutate({
                                    id: row._id,
                                    reason: forceReason.trim() || undefined,
                                  })
                                }
                                className="rounded-xl bg-red-700 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-red-950/40 transition hover:brightness-110 disabled:opacity-60"
                              >
                                {busy ? 'Saving…' : 'Confirm Absent'}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setForceTargetId(null);
                                  setForceReason('');
                                }}
                                className={ADMIN_BTN_GHOST}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setActionError('');
                              setForceTargetId(row._id);
                              setForceReason('');
                            }}
                            className="rounded-xl border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/10"
                          >
                            Force Absent
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
