import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import LeadDetailModal from '../../components/leads/LeadDetailModal.jsx';
import LeadTable from '../../components/leads/LeadTable.jsx';
import CloserScheduleCallbackModal from '../../components/callbacks/CloserScheduleCallbackModal.jsx';
import CloserShell from '../../components/closer/CloserShell.jsx';
import {
  getAssignedLeads,
  getCloserClosedSales,
  getCloserPool,
  getLeadById,
  moveLeadToCst,
} from '../../services/lead.service.js';
import { formatUserRef } from '../../utils/formatUserRef.util.js';
import {
  formatCstStatus,
  formatPaymentSummary,
} from '../../utils/formatPayment.util.js';

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const TABS = [
  { id: 'pool', label: 'Closer Pool' },
  { id: 'claimed', label: 'Claimed Leads' },
  { id: 'closed', label: 'Closed Sales Review' },
];

const thClass =
  'px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500';
const tdClass = 'px-4 py-3.5 align-middle';
const rowClass =
  'border-b border-zinc-800/50 last:border-0 transition-colors hover:bg-zinc-800/25';

export default function AssignedLeadsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pool');
  const [detailLead, setDetailLead] = useState(null);
  const [scheduleLead, setScheduleLead] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const {
    data: pool = [],
    isLoading: poolLoading,
    isError: poolError,
    error: poolErr,
  } = useQuery({
    queryKey: ['closerPool'],
    queryFn: getCloserPool,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  const {
    data: leads = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['assignedLeads'],
    queryFn: getAssignedLeads,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  const {
    data: closedSales = [],
    isLoading: closedLoading,
    isError: closedError,
    error: closedErr,
  } = useQuery({
    queryKey: ['closerClosedSales'],
    queryFn: getCloserClosedSales,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  const openDetail = async (row) => {
    setActionError('');
    setDetailLoading(true);
    try {
      const full = await getLeadById(row._id);
      setDetailLead(full);
    } catch (err) {
      setActionError(
        err?.response?.data?.message || 'Failed to load lead details.'
      );
      setDetailLead(row);
    } finally {
      setDetailLoading(false);
    }
  };

  const moveMutation = useMutation({
    mutationFn: (id) => moveLeadToCst(id),
    onSuccess: () => {
      setActionMessage('Lead handed over to CST.');
      setDetailLead(null);
      queryClient.invalidateQueries({ queryKey: ['closerClosedSales'] });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'handoverQueue'] });
    },
    onError: (err) => {
      setActionError(
        err?.response?.data?.message || 'Failed to move lead to CST.'
      );
    },
  });

  const awaitingHandover = useMemo(
    () =>
      closedSales.filter(
        (l) =>
          !l.handover?.cstStatus ||
          l.handover.cstStatus === 'awaiting_handover'
      ),
    [closedSales]
  );
  const handedOver = useMemo(
    () =>
      closedSales.filter((l) =>
        ['pending_review', 'assigned', 'in_progress', 'completed'].includes(
          l.handover?.cstStatus
        )
      ),
    [closedSales]
  );

  const closedReadyCount = awaitingHandover.length;

  return (
    <CloserShell title="Assigned Leads">
      {actionError ? (
        <p role="alert" className="text-sm text-red-400">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="text-sm text-emerald-400">{actionMessage}</p>
      ) : null}
      {detailLoading ? (
        <p className="text-sm text-zinc-500">Loading lead details…</p>
      ) : null}

      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <nav
          className="mb-8 flex flex-wrap gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-1.5"
          aria-label="Closer lead sections"
        >
          {TABS.map((item) => {
            const active = tab === item.id;
            const count =
              item.id === 'pool'
                ? pool.length
                : item.id === 'claimed'
                  ? leads.length
                  : closedReadyCount;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActionError('');
                  setActionMessage('');
                  setTab(item.id);
                }}
                className={`relative flex-1 rounded-full px-4 py-2.5 font-display text-sm font-semibold transition sm:flex-none ${
                  active
                    ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/25'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-white'
                }`}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {item.label}
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

        {tab === 'closed' ? (
          <div className="mb-6">
            <h2 className="font-display text-lg font-semibold tracking-tight text-white">
              Closed Sales Review
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Review sales and hand over to CST
            </p>
          </div>
        ) : null}

        {tab === 'pool' ? (
          poolLoading ? (
            <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
          ) : poolError ? (
            <p className="py-12 text-center text-sm text-red-400">
              {poolErr?.response?.data?.message ||
                'Failed to load closer pool.'}
            </p>
          ) : (
            <LeadTable
              leads={pool}
              listQueryKey={['closerPool']}
              mode="pool"
              showCreatedBy
              onViewDetails={openDetail}
              onClaimed={() => {
                setActionMessage('Lead claimed.');
                setTab('claimed');
              }}
              emptyMessage="No leads in the pool."
            />
          )
        ) : null}

        {tab === 'claimed' ? (
          isLoading ? (
            <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
          ) : isError ? (
            <p className="py-12 text-center text-sm text-red-400">
              {error?.response?.data?.message ||
                'Failed to load assigned leads.'}
            </p>
          ) : (
            <LeadTable
              leads={leads}
              listQueryKey={['assignedLeads']}
              showCreatedBy
              showCloserSchedule
              onViewDetails={openDetail}
              emptyMessage="No claimed leads."
            />
          )
        ) : null}

        {tab === 'closed' ? (
          closedLoading ? (
            <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
          ) : closedError ? (
            <p className="py-12 text-center text-sm text-red-400">
              {closedErr?.response?.data?.message ||
                'Failed to load closed sales.'}
            </p>
          ) : awaitingHandover.length === 0 && handedOver.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              No closed sales yet.
            </p>
          ) : (
            <div className="space-y-10">
              {awaitingHandover.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
                  <table className="min-w-full text-sm text-zinc-200">
                    <thead className="border-b border-zinc-800 bg-zinc-950/40">
                      <tr>
                        <th className={thClass}>Business</th>
                        <th className={thClass}>Created By</th>
                        <th className={thClass}>Payment</th>
                        <th className={thClass}>Closed</th>
                        <th className={thClass}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {awaitingHandover.map((row) => (
                        <tr key={row._id} className={rowClass}>
                          <td className={`${tdClass} font-medium text-white`}>
                            <span className="inline-flex flex-wrap items-center gap-2">
                              {row.businessName}
                              {!row.closerId ? (
                                <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                                  Agent
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className={`${tdClass} text-zinc-400`}>
                            {formatUserRef(row.agentId) || '—'}
                          </td>
                          <td className={tdClass}>
                            {formatPaymentSummary(row.payment)}
                          </td>
                          <td
                            className={`${tdClass} whitespace-nowrap text-zinc-400`}
                          >
                            {formatPkt(row.closedAt)}
                          </td>
                          <td className={tdClass}>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => openDetail(row)}
                                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60"
                              >
                                Details
                              </button>
                              <button
                                type="button"
                                disabled={
                                  moveMutation.isPending &&
                                  moveMutation.variables === row._id
                                }
                                onClick={() => {
                                  setActionError('');
                                  setActionMessage('');
                                  moveMutation.mutate(row._id);
                                }}
                                className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                              >
                                {moveMutation.isPending &&
                                moveMutation.variables === row._id
                                  ? 'Moving…'
                                  : 'Move to CST'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {handedOver.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
                  <table className="min-w-full text-sm text-zinc-200">
                    <thead className="border-b border-zinc-800 bg-zinc-950/40">
                      <tr>
                        <th className={thClass}>Business</th>
                        <th className={thClass}>Created By</th>
                        <th className={thClass}>Payment</th>
                        <th className={thClass}>Status</th>
                        <th className={thClass}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {handedOver.map((row) => (
                        <tr key={row._id} className={rowClass}>
                          <td className={`${tdClass} font-medium text-white`}>
                            {row.businessName}
                          </td>
                          <td className={`${tdClass} text-zinc-400`}>
                            {formatUserRef(row.agentId) || '—'}
                          </td>
                          <td className={tdClass}>
                            {formatPaymentSummary(row.payment)}
                          </td>
                          <td className={`${tdClass} text-zinc-400`}>
                            {formatCstStatus(row.handover?.cstStatus)}
                          </td>
                          <td className={tdClass}>
                            <button
                              type="button"
                              onClick={() => openDetail(row)}
                              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60"
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )
        ) : null}
      </section>

      <LeadDetailModal
        open={Boolean(detailLead)}
        lead={detailLead}
        onClose={() => setDetailLead(null)}
        canEdit={
          Boolean(detailLead) &&
          detailLead.stage === 'closed_sale' &&
          (!detailLead.handover?.cstStatus ||
            detailLead.handover.cstStatus === 'awaiting_handover')
        }
        onLeadUpdated={(updated) => setDetailLead(updated)}
        headerActions={
          detailLead?.stage === 'active' &&
          detailLead?.status === 'in_progress' ? (
            <button
              type="button"
              onClick={() => setScheduleLead(detailLead)}
              className="rounded-lg border border-sky-400/50 bg-sky-600/25 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-600/40"
            >
              Schedule Callback
            </button>
          ) : null
        }
        footer={
          detailLead ? (
            <>
              {detailLead.stage === 'active' &&
              detailLead.status === 'in_progress' ? (
                <button
                  type="button"
                  onClick={() => setScheduleLead(detailLead)}
                  className="rounded-xl border border-sky-500/40 bg-sky-600/15 px-4 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-600/25"
                >
                  Schedule Callback
                </button>
              ) : null}
              {detailLead.stage === 'closed_sale' &&
              (!detailLead.handover?.cstStatus ||
                detailLead.handover.cstStatus === 'awaiting_handover') ? (
                <button
                  type="button"
                  disabled={moveMutation.isPending}
                  onClick={() => {
                    setActionError('');
                    moveMutation.mutate(detailLead._id);
                  }}
                  className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                >
                  {moveMutation.isPending ? 'Moving…' : 'Move to CST'}
                </button>
              ) : null}
            </>
          ) : null
        }
      />

      <CloserScheduleCallbackModal
        open={Boolean(scheduleLead)}
        lead={scheduleLead}
        onClose={() => setScheduleLead(null)}
        onSuccess={() => {
          setActionMessage('Callback scheduled.');
          setScheduleLead(null);
        }}
      />
    </CloserShell>
  );
}
