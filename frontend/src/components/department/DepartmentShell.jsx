import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock3 } from 'lucide-react';
import AttendanceBanner from '../AttendanceBanner.component.jsx';
import GracefulExitModal from '../GracefulExitModal.component.jsx';
import GlobalRemindersBridge from '../alerts/GlobalRemindersBridge.component.jsx';
import SessionIdentityBadge from '../SessionIdentityBadge.component.jsx';
import useAuth from '../../hooks/useAuth.hook.js';
import { getHistory, getTodayStatus } from '../../services/attendance.service.js';
import { getMyClosedCount } from '../../services/stats.service.js';
import { getShift } from '../../services/shift.service.js';
const ROLE_LABELS = {
  sales_agent: 'Sales Agent',
  closer: 'Closer',
  cst_manager: 'CST Manager',
  tech_team: 'Tech Team',
};

const PULSE_BADGE = {
  on_duty: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  checked_out: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  pending_approval:
    'bg-transparent text-amber-400 border-amber-500/40 border-dashed',
  off_duty: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  absent: 'bg-red-500/10 text-red-400 border-red-500/20',
  weekend_off: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  unknown: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
};

const navLinkClass = ({ isActive }) =>
  [
    'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer',
    isActive
      ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20'
      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50',
  ].join(' ');

const currentMonthValue = () => {
  // Match backend shiftDate calendar (Asia/Karachi)
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Karachi',
  }).slice(0, 7);
};

const formatShiftClock = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string') return '—';
  const [hRaw, mRaw] = hhmm.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
};

const formatWorkedDuration = (workedMinutes) => {
  if (workedMinutes == null || Number.isNaN(workedMinutes)) return '—';
  const total = Math.max(0, Math.floor(workedMinutes));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours}h ${minutes}m`;
};

const PRESENT_STATUSES = new Set(['present', 'late']);

/** Minutes from a completed attendance row (Present/Late with checkout). */
const completedRowMinutes = (row) => {
  if (!row || !PRESENT_STATUSES.has(row.status)) return 0;
  if (typeof row.workedMinutes === 'number' && !Number.isNaN(row.workedMinutes)) {
    return Math.max(0, Math.floor(row.workedMinutes));
  }
  if (row.checkInTime && row.checkOutTime) {
    const start = new Date(row.checkInTime).getTime();
    const end = new Date(row.checkOutTime).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
      return Math.max(0, Math.floor((end - start) / 60_000));
    }
  }
  return 0;
};

/** Elapsed minutes for an open check-in (no checkout yet). */
const elapsedActiveMinutes = (attendance, nowMs) => {
  if (!attendance?.checkInTime || attendance.checkOutTime) return 0;
  const start = new Date(attendance.checkInTime).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((nowMs - start) / 60_000));
};

/**
 * Display-only pulse for the KPI badge.
 * Prefer check-in / check-out timestamps over lingering DB status
 * (status can stay `present` until the noon shift-date rollover).
 * Shift window bounds come from the attendance record (admin settings).
 */
function derivePulse(attendance, nowMs = Date.now()) {
  if (!attendance) {
    return { key: 'unknown', label: '—' };
  }

  if (attendance.status === 'weekend_off') {
    return { key: 'weekend_off', label: 'Weekend Off' };
  }

  // Checked out always wins — never show Present after checkout
  if (attendance.checkOutTime) {
    return { key: 'checked_out', label: 'Checked Out' };
  }

  if (attendance.status === 'pending_approval') {
    return { key: 'pending_approval', label: 'Approval Pending' };
  }

  // Actively on shift
  if (attendance.checkInTime && !attendance.checkOutTime) {
    return { key: 'on_duty', label: 'On Duty' };
  }

  if (attendance.status === 'absent') {
    return { key: 'absent', label: 'Absent' };
  }

  const startMs = attendance.shiftStartAt
    ? new Date(attendance.shiftStartAt).getTime()
    : null;
  const endSource = attendance.extendedUntil || attendance.shiftEndAt;
  const endMs = endSource ? new Date(endSource).getTime() : null;

  // Outside the active window (before start or after end) → Off Duty
  if (
    (startMs != null && !Number.isNaN(startMs) && nowMs < startMs) ||
    (endMs != null && !Number.isNaN(endMs) && nowMs > endMs)
  ) {
    return { key: 'off_duty', label: 'Off Duty' };
  }

  // Inside the window, never checked in
  if (attendance.status === 'auto_absent') {
    return { key: 'absent', label: 'Absent' };
  }

  return { key: 'off_duty', label: 'Off Duty' };
}

function DepartmentKpiStrip({ role }) {
  const showClosedCount = role === 'sales_agent' || role === 'closer';
  const month = currentMonthValue();
  const [tickNow, setTickNow] = useState(() => Date.now());

  const { data: todayData } = useQuery({
    queryKey: ['todayAttendance'],
    queryFn: getTodayStatus,
    refetchInterval: 30000,
  });

  const { data: shiftData } = useQuery({
    queryKey: ['shiftSettings'],
    queryFn: getShift,
  });

  const { data: closedCount } = useQuery({
    queryKey: ['myClosedCount'],
    queryFn: getMyClosedCount,
    enabled: showClosedCount,
    refetchInterval: 60_000,
  });

  const { data: historyRecords = [] } = useQuery({
    queryKey: ['attendanceHistory', month],
    queryFn: () => getHistory(month),
    enabled: !showClosedCount && Boolean(month),
    refetchInterval: 60_000,
  });

  const attendance = todayData?.attendance;
  const isOnDuty = Boolean(
    attendance?.checkInTime && !attendance?.checkOutTime
  );

  // Live ticker while on duty — refresh every minute so monthly hours climb
  useEffect(() => {
    if (showClosedCount || !isOnDuty) return undefined;
    setTickNow(Date.now());
    const id = setInterval(() => setTickNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [showClosedCount, isOnDuty, attendance?.checkInTime]);

  const nowMs = Math.max(
    tickNow,
    todayData?.serverTime
      ? new Date(todayData.serverTime).getTime()
      : 0
  );
  const pulse = derivePulse(attendance, nowMs);
  const pulseClasses = PULSE_BADGE[pulse.key] || PULSE_BADGE.unknown;

  const startLabel = formatShiftClock(shiftData?.settings?.startTime || '19:00');
  const endLabel = formatShiftClock(shiftData?.settings?.endTime || '04:00');

  const monthlyMinutes = useMemo(() => {
    if (showClosedCount) return 0;

    const openId =
      isOnDuty && attendance?._id ? String(attendance._id) : null;

    const completed = historyRecords.reduce((sum, row) => {
      // Open shift is counted via live elapsed — skip to avoid double-count
      if (openId && String(row._id) === openId && !row.checkOutTime) {
        return sum;
      }
      return sum + completedRowMinutes(row);
    }, 0);

    const active = isOnDuty
      ? elapsedActiveMinutes(attendance, tickNow)
      : 0;

    return completed + active;
  }, [
    historyRecords,
    attendance,
    tickNow,
    showClosedCount,
    isOnDuty,
  ]);

  const activityLabel = showClosedCount ? 'Closed sales' : 'Hours this month';
  const activityValue = showClosedCount
    ? typeof closedCount === 'number'
      ? String(closedCount)
      : '—'
    : formatWorkedDuration(monthlyMinutes);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5 hover:border-zinc-700/60 transition-all">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Shift Status
        </p>
        <p className="mt-1 text-sm text-zinc-400">Current pulse</p>
        <span
          className={`mt-3 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${pulseClasses}`}
        >
          {pulse.label}
        </span>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5 hover:border-zinc-700/60 transition-all">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Shift Window
        </p>
        <div className="mt-3 flex items-center gap-2 text-zinc-100">
          <Clock3 className="h-4 w-4 shrink-0 text-orange-400/80" aria-hidden />
          <p className="text-sm font-medium tabular-nums">
            {startLabel} – {endLabel}{' '}
            <span className="text-zinc-500">PKT</span>
          </p>
        </div>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5 hover:border-zinc-700/60 transition-all">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {showClosedCount ? 'Activity' : 'Monthly Hours'}
        </p>
        <p className="mt-1 text-sm text-zinc-400">{activityLabel}</p>
        <p className="mt-3 font-display text-2xl font-semibold tabular-nums text-white">
          {activityValue}
        </p>
      </div>
    </div>
  );
}

/**
 * Shared premium shell for department dashboards (Sales Agent, Closer, CST, Tech).
 * Styling only — nav items and children remain role-specific.
 */
export default function DepartmentShell({ title, roleLabel, navItems, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;
  const displayRole = roleLabel || ROLE_LABELS[role] || role || 'Department';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0C0E] text-white">
      <AttendanceBanner />
      <GracefulExitModal />
      <GlobalRemindersBridge />

      <header className="bg-zinc-900/60 backdrop-blur-md border-b border-zinc-800/80 sticky top-0 z-30 px-4 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="bg-gradient-to-r from-[#FF4B26] via-[#F23B18] to-[#C92000] bg-clip-text text-xs font-bold italic tracking-wide text-transparent">
              FLASH TECH
            </p>
            <h1 className="font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <SessionIdentityBadge user={user} roleLabel={displayRole} />
            <nav
              className="flex flex-wrap items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-900/40 p-1"
              aria-label={`${displayRole} navigation`}
            >
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end ?? true}
                  className={navLinkClass}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <button
              type="button"
              onClick={handleLogout}
              className="cursor-pointer rounded-full border border-red-500/30 px-3.5 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto w-full flex-1 px-6 py-8 space-y-6">
        <DepartmentKpiStrip role={role} />
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}
