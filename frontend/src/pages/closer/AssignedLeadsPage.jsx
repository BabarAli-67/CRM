import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import LeadDetailModal from '../../components/leads/LeadDetailModal.jsx';
import LeadTable from '../../components/leads/LeadTable.jsx';
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

export default function AssignedLeadsPage() {
  const queryClient = useQueryClient();
  const [detailLead, setDetailLead] = useState(null);
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
    refetchInterval: 15_000,
  });

  const {
    data: leads = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['assignedLeads'],
    queryFn: getAssignedLeads,
    refetchInterval: 30_000,
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

  const awaitingHandover = closedSales.filter(
    (l) =>
      !l.handover?.cstStatus ||
      l.handover.cstStatus === 'awaiting_handover'
  );
  const handedOver = closedSales.filter((l) =>
    ['pending_review', 'assigned', 'in_progress', 'completed'].includes(
      l.handover?.cstStatus
    )
  );

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

      <section className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold text-white">
            Closer Pool
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Unclaimed leads from sales agents · claim one to work it exclusively
          </p>
        </div>

        {poolLoading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : poolError ? (
          <p className="py-8 text-center text-sm text-red-400">
            {poolErr?.response?.data?.message || 'Failed to load closer pool.'}
          </p>
        ) : (
          <LeadTable
            leads={pool}
            listQueryKey={['closerPool']}
            mode="pool"
            showCreatedBy
            onViewDetails={openDetail}
            emptyMessage="No leads waiting in the closer pool."
          />
        )}
      </section>

      <section className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold text-white">
            My claimed leads
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            In Progress · close with payment · then Move to CST for fulfillment
          </p>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load assigned leads.'}
          </p>
        ) : (
          <LeadTable
            leads={leads}
            listQueryKey={['assignedLeads']}
            showCreatedBy
            onViewDetails={openDetail}
            emptyMessage="No claimed leads yet. Claim one from the pool above."
          />
        )}
      </section>

      <section className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold text-white">
            Closed sales · Move to CST
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Review agent notes &amp; payment, then hand over to CST for order
            processing
          </p>
        </div>

        {closedLoading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : closedError ? (
          <p className="py-8 text-center text-sm text-red-400">
            {closedErr?.response?.data?.message ||
              'Failed to load closed sales.'}
          </p>
        ) : awaitingHandover.length === 0 && handedOver.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            No closed sales yet.
          </p>
        ) : (
          <div className="space-y-6">
            {awaitingHandover.length > 0 ? (
              <div className="overflow-x-auto">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-400/90">
                  Awaiting CST handover ({awaitingHandover.length})
                </p>
                <table className="min-w-full text-left text-sm text-zinc-200">
                  <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Business</th>
                      <th className="px-3 py-2.5 font-medium">Created By</th>
                      <th className="px-3 py-2.5 font-medium">Payment</th>
                      <th className="px-3 py-2.5 font-medium">Closed</th>
                      <th className="px-3 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awaitingHandover.map((row) => (
                      <tr
                        key={row._id}
                        className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30"
                      >
                        <td className="px-3 py-2.5 font-medium">
                          {row.businessName}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400">
                          {formatUserRef(row.agentId) || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {formatPaymentSummary(row.payment)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-zinc-400">
                          {formatPkt(row.closedAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openDetail(row)}
                              className="rounded-full border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
                            >
                              View details
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
                              className="rounded-full bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
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
              <div className="overflow-x-auto">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-400/90">
                  Handed over to CST ({handedOver.length})
                </p>
                <table className="min-w-full text-left text-sm text-zinc-200">
                  <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Business</th>
                      <th className="px-3 py-2.5 font-medium">Created By</th>
                      <th className="px-3 py-2.5 font-medium">Payment</th>
                      <th className="px-3 py-2.5 font-medium">CST status</th>
                      <th className="px-3 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {handedOver.map((row) => (
                      <tr
                        key={row._id}
                        className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30"
                      >
                        <td className="px-3 py-2.5 font-medium">
                          {row.businessName}
                        </td>
                        <td className="px-3 py-2.5 text-zinc-400">
                          {formatUserRef(row.agentId) || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          {formatPaymentSummary(row.payment)}
                        </td>
                        <td className="px-3 py-2.5">
                          {formatCstStatus(row.handover?.cstStatus)}
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => openDetail(row)}
                            className="rounded-full border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )}
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
        footer={
          detailLead &&
          detailLead.stage === 'closed_sale' &&
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
          ) : null
        }
      />
    </CloserShell>
  );
}
