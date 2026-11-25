import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Clock3, LogOut, Menu, X } from 'lucide-react';
import AttendanceBanner from '../AttendanceBanner.component.jsx';
import ClientCommentNotificationBell from '../ClientCommentNotificationBell.component.jsx';
import DockedChatWindowsHost from '../DockedChatWindowsHost.component.jsx';
import GracefulExitModal from '../GracefulExitModal.component.jsx';
import GlobalRemindersBridge from '../alerts/GlobalRemindersBridge.component.jsx';
import MessengerIcon from '../MessengerIcon.component.jsx';
import SessionIdentityBadge from '../SessionIdentityBadge.component.jsx';
import useAuth from '../../hooks/useAuth.hook.js';
import { getHistory, getTodayStatus } from '../../services/attendance.service.js';
import { getMyClosedCount } from '../../services/stats.service.js';
import { getShift } from '../../services/shift.service.js';
import { currentPktMonth } from '../../utils/pktMonth.util.js';
const ROLE_LABELS = {
  sales_agent: 'Sales Agent',
  closer: 'Closer',
  cst_manager: 'CST Manager',
  tech_head: 'Tech Head',
  tech_team: 'Tech Team',
};

/** Status pills — Black / White / Orange only (no emerald / amber / sky washes). */
const PULSE_BADGE = {
  on_duty: 'bg-[#F25E26]/15 text-white border-[#F25E26]/50',
  checked_out: 'bg-white/5 text-white border-white/15',
  pending_approval:
    'bg-transparent text-[#F25E26] border-[#F25E26]/50 border-dashed',
  off_duty: 'bg-white/5 text-[#A3A3A3] border-white/10',
  absent: 'bg-white/5 text-white border-white/20',
  weekend_off: 'bg-white/5 text-[#A3A3A3] border-white/10',
  unknown: 'bg-white/5 text-[#A3A3A3] border-white/10',
};

const pathOf = (to) => {
  if (typeof to === 'string') return to.split('?')[0];
  return to?.pathname || '';
};

const searchOf = (to) => {
  if (typeof to === 'string') {
    const i = to.indexOf('?');
    return i >= 0 ? to.slice(i + 1) : '';
  }
  return String(to?.search || '').replace(/^\?/, '');
};

function isItemActive(item, pathname, search) {
  const extras = item.alsoMatch || [];
  const onAlsoMatch = extras.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (onAlsoMatch) {
    // Optional: only one of several alsoMatch items stays active (e.g. CST client detail).
    if (item.matchFrom) {
      const from =
        new URLSearchParams(search).get('from') || item.defaultFrom || 'onboard';
      return from === item.matchFrom;
    }
    return true;
  }

  const itemPath = pathOf(item.to);
  const itemTab = item.matchTab ?? new URLSearchParams(searchOf(item.to)).get('tab');
  if (itemTab != null) {
    if (pathname !== itemPath) return false;
    const currentTab =
      new URLSearchParams(search).get('tab') || item.defaultTab || 'leads';
    return currentTab === itemTab;
  }
  if (item.end === false) {
    return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
  }
  return pathname === itemPath;
}

const currentMonthValue = () => currentPktMonth();

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
  const [month, setMonth] = useState(currentMonthValue);
  const [tickNow, setTickNow] = useState(() => Date.now());

  // Keep KPI month in sync when the PKT calendar rolls over
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = currentMonthValue();
      setMonth((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

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
    queryKey: ['myClosedCount', month],
    queryFn: () => getMyClosedCount(month),
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

  // Tech Department uses a fixed 06:00 PM – 03:00 AM PKT window (independent of admin Shift settings).
  const isTechShift = role === 'tech_team';
  const startLabel = formatShiftClock(
    isTechShift ? '18:00' : shiftData?.settings?.startTime || '19:00'
  );
  const endLabel = formatShiftClock(
    isTechShift ? '03:00' : shiftData?.settings?.endTime || '04:00'
  );

  const monthlyMinutes = useMemo(() => {
    if (showClosedCount) return 0;

    // Strict PKT calendar month — resets to 0 at month boundary; history stays in DB.
    const monthRows = historyRecords.filter((row) =>
      String(row?.shiftDate || '').startsWith(month)
    );

    const openId =
      isOnDuty && attendance?._id ? String(attendance._id) : null;
    const todayInMonth = String(attendance?.shiftDate || '').startsWith(month);

    const completed = monthRows.reduce((sum, row) => {
      // Open shift is counted via live elapsed — skip to avoid double-count
      if (openId && String(row._id) === openId && !row.checkOutTime) {
        return sum;
      }
      return sum + completedRowMinutes(row);
    }, 0);

    const active =
      isOnDuty && todayInMonth
        ? elapsedActiveMinutes(attendance, tickNow)
        : 0;

    return completed + active;
  }, [
    historyRecords,
    attendance,
    tickNow,
    showClosedCount,
    isOnDuty,
    month,
  ]);

  const activityLabel = showClosedCount
    ? 'Closed sales this month'
    : 'Hours this month';
  const activityValue = showClosedCount
    ? typeof closedCount === 'number'
      ? String(closedCount)
      : '—'
    : formatWorkedDuration(monthlyMinutes);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-white/10 bg-[#111111] p-5 transition-all hover:border-white/15">
        <p className="text-xs font-medium uppercase tracking-wider text-[#A3A3A3]">
          Shift Status
        </p>
        <p className="mt-1 text-sm text-white/70">Current pulse</p>
        <span
          className={`mt-3 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${pulseClasses}`}
        >
          {pulse.label}
        </span>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111111] p-5 transition-all hover:border-white/15">
        <p className="text-xs font-medium uppercase tracking-wider text-[#A3A3A3]">
          Shift Window
        </p>
        <div className="mt-3 flex items-center gap-2 text-white">
          <Clock3 className="h-4 w-4 shrink-0 text-[#F25E26]" aria-hidden />
          <p className="text-sm font-medium tabular-nums">
            {startLabel} – {endLabel}{' '}
            <span className="text-[#A3A3A3]">PKT</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#111111] p-5 transition-all hover:border-white/15">
        <p className="text-xs font-medium uppercase tracking-wider text-[#A3A3A3]">
          {showClosedCount ? 'Activity' : 'Monthly Hours'}
        </p>
        <p className="mt-1 text-sm text-white/70">{activityLabel}</p>
        <p className="mt-3 font-display text-2xl font-semibold tabular-nums text-white">
          {activityValue}
        </p>
      </div>
    </div>
  );
}

function HeaderPulseDot({ enabled = true }) {
  const { data: todayData } = useQuery({
    queryKey: ['todayAttendance'],
    queryFn: getTodayStatus,
    refetchInterval: 30_000,
    enabled,
  });

  if (!enabled) return null;

  const pulse = derivePulse(todayData?.attendance);
  const pulseClasses = PULSE_BADGE[pulse.key] || PULSE_BADGE.unknown;

  return (
    <span
      className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider sm:inline-flex ${pulseClasses}`}
      title={`Shift: ${pulse.label}`}
    >
      <Bell className="h-3 w-3" aria-hidden />
      {pulse.label}
    </span>
  );
}

/**
 * Shared SaaS shell — left sidebar + top header.
 * Styling/layout only; routes, APIs, and reminder listeners stay intact.
 */
export default function DepartmentShell({
  title,
  roleLabel,
  navItems,
  children,
  /** When false, hide AttendanceBanner + KPI strip (page content only). */
  showAttendanceChrome = true,
  /**
   * When false, hide the header ABSENT / On Duty pulse pill.
   * Defaults off for Tech Head (no personal attendance).
   */
  showAttendancePulse,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = user?.role;
  const displayRole = roleLabel || ROLE_LABELS[role] || role || 'Department';
  const [mobileOpen, setMobileOpen] = useState(false);
  const pulseEnabled =
    showAttendancePulse !== undefined
      ? Boolean(showAttendancePulse)
      : role !== 'tech_head';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const sidebar = (
    <div className="flex h-full w-64 flex-col border-r border-[#222222] bg-[#111111] text-white">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[#222222] px-5">
        <div className="min-w-0">
          <img
            src="/logo.webp"
            alt="Flash Tech"
            className="h-8 w-auto max-w-[148px] object-contain object-left"
          />
          <p className="mt-1 truncate text-[10px] font-medium uppercase tracking-wider text-[#A3A3A3]">
            {displayRole}
          </p>
        </div>
      </div>

      <nav
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
        aria-label={`${displayRole} navigation`}
      >
        {navItems.map((item) => {
          const active = isItemActive(item, location.pathname, location.search);
          const Icon = item.icon;
          return (
            <NavLink
              key={`${pathOf(item.to)}?${searchOf(item.to)}:${item.label}`}
              to={item.to}
              end={item.end ?? true}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-[#F25E26] text-white'
                  : 'text-[#A3A3A3] hover:bg-white/5 hover:text-white'
              }`}
            >
              {Icon ? (
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    active ? 'bg-white' : 'bg-white/30'
                  }`}
                  aria-hidden
                />
              )}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.badge != null ? (
                <span
                  className={`inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                    active
                      ? 'bg-white/20 text-white'
                      : Number(item.badge) > 0
                        ? 'bg-[#F25E26]/20 text-[#F25E26]'
                        : 'bg-white/10 text-[#A3A3A3]'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-[#222222] p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/5"
        >
          <LogOut className="h-4 w-4 shrink-0 text-[#A3A3A3]" aria-hidden />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0A] text-white">
      <GracefulExitModal />
      <GlobalRemindersBridge />
      <MessengerIcon />
      <DockedChatWindowsHost />

      <aside className="hidden h-full shrink-0 md:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full w-64 shadow-2xl">{sidebar}</div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#222222] bg-[#111111] px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-white hover:bg-white/5 md:hidden"
              aria-label="Open menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              {mobileOpen ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Menu className="h-5 w-5" aria-hidden />
              )}
            </button>
            <h1 className="truncate font-display text-lg font-semibold tracking-tight text-white sm:text-xl">
              {title}
            </h1>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <ClientCommentNotificationBell />
            <HeaderPulseDot enabled={pulseEnabled} />
            <SessionIdentityBadge user={user} roleLabel={displayRole} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto bg-[#0A0A0A] pb-24">
          {showAttendanceChrome ? <AttendanceBanner /> : null}
          <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
            {showAttendanceChrome ? <DepartmentKpiStrip role={role} /> : null}
            <div className="space-y-6">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
