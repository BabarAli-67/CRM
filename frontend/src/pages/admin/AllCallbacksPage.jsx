import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import useAuth from '../../hooks/useAuth.hook.js';
import { getAllCallbacks } from '../../services/callback.service.js';
import {
  ADMIN_BTN_GHOST,
  ADMIN_CANVAS,
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_ROW,
  ADMIN_TABLE_WRAP,
  ADMIN_THEAD,
} from '../../components/adminBrand.js';

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

const agentLabel = (agent) => {
  if (!agent) return '—';
  if (typeof agent === 'string') return agent;
  return agent.fullName || agent.email || '—';
};

const agentIdOf = (row) => {
  const a = row.agentId;
  if (!a) return '';
  return String(a._id || a);
};

const toPktDayKey = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Karachi',
  });
};

/**
 * Read-only monitoring view of all callbacks (super_admin + admin).
 * No create / edit / delete controls — monitoring only.
 */
export default function AllCallbacksPage() {
  const { user, logout } = useAuth();
  const [agentFilter, setAgentFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const homePath = user?.role === 'admin' ? '/admin/monitor' : '/admin';

  const {
    data: callbacks = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['allCallbacks'],
    queryFn: getAllCallbacks,
    refetchInterval: 60_000,
  });

  const agentOptions = useMemo(() => {
    const map = new Map();
    for (const row of callbacks) {
      const id = agentIdOf(row);
      if (!id || map.has(id)) continue;
      map.set(id, agentLabel(row.agentId));
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [callbacks]);

  const filtered = useMemo(() => {
    return callbacks
      .filter((row) => {
        if (agentFilter && agentIdOf(row) !== agentFilter) return false;

        const day = toPktDayKey(row.callbackAt);
        if (fromDate && day && day < fromDate) return false;
        if (toDate && day && day > toDate) return false;

        return true;
      })
      .sort((a, b) => new Date(a.callbackAt) - new Date(b.callbackAt));
  }, [callbacks, agentFilter, fromDate, toDate]);

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
              All Callbacks
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              System-wide monitoring · read-only for Super Admin and Auditor
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={homePath} className={ADMIN_BTN_GHOST}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Back
            </Link>
            <button type="button" onClick={logout} className={ADMIN_BTN_GHOST}>
              Log out
            </button>
          </div>
        </header>

        <section className={`${ADMIN_CARD} space-y-4`}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-zinc-400">
              Agent
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className={ADMIN_INPUT}
              >
                <option value="">All agents</option>
                {agentOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              From (PKT date)
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={ADMIN_INPUT}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              To (PKT date)
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={ADMIN_INPUT}
              />
            </label>

            <button
              type="button"
              onClick={() => {
                setAgentFilter('');
                setFromDate('');
                setToDate('');
              }}
              className={ADMIN_BTN_GHOST}
            >
              Clear filters
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
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Scheduled (PKT)</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row._id} className={ADMIN_ROW}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {agentLabel(row.agentId)}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">
                      {row.businessName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.phone}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatPkt(row.callbackAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
                          row.status === 'promoted'
                            ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
                        ].join(' ')}
                      >
                        {row.status === 'promoted' ? 'promoted' : 'pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
