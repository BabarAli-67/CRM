import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import useAuth from '../../hooks/useAuth.hook.js';
import { getAdminCallbacks } from '../../services/callback.service.js';
import SessionIdentityBadge from '../../components/SessionIdentityBadge.component.jsx';
import { formatUserRef } from '../../utils/formatUserRef.util.js';
import {
  ADMIN_BTN_GHOST,
  ADMIN_BTN_PRIMARY,
  ADMIN_CANVAS,
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_ROW,
  ADMIN_TABLE_WRAP,
  ADMIN_THEAD,
} from '../../components/adminBrand.js';

const ROLE_LABEL = {
  sales_agent: 'Sales Agent',
  closer: 'Closer',
  cst_manager: 'CST Manager',
  tech_team: 'Tech Team',
  super_admin: 'Super Admin',
  admin: 'Auditor',
};

const DATE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'all', label: 'All' },
];

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'missed', label: 'Missed Only' },
  { id: 'completed', label: 'Completed' },
  { id: 'pending', label: 'Pending' },
];

const pktDayKey = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Karachi',
  });
};

/** YYYY-MM-DD for "today" in Asia/Karachi. */
const pktTodayKey = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

const addPktDays = (dayKey, delta) => {
  const [y, m, d] = dayKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + delta));
  return utc.toISOString().slice(0, 10);
};

const startOfPktWeek = (dayKey) => {
  // Monday-start week in PKT calendar dates
  const [y, m, d] = dayKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay(); // 0 Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  return addPktDays(dayKey, offset);
};

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const assigneeOf = (row) => row.closerId || row.agentId;

const assigneeLabel = (person) => {
  if (!person) return '—';
  const name = formatUserRef(person) || person.fullName || person.username || '—';
  const role = ROLE_LABEL[person.role] || person.role || '';
  return role ? `${name} (${role})` : name;
};

const assigneeIdOf = (row) => {
  const a = assigneeOf(row);
  if (!a) return '';
  return String(a._id || a);
};

/**
 * Derive display bucket for a callback row.
 * @returns {'completed'|'upcoming'|'missed'|'transferred'|'cancelled'}
 */
export function deriveCallbackBucket(row, now = Date.now()) {
  const status = row.status || 'pending';
  if (status === 'completed' || status === 'promoted') return 'completed';
  if (status === 'transferred') return 'transferred';
  if (status === 'cancelled') return 'cancelled';
  const at = new Date(row.callbackAt).getTime();
  if (Number.isNaN(at)) return 'upcoming';
  return at < now ? 'missed' : 'upcoming';
}

export function formatOverdueDuration(callbackAt, now = Date.now()) {
  const at = new Date(callbackAt).getTime();
  if (Number.isNaN(at) || at >= now) return '—';

  const diffMs = now - at;
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  const scheduledDay = pktDayKey(callbackAt);
  const today = pktTodayKey();
  if (scheduledDay && scheduledDay < today) {
    if (days <= 1) return 'Missed yesterday';
    return `Missed ${days} days ago`;
  }

  if (mins < 60) return `Late by ${Math.max(1, mins)} min`;
  if (hours < 24) {
    const rem = mins % 60;
    return rem
      ? `Late by ${hours}h ${rem}m`
      : `Late by ${hours}h`;
  }
  return `Late by ${days}d`;
}

const BUCKET_BADGE = {
  completed: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  upcoming: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  missed: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40',
  transferred: 'bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30',
  cancelled: 'bg-zinc-500/10 text-zinc-500 ring-1 ring-zinc-600/40',
};

const BUCKET_LABEL = {
  completed: 'Completed',
  upcoming: 'Upcoming',
  missed: 'Missed / Overdue',
  transferred: 'Transferred',
  cancelled: 'Cancelled',
};

/**
 * Super Admin / Auditor — Callbacks Audit & Monitoring.
 */
export default function AllCallbacksPage() {
  const { user, logout } = useAuth();
  const [statusFilter, setStatusFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [datePreset, setDatePreset] = useState('today');
  const [nowTick, setNowTick] = useState(() => Date.now());

  const homePath = user?.role === 'admin' ? '/admin/monitor' : '/admin';

  const {
    data: callbacks = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['adminCallbacks'],
    queryFn: getAdminCallbacks,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayKey = pktTodayKey();
  const yesterdayKey = addPktDays(todayKey, -1);
  const weekStart = startOfPktWeek(todayKey);

  const userOptions = useMemo(() => {
    const map = new Map();
    for (const row of callbacks) {
      const person = assigneeOf(row);
      const id = assigneeIdOf(row);
      if (!id || map.has(id)) continue;
      map.set(id, {
        id,
        label: assigneeLabel(person),
        role: person?.role || '',
      });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [callbacks]);

  const roleOptions = useMemo(() => {
    const set = new Set();
    for (const row of callbacks) {
      const role = assigneeOf(row)?.role;
      if (role) set.add(role);
    }
    return [...set].sort();
  }, [callbacks]);

  const filtered = useMemo(() => {
    const now = nowTick;
    return callbacks
      .filter((row) => {
        if (datePreset !== 'all') {
          const day = pktDayKey(row.callbackAt);
          if (!day) return false;
          if (datePreset === 'today' && day !== todayKey) return false;
          if (datePreset === 'yesterday' && day !== yesterdayKey) return false;
          if (
            datePreset === 'week' &&
            (day < weekStart || day > todayKey)
          ) {
            return false;
          }
        }
        if (userFilter && assigneeIdOf(row) !== userFilter) return false;
        if (roleFilter && assigneeOf(row)?.role !== roleFilter) return false;

        const bucket = deriveCallbackBucket(row, now);
        if (statusFilter === 'missed') return bucket === 'missed';
        if (statusFilter === 'completed') {
          return (
            bucket === 'completed' ||
            bucket === 'transferred' ||
            bucket === 'cancelled'
          );
        }
        if (statusFilter === 'pending') {
          return bucket === 'upcoming' || bucket === 'missed';
        }
        return true;
      })
      .sort((a, b) => new Date(a.callbackAt) - new Date(b.callbackAt));
  }, [
    callbacks,
    statusFilter,
    userFilter,
    roleFilter,
    datePreset,
    nowTick,
    todayKey,
    yesterdayKey,
    weekStart,
  ]);

  const todayMetrics = useMemo(() => {
    const now = nowTick;
    const todayRows = callbacks.filter(
      (row) => pktDayKey(row.callbackAt) === todayKey
    );
    let completed = 0;
    let missed = 0;
    let upcoming = 0;
    for (const row of todayRows) {
      const bucket = deriveCallbackBucket(row, now);
      if (
        bucket === 'completed' ||
        bucket === 'transferred' ||
        bucket === 'cancelled'
      ) {
        completed += 1;
      } else if (bucket === 'missed') {
        missed += 1;
      } else {
        upcoming += 1;
      }
    }
    return {
      scheduled: todayRows.length,
      completed,
      missed,
      upcoming,
    };
  }, [callbacks, todayKey, nowTick]);

  return (
    <div className={ADMIN_CANVAS}>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10">
        <header
          className={`${ADMIN_CARD} flex flex-wrap items-center justify-between gap-4`}
        >
          <div>
            <p className="bg-gradient-to-r from-[#FF4B26] via-[#F23B18] to-[#C92000] bg-clip-text font-display text-sm font-bold italic tracking-wide text-transparent">
              FLASH TECH
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Callbacks Monitor
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Team adherence · missed calls · outcomes · Super Admin & Auditor
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SessionIdentityBadge user={user} />
            <Link to={homePath} className={ADMIN_BTN_GHOST}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Back
            </Link>
            <button type="button" onClick={logout} className={ADMIN_BTN_GHOST}>
              Log out
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Scheduled Today"
            value={todayMetrics.scheduled}
            hint="PKT calendar day"
          />
          <MetricCard
            label="Completed / Taken"
            value={todayMetrics.completed}
            hint="Done · transferred · cancelled"
            tone="good"
          />
          <MetricCard
            label="Missed / Overdue"
            value={todayMetrics.missed}
            hint="Past due · still pending"
            tone="bad"
          />
          <MetricCard
            label="Pending Upcoming"
            value={todayMetrics.upcoming}
            hint="Later today"
            tone="info"
          />
        </section>

        <section className={`${ADMIN_CARD} space-y-4`}>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDatePreset(p.id)}
                className={
                  datePreset === p.id ? ADMIN_BTN_PRIMARY : ADMIN_BTN_GHOST
                }
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setStatusFilter(p.id)}
                className={
                  statusFilter === p.id ? ADMIN_BTN_PRIMARY : ADMIN_BTN_GHOST
                }
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[10rem] flex-col gap-1 text-xs text-zinc-400">
              Role
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className={ADMIN_INPUT}
              >
                <option value="">All roles</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role] || role}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-zinc-400">
              Assigned to
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className={ADMIN_INPUT}
              >
                <option value="">All staff</option>
                {userOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setUserFilter('');
                setRoleFilter('');
                setDatePreset('today');
              }}
              className={ADMIN_BTN_GHOST}
            >
              Reset filters
            </button>
          </div>

          <p className="text-xs text-zinc-500">
            Showing {filtered.length} of {callbacks.length} callbacks
          </p>
        </section>

        <section className={ADMIN_TABLE_WRAP}>
          {isLoading ? (
            <p className="p-8 text-center text-sm text-zinc-400">Loading…</p>
          ) : isError ? (
            <p className="p-8 text-center text-sm text-red-300">
              {error?.response?.data?.message || 'Failed to load callbacks.'}
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-zinc-400">
              No callbacks match the current filters.
            </p>
          ) : (
            <table className="min-w-full text-left text-sm text-zinc-200">
              <thead className={ADMIN_THEAD}>
                <tr>
                  <th className="px-4 py-3 font-medium">Lead / Business</th>
                  <th className="px-4 py-3 font-medium">Assigned To</th>
                  <th className="px-4 py-3 font-medium">Scheduled (PKT)</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Overdue</th>
                  <th className="px-4 py-3 font-medium">Notes / Outcome</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const bucket = deriveCallbackBucket(row, nowTick);
                  return (
                    <tr key={row._id} className={ADMIN_ROW}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">
                          {row.businessName}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {row.phone || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {assigneeLabel(assigneeOf(row))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatPkt(row.callbackAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${BUCKET_BADGE[bucket]}`}
                        >
                          {BUCKET_LABEL[bucket]}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-400">
                        {bucket === 'missed'
                          ? formatOverdueDuration(row.callbackAt, nowTick)
                          : '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[16rem] truncate text-zinc-400">
                        {row.notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, hint, tone }) {
  const valueClass =
    tone === 'bad'
      ? 'text-red-300'
      : tone === 'good'
        ? 'text-emerald-300'
        : tone === 'info'
          ? 'text-sky-300'
          : 'text-white';

  return (
    <div className={ADMIN_CARD}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className={`mt-2 font-display text-3xl font-semibold ${valueClass}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}
