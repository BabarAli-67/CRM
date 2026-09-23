import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ClientOnboardModal from '../../components/handover/ClientOnboardModal.jsx';
import LeadDetailModal from '../../components/leads/LeadDetailModal.jsx';
import CstManagerShell from '../../components/cst-manager/CstManagerShell.jsx';
import {
  getHandoverQueue,
  getTechPipeline,
} from '../../services/handover.service.js';
import { formatUserRef } from '../../utils/formatUserRef.util.js';
import { formatPaymentSummary } from '../../utils/formatPayment.util.js';

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

const TABS = [
  { id: 'pending', label: 'Pending Review' },
  { id: 'tech', label: 'Tech Status' },
];

const TECH_BADGE = {
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
  return (
    lead?.handover?.techStatus ||
    lead?.handover?.cstStatus ||
    'assigned'
  );
}

export default function HandoverQueuePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pending');
  const [onboardTarget, setOnboardTarget] = useState(null);
  const [detailLead, setDetailLead] = useState(null);
  const [message, setMessage] = useState('');

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

  const techCounts = useMemo(() => {
    let assigned = 0;
    let inProgress = 0;
    let completed = 0;
    for (const lead of techLeads) {
      const s = resolveTechStatus(lead);
      if (s === 'completed') completed += 1;
      else if (s === 'in_progress') inProgress += 1;
      else assigned += 1;
    }
    return { assigned, inProgress, completed };
  }, [techLeads]);

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
          <div className="flex flex-wrap gap-1 rounded-full border border-zinc-800 bg-zinc-950/50 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={[
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                  tab === t.id
                    ? 'bg-orange-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200',
                ].join(' ')}
              >
                {t.label}
                {t.id === 'pending' && pendingRows.length > 0
                  ? ` (${pendingRows.length})`
                  : null}
                {t.id === 'tech' && techLeads.length > 0
                  ? ` (${techLeads.length})`
                  : null}
              </button>
            ))}
          </div>
        </div>

        {message ? (
          <p className="mb-3 text-sm text-emerald-400">{message}</p>
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
                    <th className="px-4 py-3.5 font-medium">Created By</th>
                    <th className="px-4 py-3.5 font-medium">Payment</th>
                    <th className="px-4 py-3.5 font-medium">Closed (PKT)</th>
                    <th className="px-4 py-3.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRows.map((row) => (
                    <tr
                      key={row._id}
                      className="border-b border-zinc-800/50 last:border-0 transition-colors hover:bg-zinc-800/25"
                    >
                      <td className="px-4 py-3.5 font-medium text-white">
                        {row.businessName}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-400">
                        {formatUserRef(row.agentId) || '—'}
                      </td>
                      <td className="px-4 py-3.5 max-w-[14rem] truncate text-zinc-300">
                        {formatPaymentSummary(row.payment)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-400">
                        {formatPkt(row.closedAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailLead(row)}
                            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60"
                          >
                            View details
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMessage('');
                              setOnboardTarget(row);
                            }}
                            className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500"
                          >
                            Onboard Client
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === 'tech' ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
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
                No onboarded clients with Tech yet.
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
                              '—'}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-zinc-400">
                            {formatPkt(row.handover?.assignedAt)}
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

      <ClientOnboardModal
        open={Boolean(onboardTarget)}
        lead={onboardTarget}
        onClose={() => setOnboardTarget(null)}
        onSuccess={(updated) => {
          setMessage(
            updated?.businessName
              ? `“${updated.businessName}” onboarded and assigned to tech.`
              : 'Client onboarded and assigned to tech.'
          );
          queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
          queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
          queryClient.invalidateQueries({ queryKey: ['myProjects'] });
          queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
          setTab('tech');
        }}
      />

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
