import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import LeadDetailModal from '../../components/leads/LeadDetailModal.jsx';
import CstManagerShell from '../../components/cst-manager/CstManagerShell.jsx';
import {
  getHandoverQueue,
  getTechPipeline,
  markClientOnboarded,
} from '../../services/handover.service.js';
import { formatUserRef } from '../../utils/formatUserRef.util.js';
import {
  formatMoneyAmount,
  formatPaymentSummary,
  getClientRevenueTotals,
} from '../../utils/formatPayment.util.js';

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Compact PKT clock for Activation Call Yes badge, e.g. "11:05 PM". */
const formatPktTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-PK', {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Activation Call badge — muted No when unset; green Yes + PKT time after Client Detail save.
 */
function ActivationCallBadge({ handover }) {
  const done = Boolean(handover?.activationCall?.done);
  const at = handover?.activationCall?.at;
  if (!done) {
    return (
      <span className="inline-flex rounded-full bg-zinc-500/15 px-2.5 py-0.5 text-xs font-semibold text-zinc-400 ring-1 ring-zinc-600/40">
        No
      </span>
    );
  }
  const timeLabel = formatPktTime(at);
  return (
    <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/35">
      {timeLabel ? `Yes (${timeLabel} PKT)` : 'Yes'}
    </span>
  );
}

const TABS = [
  { id: 'pending', label: 'Pending Review' },
  { id: 'onboard', label: 'Onboard' },
  { id: 'tech', label: 'Tech Status' },
];

const TAB_IDS = new Set(TABS.map((t) => t.id));

const resolveTab = (value) =>
  TAB_IDS.has(value) ? value : 'pending';

const TECH_BADGE = {
  onboarded: {
    label: 'Onboarded · Active',
    className: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/40',
  },
  assigned: {
    label: 'Assigned to Tech',
    className: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/35',
  },
  in_progress: {
    label: 'In Progress',
    className: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40',
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/35',
  },
};

function resolveTechStatus(lead) {
  const cst = lead?.handover?.cstStatus;
  if (cst === 'onboarded') return 'onboarded';
  return lead?.handover?.techStatus || cst || 'assigned';
}

export default function HandoverQueuePage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveTab(searchParams.get('tab'));
  const setTab = (next) => {
    const id = resolveTab(next);
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (id === 'pending') nextParams.delete('tab');
        else nextParams.set('tab', id);
        return nextParams;
      },
      { replace: true }
    );
  };
  const [detailLead, setDetailLead] = useState(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!message) return undefined;
    const id = window.setTimeout(() => setMessage(''), 4_000);
    return () => window.clearTimeout(id);
  }, [message]);

  const {
    data: queueLeads = [],
    isLoading: queueLoading,
    isError: queueError,
    error: queueErr,
  } = useQuery({
    queryKey: ['handoverQueue'],
    queryFn: getHandoverQueue,
    refetchInterval: 30_000,
  });

  const {
    data: techLeads = [],
    isLoading: techLoading,
    isError: techError,
    error: techErr,
  } = useQuery({
    queryKey: ['cstTechPipeline'],
    queryFn: getTechPipeline,
    refetchInterval: 15_000,
  });

  const pendingRows = useMemo(
    () =>
      queueLeads.filter((l) => l.handover?.cstStatus === 'pending_review'),
    [queueLeads]
  );

  const onboardRows = useMemo(
    () =>
      [...queueLeads.filter((l) => l.handover?.cstStatus === 'onboarded')].sort(
        (a, b) =>
          new Date(b.handover?.onboardedAt || b.updatedAt || 0) -
          new Date(a.handover?.onboardedAt || a.updatedAt || 0)
      ),
    [queueLeads]
  );

  const techCounts = useMemo(() => {
    let onboarded = 0;
    let assigned = 0;
    let inProgress = 0;
    let completed = 0;
    for (const lead of techLeads) {
      const s = resolveTechStatus(lead);
      if (s === 'onboarded') onboarded += 1;
      else if (s === 'completed') completed += 1;
      else if (s === 'in_progress') inProgress += 1;
      else assigned += 1;
    }
    return { onboarded, assigned, inProgress, completed };
  }, [techLeads]);

  const tabCount = (id) => {
    if (id === 'pending') return pendingRows.length;
    if (id === 'onboard') return onboardRows.length;
    if (id === 'tech') return techLeads.length;
    return 0;
  };

  const onboardMutation = useMutation({
    mutationFn: (id) => markClientOnboarded(id),
    onSuccess: (lead) => {
      setActionError('');
      setMessage('Client moved to Onboard');
      queryClient.setQueryData(['handoverQueue'], (old) => {
        if (!Array.isArray(old) || !lead?._id) return old;
        const exists = old.some((l) => String(l._id) === String(lead._id));
        if (exists) {
          return old.map((l) =>
            String(l._id) === String(lead._id) ? { ...l, ...lead } : l
          );
        }
        return [...old, lead];
      });
      // Optimistic Tech Status board — Onboarded · Active until Assign Tech
      queryClient.setQueryData(['cstTechPipeline'], (old) => {
        if (!Array.isArray(old) || !lead?._id) return old;
        const without = old.filter(
          (l) => String(l._id) !== String(lead._id)
        );
        if (lead.handover?.cstStatus !== 'onboarded') return without;
        return [lead, ...without];
      });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
      queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'handoverQueue'] });
      setTab('onboard');
    },
    onError: (err) => {
      setMessage('');
      setActionError(
        err?.response?.data?.message || 'Failed to move client to Onboard.'
      );
    },
  });

  return (
    <CstManagerShell title="Handover Queue">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              Client handovers
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Onboard new clients · track live Tech delivery status
            </p>
          </div>
        </div>

        <nav
          className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-1.5"
          aria-label="Handover sections"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            const count = tabCount(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative flex-1 rounded-full px-4 py-2.5 font-display text-sm font-semibold transition sm:flex-none ${
                  active
                    ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/25'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-white'
                }`}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {t.label}
                  <span
                    className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                      active
                        ? 'bg-white/20 text-white'
                        : count > 0
                          ? 'bg-orange-600/20 text-orange-300'
                          : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {count}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {message ? (
          <p
            className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300"
            role="status"
          >
            {message}
          </p>
        ) : null}
        {actionError ? (
          <p
            className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}

        {tab === 'pending' ? (
          queueLoading ? (
            <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
          ) : queueError ? (
            <p className="py-12 text-center text-sm text-red-400">
              {queueErr?.response?.data?.message ||
                'Failed to load handover queue.'}
            </p>
          ) : pendingRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              No leads pending review.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
              <table className="min-w-full text-left text-sm text-zinc-200">
                <thead className="border-b border-zinc-800 bg-zinc-950/40 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3.5 font-medium">Business</th>
                    <th className="px-4 py-3.5 font-medium">Payment</th>
                    <th className="px-4 py-3.5 font-medium">Activation Call</th>
                    <th className="px-4 py-3.5 font-medium">Closed (PKT)</th>
                    <th className="px-4 py-3.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRows.map((row) => {
                    const busy =
                      onboardMutation.isPending &&
                      onboardMutation.variables === row._id;
                    return (
                      <tr
                        key={row._id}
                        className="border-b border-zinc-800/50 last:border-0 transition-colors hover:bg-zinc-800/25"
                      >
                        <td className="px-4 py-3.5 font-medium text-white">
                          {row.businessName}
                        </td>
                        <td className="px-4 py-3.5 max-w-[14rem] truncate text-zinc-300">
                          {formatPaymentSummary(row.payment)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <ActivationCallBadge handover={row.handover} />
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-zinc-400">
                          {formatPkt(row.closedAt)}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            disabled={busy || onboardMutation.isPending}
                            onClick={() => {
                              setMessage('');
                              setActionError('');
                              onboardMutation.mutate(row._id);
                            }}
                            className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busy ? 'Moving…' : 'Onboard Client'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === 'onboard' ? (
          queueLoading ? (
            <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
          ) : queueError ? (
            <p className="py-12 text-center text-sm text-red-400">
              {queueErr?.response?.data?.message ||
                'Failed to load onboarded clients.'}
            </p>
          ) : onboardRows.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              No onboarded clients yet. Use Onboard Client from Pending Review.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {onboardRows.map((row) => {
                const revenue = getClientRevenueTotals(row);
                return (
                  <Link
                    key={row._id}
                    to={`/dashboard/cst-manager/client/${row._id}`}
                    className="block rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-4 py-3.5 transition hover:border-orange-500/40 hover:bg-zinc-950/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate font-display text-sm font-bold tracking-tight text-white">
                        {row.businessName || '—'}
                      </h3>
                      <span className="inline-flex shrink-0 rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-300 ring-1 ring-orange-500/40">
                        Onboarded · Active
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <p className="truncate text-xs text-zinc-400">
                        {row.clientName?.trim() || 'No client name'}
                      </p>
                      <ActivationCallBadge handover={row.handover} />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      Collected{' '}
                      <span className="font-semibold text-emerald-300">
                        {formatMoneyAmount(revenue.totalCollected)}
                      </span>
                      {revenue.upsellPaid > 0 ? (
                        <span className="text-zinc-600">
                          {' '}
                          · base {formatMoneyAmount(revenue.baseAmount)}
                        </span>
                      ) : null}
                    </p>
                  </Link>
                );
              })}
            </div>
          )
        ) : null}

        {tab === 'tech' ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatusSummary
                label="Onboarded / Active"
                value={techCounts.onboarded}
                accent="text-orange-300"
              />
              <StatusSummary
                label="Not Started"
                value={techCounts.assigned}
                accent="text-sky-300"
              />
              <StatusSummary
                label="In Progress"
                value={techCounts.inProgress}
                accent="text-amber-300"
              />
              <StatusSummary
                label="Completed"
                value={techCounts.completed}
                accent="text-emerald-300"
              />
            </div>

            {techLoading ? (
              <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
            ) : techError ? (
              <p className="py-12 text-center text-sm text-red-400">
                {techErr?.response?.data?.message ||
                  'Failed to load tech pipeline.'}
              </p>
            ) : techLeads.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-500">
                No clients with Tech yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
                <table className="min-w-full text-left text-sm text-zinc-200">
                  <thead className="border-b border-zinc-800 bg-zinc-950/40 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3.5 font-medium">Business</th>
                      <th className="px-4 py-3.5 font-medium">Assigned Tech</th>
                      <th className="px-4 py-3.5 font-medium">Tech Status</th>
                      <th className="px-4 py-3.5 font-medium">Assigned</th>
                      <th className="px-4 py-3.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {techLeads.map((row) => {
                      const statusKey = resolveTechStatus(row);
                      const badge =
                        TECH_BADGE[statusKey] || TECH_BADGE.assigned;

                      return (
                        <tr
                          key={row._id}
                          className="border-b border-zinc-800/50 last:border-0 transition-colors hover:bg-zinc-800/25"
                        >
                          <td className="px-4 py-3.5">
                            <p className="font-medium text-white">
                              {row.businessName}
                            </p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {row.phone || '—'}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 text-zinc-300">
                            {formatUserRef(row.handover?.assignedTechId) ||
                              (statusKey === 'onboarded'
                                ? 'Awaiting assign'
                                : '—')}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-zinc-400">
                            {formatPkt(
                              row.handover?.assignedAt ||
                                row.handover?.onboardedAt
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={() => setDetailLead(row)}
                              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60"
                            >
                              View details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <LeadDetailModal
        open={Boolean(detailLead)}
        lead={detailLead}
        onClose={() => setDetailLead(null)}
      />
    </CstManagerShell>
  );
}

function StatusSummary({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 font-display text-2xl font-semibold ${accent}`}>
        {value}
      </p>
    </div>
  );
}
