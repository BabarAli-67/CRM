import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react';
import {
  getTechTeamAttendance,
  listTechTeam,
} from '../../services/techHead.service.js';
import { formatLateDuration } from '../../utils/formatLateDuration.util.js';
import { currentPktMonth } from '../../utils/pktMonth.util.js';

const STATUS_BADGE = {
  present: 'bg-[#F25E26]/15 text-white border-[#F25E26]/40',
  late: 'bg-white/5 text-white border-white/20',
  pending_approval:
    'bg-transparent text-[#F25E26] border-[#F25E26]/50 border-dashed',
  absent: 'bg-white/5 text-[#A3A3A3] border-white/15',
  auto_absent: 'bg-white/5 text-[#A3A3A3] border-white/15',
  weekend_off: 'bg-white/5 text-[#A3A3A3] border-white/10',
};

const STATUS_LABEL = {
  present: 'Present',
  late: 'Late',
  pending_approval: 'Pending Approval',
  absent: 'Absent',
  auto_absent: 'Absent',
  weekend_off: 'Weekend Off',
};

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'absent', label: 'Absent' },
];

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

function MonthInput({ value, onChange }) {
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
    <label className="flex flex-col gap-1 text-sm text-[#A3A3A3]">
      <span>Month</span>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-white/15 bg-[#0A0A0A] py-2 pl-3 pr-11 text-sm text-white outline-none transition [color-scheme:dark] focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20"
        />
        <button
          type="button"
          aria-label="Open month calendar"
          onClick={openPicker}
          className="absolute right-1.5 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-[#F25E26]/15 text-[#F25E26] transition hover:bg-[#F25E26]/25 hover:text-white"
        >
          <Calendar className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </label>
  );
}

function DateInput({ id, label, value, onChange }) {
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

/**
 * Read-only Tech Department attendance for Tech Head.
 * No Approve / Reject controls — Super Admin owns those.
 */
export default function TechTeamAttendancePanel() {
  const [month, setMonth] = useState(currentPktMonth);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [memberId, setMemberId] = useState('');
  const useCustomRange = Boolean(from && to);

  const filters = useMemo(() => {
    const next = {};
    if (useCustomRange) {
      next.from = from;
      next.to = to;
    } else if (month) {
      next.month = month;
    }
    if (status) next.status = status;
    if (memberId) next.userId = memberId;
    return next;
  }, [month, from, to, status, memberId, useCustomRange]);

  const { data: members = [] } = useQuery({
    queryKey: ['techHeadTeam'],
    queryFn: listTechTeam,
  });

  const {
    data: records = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['techTeamAttendance', filters],
    queryFn: () => getTechTeamAttendance(filters),
    enabled: useCustomRange || Boolean(month),
  });

  const sorted = useMemo(
    () =>
      [...records].sort((a, b) => {
        const dateCmp = String(b.shiftDate || '').localeCompare(
          String(a.shiftDate || '')
        );
        if (dateCmp !== 0) return dateCmp;
        return String(a.user?.fullName || '').localeCompare(
          String(b.user?.fullName || '')
        );
      }),
    [records]
  );

  const clearRange = () => {
    setFrom('');
    setTo('');
  };

  return (
    <section className="w-full rounded-2xl border border-white/10 bg-[#111111] p-6 shadow-xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Tech Team Attendance
          </h2>
          <p className="mt-1 text-sm text-[#A3A3A3]">
            Read-only view of Developer, Content Writer, SEO Expert, Social
            Media Manager, Graphic Designer, and Intern shifts. Approvals stay
            with Super Admin.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <MonthInput
          value={month}
          onChange={(value) => {
            setMonth(value);
            clearRange();
          }}
        />
        <DateInput
          id="tech-att-from"
          label="From date"
          value={from}
          onChange={setFrom}
        />
        <DateInput
          id="tech-att-to"
          label="To date"
          value={to}
          onChange={setTo}
        />
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-[#A3A3A3]">
          <span>Team member</span>
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="min-h-9 rounded-lg border border-white/15 bg-[#0A0A0A] px-3 py-2 text-sm text-white outline-none transition [color-scheme:dark] focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20"
          >
            <option value="">All members</option>
            {members.map((m) => (
              <option key={m._id} value={m._id}>
                {m.fullName}
                {m.jd ? ` · ${m.jd}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-[#A3A3A3]">
          <span>Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="min-h-9 rounded-lg border border-white/15 bg-[#0A0A0A] px-3 py-2 text-sm text-white outline-none transition [color-scheme:dark] focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20"
          >
            {STATUS_FILTERS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {useCustomRange ? (
          <button
            type="button"
            onClick={clearRange}
            className="min-h-9 cursor-pointer rounded-lg border border-white/15 px-3 text-xs font-semibold text-[#A3A3A3] transition hover:border-white/25 hover:text-white"
          >
            Clear date range
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-[#A3A3A3]">Loading…</p>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-[#F25E26]">
          {error?.response?.data?.message ||
            'Failed to load Tech Team attendance.'}
        </p>
      ) : !sorted.length ? (
        <p className="py-8 text-center text-sm text-[#A3A3A3]">
          No attendance records for this filter yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-white">
            <thead className="border-b border-[#222222] text-xs uppercase tracking-wide text-[#A3A3A3]">
              <tr>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Job Description</th>
                <th className="px-3 py-2.5 font-medium">Supervisor</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Check-In</th>
                <th className="px-3 py-2.5 font-medium">Check-Out</th>
                <th className="px-3 py-2.5 font-medium">Worked Duration</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const isIntern = row.user?.jd === 'Intern';
                const supervisor =
                  isIntern && row.user?.assignedMentorId?.fullName
                    ? row.user.assignedMentorId.fullName
                    : '—';
                return (
                  <tr
                    key={row._id}
                    className="border-b border-[#222222] last:border-0 transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="whitespace-nowrap px-3 py-3 font-medium">
                      {row.user?.fullName || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#A3A3A3]">
                      {row.user?.jd || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[#A3A3A3]">
                      {supervisor}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.shiftDate || '—'}
                    </td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
