import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllUsers } from '../services/admin.service.js';
import {
  exportGridUrl,
  forceAbsent,
  getGrid,
} from '../services/attendance.service.js';

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

const inputClassName =
  'rounded-xl border border-obsidian-border bg-obsidian-elevated px-3 py-2 text-sm text-ink outline-none focus:border-flash-secondary focus:ring-2 focus:ring-flash-secondary/30';

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
    STATUS_BADGE[status] || 'bg-slate-100 text-slate-700 ring-slate-200';
  const label = STATUS_LABEL[status] || status;

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${classes}`}
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
      className="space-y-4 rounded-card border border-obsidian-border bg-obsidian-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputClassName}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
            Employee
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className={`${inputClassName} min-w-48`}
            >
              <option value="">All employees</option>
              {departmentUsers.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.fullName} ({ROLE_LABELS[user.role] || user.role})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${inputClassName} min-w-40`}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <a
          href={exportGridUrl(filters)}
          download="attendance-export.csv"
          className="inline-flex items-center rounded-xl bg-flash-secondary px-4 py-2 font-display text-sm font-semibold text-obsidian transition hover:bg-flash-primary"
        >
          Export CSV
        </a>
      </div>

      {actionError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {actionError}
        </p>
      ) : null}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-red-400">
          {error?.response?.data?.message || 'Failed to load attendance grid.'}
        </p>
      ) : records.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          No attendance records match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-ink">
            <thead className="border-b border-obsidian-border text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Shift Date</th>
                <th className="px-3 py-2 font-medium">Check-In</th>
                <th className="px-3 py-2 font-medium">Check-Out</th>
                <th className="px-3 py-2 font-medium">Worked Duration</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {!readOnly ? (
                  <th className="px-3 py-2 font-medium">Actions</th>
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
                  <tr
                    key={row._id}
                    className="border-b border-obsidian-border/60 last:border-0 align-top"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.user?.fullName || '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {ROLE_LABELS[row.user?.role] || row.user?.role || '—'}
                    </td>
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
                    {!readOnly ? (
                      <td className="px-3 py-2.5">
                        {!canForce ? (
                          <span className="text-xs text-ink-muted">—</span>
                        ) : prompting ? (
                          <div className="flex min-w-52 flex-col gap-2">
                            <input
                              type="text"
                              value={forceReason}
                              onChange={(e) => setForceReason(e.target.value)}
                              placeholder="Reason (optional)"
                              maxLength={300}
                              className={inputClassName}
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
                                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-60"
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
                                className="rounded-lg border border-obsidian-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-flash-secondary"
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
                            className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10"
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
