import { useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock3 } from 'lucide-react';
import AttendanceBanner from '../AttendanceBanner.component.jsx';
import GracefulExitModal from '../GracefulExitModal.component.jsx';
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
  present: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  late: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  checked_in: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  auto_absent: 'bg-red-500/10 text-red-400 border-red-500/20',
  absent: 'bg-red-500/10 text-red-400 border-red-500/20',
  pending_approval: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
  const hours = Math.floor(workedMinutes / 60);
  const minutes = workedMinutes % 60;
  return `${hours}h ${minutes}m`;
};

function derivePulse(attendance) {
  if (!attendance) {
    return { key: 'unknown', label: '—' };
  }

  if (attendance.status === 'weekend_off') {
    return { key: 'weekend_off', label: 'Weekend off' };
  }

  if (attendance.status === 'auto_absent') {
    return { key: 'auto_absent', label: 'Auto Absent' };
  }

  if (attendance.status === 'absent') {
    return { key: 'absent', label: 'Absent' };
  }

  if (attendance.status === 'pending_approval') {
    return { key: 'pending_approval', label: 'Pending approval' };
  }

  if (attendance.checkInTime && !attendance.checkOutTime) {
    return {
      key: 'checked_in',
      label: attendance.status === 'late' ? 'Checked-in (late)' : 'Checked-in',
    };
  }

  if (attendance.status === 'late') {
    return { key: 'late', label: 'Late' };
  }

  if (attendance.status === 'present') {
    return { key: 'present', label: 'Present' };
  }

  return {
    key: 'unknown',
    label: attendance.status || '—',
  };
}

function DepartmentKpiStrip({ role }) {
  const showClosedCount = role === 'sales_agent' || role === 'closer';
  const month = currentMonthValue();

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
  });

  const pulse = derivePulse(todayData?.attendance);
  const pulseClasses = PULSE_BADGE[pulse.key] || PULSE_BADGE.unknown;

  const startLabel = formatShiftClock(shiftData?.settings?.startTime || '19:00');
  const endLabel = formatShiftClock(shiftData?.settings?.endTime || '04:00');

  const monthlyMinutes = useMemo(
    () =>
      historyRecords.reduce(
        (sum, row) => sum + (typeof row.workedMinutes === 'number' ? row.workedMinutes : 0),
        0
      ),
    [historyRecords]
  );

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

      <header className="bg-zinc-900/60 backdrop-blur-md border-b border-zinc-800/80 sticky top-0 z-30 px-4 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="min-w-0">
              <p className="bg-gradient-to-r from-[#FF4B26] via-[#F23B18] to-[#C92000] bg-clip-text text-xs font-bold italic tracking-wide text-transparent">
                FLASH TECH
              </p>
              <h1 className="font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">
                {title}
              </h1>
            </div>
            <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs px-2.5 py-1 rounded-full uppercase tracking-wider font-semibold">
              {displayRole}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <nav
              className="flex flex-wrap items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-900/40 p-1"
              aria-label={`${displayRole} navigation`}
            >
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
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
