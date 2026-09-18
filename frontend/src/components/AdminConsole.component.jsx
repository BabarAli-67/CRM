import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Clock3,
  LayoutDashboard,
  LogOut,
  PhoneCall,
  PieChart as PieChartIcon,
  Users,
  Workflow,
} from 'lucide-react';
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import AttendanceGrid from './AttendanceGrid.component.jsx';
import LateRequestsQueue from './LateRequestsQueue.component.jsx';
import UserAccessManagement from './UserAccessManagement.component.jsx';
import UserRoster from './UserRoster.component.jsx';
import useAuth from '../hooks/useAuth.hook.js';
import useShiftClock from '../hooks/useShiftClock.hook.js';
import { getAllUsers } from '../services/admin.service.js';
import { getGrid } from '../services/attendance.service.js';
import { getShift, updateShift } from '../services/shift.service.js';
import {
  ADMIN_BTN_GHOST,
  ADMIN_BTN_PRIMARY,
  ADMIN_CANVAS,
  ADMIN_CARD,
  ADMIN_INPUT,
} from './adminBrand.js';

const TABS = [
  { id: 'operations', label: 'Live Operations' },
  { id: 'directory', label: 'User Directory' },
  { id: 'logs', label: 'Attendance Logs' },
];

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const CHART_COLORS = {
  present: '#10B981',
  late: '#F59E0B',
  absent: '#EF4444',
  pending_approval: '#FF4B26',
};

const getPktParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    dateStr: `${map.year}-${map.month}-${map.day}`,
  };
};

const getCurrentShiftDateStr = (now = new Date()) => {
  const pkt = getPktParts(now);
  if (pkt.hour < 12) {
    const d = new Date(`${pkt.dateStr}T12:00:00+05:00`);
    d.setDate(d.getDate() - 1);
    return getPktParts(d).dateStr;
  }
  return pkt.dateStr;
};

/** PKT wall-clock instants for a shift calendar date (handles overnight windows). */
const deriveShiftWindow = (shiftDate, settings) => {
  if (!shiftDate || !settings?.startTime || !settings?.endTime) return null;

  const startTime = String(settings.startTime).slice(0, 5);
  const endTime = String(settings.endTime).slice(0, 5);
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;

  const start = new Date(`${shiftDate}T${startTime}:00+05:00`);
  let end = new Date(`${shiftDate}T${endTime}:00+05:00`);
  if (eh * 60 + em <= sh * 60 + sm) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  return { start, end, startTime, endTime };
};

const addPktCalendarDays = (dateStr, days) => {
  const base = new Date(`${dateStr}T12:00:00+05:00`);
  base.setDate(base.getDate() + days);
  return getPktParts(base).dateStr;
};

/**
 * Two-phase pulse: active → countdown to dynamic end; idle → countdown to next dynamic start.
 */
const deriveShiftPulse = (nowDate, settings) => {
  const window = deriveShiftWindow(getCurrentShiftDateStr(nowDate), settings);
  if (!window) return null;

  const t = nowDate.getTime();
  const startMs = window.start.getTime();
  const endMs = window.end.getTime();

  if (t >= startMs && t < endMs) {
    return {
      phase: 'active',
      remainingMs: endMs - t,
      subtitleTime: window.endTime,
    };
  }

  let nextStart = window.start;
  if (t >= endMs) {
    const nextDate = addPktCalendarDays(getCurrentShiftDateStr(nowDate), 1);
    const nextWindow = deriveShiftWindow(nextDate, settings);
    if (!nextWindow) return null;
    nextStart = nextWindow.start;
  }

  return {
    phase: 'idle',
    remainingMs: Math.max(0, nextStart.getTime() - t),
    subtitleTime: window.startTime,
  };
};

const formatCountdown = (ms) => {
  if (ms == null) return '—';
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

function ShiftSettingsPanel() {
  const queryClient = useQueryClient();
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('04:00');
  const [weekendDays, setWeekendDays] = useState([6, 0]);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['shiftSettings'],
    queryFn: getShift,
  });

  useEffect(() => {
    if (!data?.settings) return;
    setStartTime(data.settings.startTime || '19:00');
    setEndTime(data.settings.endTime || '04:00');
    setWeekendDays(
      Array.isArray(data.settings.weekendDays)
        ? [...data.settings.weekendDays]
        : [6, 0]
    );
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload) => updateShift(payload),
    onSuccess: () => {
      setFormError('');
      setFormSuccess('Shift settings saved.');
      queryClient.invalidateQueries({ queryKey: ['shiftSettings'] });
    },
    onError: (err) => {
      setFormSuccess('');
      setFormError(
        err.response?.data?.message || 'Failed to update shift settings.'
      );
    },
  });

  const toggleWeekendDay = (day) => {
    setWeekendDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate({
          startTime: startTime.slice(0, 5),
          endTime: endTime.slice(0, 5),
          weekendDays,
        });
      }}
      className={`${ADMIN_CARD} space-y-4`}
    >
      {isLoading ? (
        <p className="text-sm text-zinc-400">Loading shift settings…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
              Start time
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className={ADMIN_INPUT}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-400">
              End time
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className={ADMIN_INPUT}
              />
            </label>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-zinc-400">
              Weekend days (Asia/Karachi)
            </legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((day) => {
                const checked = weekendDays.includes(day.value);
                return (
                  <label
                    key={day.value}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                      checked
                        ? 'border-[#FF4B26]/50 bg-[#FF4B26]/10 text-white'
                        : 'border-white/10 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleWeekendDay(day.value)}
                      className="accent-[#FF4B26]"
                    />
                    {day.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {formError ? <p className="text-sm text-red-400">{formError}</p> : null}
          {formSuccess ? (
            <p className="text-sm text-emerald-400">{formSuccess}</p>
          ) : null}

          <button
            type="submit"
            disabled={saveMutation.isPending}
            className={ADMIN_BTN_PRIMARY}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Shift Settings'}
          </button>
        </>
      )}
    </form>
  );
}

function AttendanceDonut({ records }) {
  const summary = useMemo(() => {
    const counts = {
      present: 0,
      late: 0,
      absent: 0,
      pending_approval: 0,
    };

    records.forEach((row) => {
      if (row.status === 'present') counts.present += 1;
      else if (row.status === 'late') counts.late += 1;
      else if (row.status === 'absent' || row.status === 'auto_absent')
        counts.absent += 1;
      else if (row.status === 'pending_approval') counts.pending_approval += 1;
    });

    const data = [
      { key: 'present', name: 'Present', value: counts.present, color: CHART_COLORS.present },
      { key: 'late', name: 'Late', value: counts.late, color: CHART_COLORS.late },
      { key: 'absent', name: 'Absent', value: counts.absent, color: CHART_COLORS.absent },
      {
        key: 'pending_approval',
        name: 'Pending',
        value: counts.pending_approval,
        color: CHART_COLORS.pending_approval,
      },
    ];

    const total = data.reduce((sum, d) => sum + d.value, 0);
    return { data: data.filter((d) => d.value > 0), all: data, total, counts };
  }, [records]);

  return (
    <div className={`${ADMIN_CARD} h-full`}>
      <div className="mb-4 flex items-center gap-2">
        <PieChartIcon className="h-4 w-4 text-[#FF4B26]" aria-hidden />
        <h3 className="font-display text-lg font-semibold text-white">
          Attendance Analytics
        </h3>
      </div>

      {summary.total === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-400">
          No attendance signals for today’s shift yet.
        </p>
      ) : (
        <>
          <div className="mx-auto h-56 w-full max-w-sm">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={summary.data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={88}
                  paddingAngle={3}
                  stroke="transparent"
                >
                  {summary.data.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#131518',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    color: '#fff',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="mt-2 space-y-2">
            {summary.all.map((item) => {
              const pct =
                summary.total === 0
                  ? 0
                  : Math.round((item.value / summary.total) * 100);
              return (
                <li
                  key={item.key}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2 text-zinc-300">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                      aria-hidden
                    />
                    {item.name}
                  </span>
                  <span className="font-medium text-white">
                    {item.value}{' '}
                    <span className="text-zinc-500">({pct}%)</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, hint, accent, iconTone }) {
  const iconWrapClass =
    iconTone === 'live'
      ? 'rounded-xl border border-orange-500/40 bg-orange-500/10 p-2.5 text-orange-400 shadow-[0_0_14px_rgba(249,115,22,0.45)] animate-pulse'
      : iconTone === 'idle'
        ? 'rounded-xl border border-zinc-700/80 bg-zinc-900/70 p-2.5 text-zinc-500'
        : 'rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-[#FF4B26]';

  return (
    <div className={`${ADMIN_CARD} relative overflow-hidden`}>
      {accent ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#FF4B26] via-[#F23B18] to-[#C92000]"
          aria-hidden
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            {label}
          </p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
            {value}
          </p>
          {hint ? <p className="mt-2 text-sm text-zinc-400">{hint}</p> : null}
        </div>
        <div className={iconWrapClass}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
    </div>
  );
}

/**
 * Shared Super Admin / Auditor console shell.
 * @param {{ readOnly?: boolean, title: string, subtitle: string }} props
 */
export default function AdminConsole({
  readOnly = false,
  title,
  subtitle,
}) {
  const { user, logout } = useAuth();
  const { settings, now, loading: clockLoading } = useShiftClock();
  const [tab, setTab] = useState('operations');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const shiftDate = getCurrentShiftDateStr(now());

  const { data: users = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: () => getAllUsers(),
  });

  const { data: todayRecords = [] } = useQuery({
    queryKey: ['attendanceGrid', 'todayPulse', shiftDate],
    queryFn: () => getGrid({ from: shiftDate, to: shiftDate }),
    refetchInterval: 30000,
  });

  const activeUsers = users.filter((u) => u.status === 'approved').length;
  const pendingUsers = users.filter((u) => u.status === 'pending').length;

  const pulse = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    todayRecords.forEach((row) => {
      if (row.status === 'present') present += 1;
      else if (row.status === 'late') late += 1;
      else if (row.status === 'absent' || row.status === 'auto_absent')
        absent += 1;
    });
    return { present, late, absent };
  }, [todayRecords]);

  const shiftPulse = useMemo(() => {
    if (clockLoading || !settings?.startTime || !settings?.endTime) return null;
    return deriveShiftPulse(now(), settings);
  }, [clockLoading, settings, now, tick]);

  const shiftIsActive = shiftPulse?.phase === 'active';
  const shiftCountdown = shiftPulse
    ? formatCountdown(shiftPulse.remainingMs)
    : '—';
  const shiftHint = shiftIsActive
    ? `Shift ends in · ${shiftPulse.subtitleTime} PKT`
    : shiftPulse
      ? `Shift starts in · ${shiftPulse.subtitleTime} PKT`
      : 'Waiting for shift settings';
  const shiftLabel = shiftIsActive ? 'ACTIVE SHIFT PULSE' : 'UPCOMING SHIFT';

  return (
    <div className={ADMIN_CANVAS}>
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-10">
        <header className={`${ADMIN_CARD} flex flex-wrap items-center justify-between gap-4`}>
          <div>
            <p className="bg-gradient-to-r from-[#FF4B26] via-[#F23B18] to-[#C92000] bg-clip-text font-display text-sm font-bold italic tracking-wide text-transparent">
              FLASH TECH
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {title}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/admin/callbacks" className={ADMIN_BTN_GHOST}>
              <PhoneCall className="mr-2 h-4 w-4" aria-hidden />
              Callbacks
            </Link>
            <Link to="/admin/pipeline" className={ADMIN_BTN_GHOST}>
              <Workflow className="mr-2 h-4 w-4" aria-hidden />
              Pipeline
            </Link>
            <Link to="/admin/reports/monthly" className={ADMIN_BTN_GHOST}>
              <PieChartIcon className="mr-2 h-4 w-4" aria-hidden />
              Reports
            </Link>
            <span className="text-sm text-zinc-400">
              {user?.fullName || user?.email}
            </span>
            <button type="button" onClick={logout} className={ADMIN_BTN_GHOST}>
              <LogOut className="mr-2 h-4 w-4" aria-hidden />
              Log out
            </button>
          </div>
        </header>

        <nav
          className="flex flex-wrap gap-2 rounded-2xl border border-white/[0.07] bg-[#131518]/60 p-1.5 backdrop-blur-md"
          aria-label="Admin sections"
        >
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative flex-1 rounded-xl px-4 py-2.5 font-display text-sm font-semibold transition sm:flex-none ${
                  active
                    ? 'bg-gradient-to-r from-[#FF4B26] via-[#F23B18] to-[#C92000] text-white shadow-lg shadow-orange-950/40'
                    : 'text-zinc-400 hover:bg-white/[0.03] hover:text-white'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {tab === 'operations' ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                icon={Users}
                label="Total System Users"
                value={users.length}
                hint={`${activeUsers} active · ${pendingUsers} pending`}
                accent
              />
              <KpiCard
                icon={Activity}
                label="Today's Attendance Pulse"
                value={`${pulse.present + pulse.late}`}
                hint={`Present ${pulse.present} · Late ${pulse.late} · Absent ${pulse.absent}`}
              />
              <KpiCard
                icon={Clock3}
                label={shiftLabel}
                value={shiftCountdown}
                hint={shiftHint}
                iconTone={shiftIsActive ? 'live' : 'idle'}
              />
              <KpiCard
                icon={Workflow}
                label="Operational Pipeline"
                value="Live"
                hint="Open Pipeline from the header"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <AttendanceDonut records={todayRecords} />
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-xl font-semibold text-white">
                    Shift Window Settings
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {readOnly
                      ? 'View-only for Auditor — edits require Super Admin'
                      : 'Organization-wide shift window (Asia/Karachi)'}
                  </p>
                </div>
                {readOnly ? (
                  <div className={`${ADMIN_CARD} space-y-3 text-sm text-zinc-300`}>
                    <p>
                      Start:{' '}
                      <span className="font-medium text-white">
                        {settings?.startTime || '—'}
                      </span>
                    </p>
                    <p>
                      End:{' '}
                      <span className="font-medium text-white">
                        {settings?.endTime || '—'}
                      </span>
                    </p>
                    <p>
                      Weekends:{' '}
                      <span className="font-medium text-white">
                        {(settings?.weekendDays || [])
                          .map(
                            (d) =>
                              WEEKDAY_OPTIONS.find((o) => o.value === d)?.label ||
                              d
                          )
                          .join(', ') || '—'}
                      </span>
                    </p>
                  </div>
                ) : (
                  <ShiftSettingsPanel />
                )}
              </div>
            </div>

            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-[#FF4B26]" aria-hidden />
                <div>
                  <h2 className="font-display text-xl font-semibold text-white">
                    Late Attendance Requests
                    {readOnly ? ' (View Only)' : ''}
                  </h2>
                  <p className="text-sm text-zinc-400">
                    Pending late check-ins awaiting Super Admin review
                  </p>
                </div>
              </div>
              <LateRequestsQueue readOnly={readOnly} />
            </section>
          </div>
        ) : null}

        {tab === 'directory' ? (
          <div className="space-y-8">
            <section className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-white">
                  Pending Access Approvals
                  {readOnly ? ' (View Only)' : ''}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Review registration requests and assign roles
                </p>
              </div>
              <UserAccessManagement readOnly={readOnly} />
            </section>
            <section className="space-y-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-white">
                  All System Users
                  {readOnly ? ' (View Only)' : ''}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Directory with roles, status badges, and roster controls
                </p>
              </div>
              <UserRoster readOnly={readOnly} />
            </section>
          </div>
        ) : null}

        {tab === 'logs' ? (
          <section className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-white">
                Attendance Logs
                {readOnly ? ' (View Only)' : ''}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Filterable grid with status pills and CSV export
              </p>
            </div>
            <AttendanceGrid readOnly={readOnly} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
