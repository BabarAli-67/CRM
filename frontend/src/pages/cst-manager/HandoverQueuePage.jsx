import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AssignTechModal from '../../components/handover/AssignTechModal.jsx';
import LeadDetailModal from '../../components/leads/LeadDetailModal.jsx';
import CstManagerShell from '../../components/cst-manager/CstManagerShell.jsx';
import { getHandoverQueue } from '../../services/handover.service.js';
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

/** Payment summary for CST — never render cardReferenceToken. */
function paymentSummary(payment) {
  return formatPaymentSummary(payment);
}

export default function HandoverQueuePage() {
  const queryClient = useQueryClient();
  const [assignTarget, setAssignTarget] = useState(null);
  const [detailLead, setDetailLead] = useState(null);
  const [message, setMessage] = useState('');

  const {
    data: leads = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['handoverQueue'],
    queryFn: getHandoverQueue,
    refetchInterval: 30_000,
  });

  // Backend already filters pending_review; keep client view aligned
  const rows = leads.filter(
    (l) => l.handover?.cstStatus === 'pending_review'
  );

  return (
    <CstManagerShell title="Handover Queue">
      <section className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold text-white">
            Pending review
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Closed sales awaiting tech assignment · payment token never shown
          </p>
        </div>

        {message ? (
          <p className="mb-3 text-sm text-emerald-400">{message}</p>
        ) : null}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load handover queue.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            No leads pending review.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-zinc-200">
              <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Business</th>
                  <th className="px-3 py-2.5 font-medium">Created By</th>
                  <th className="px-3 py-2.5 font-medium">Payment</th>
                  <th className="px-3 py-2.5 font-medium">Closed (PKT)</th>
                  <th className="px-3 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row._id}
                    className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="px-3 py-3 font-medium text-white">
                      {row.businessName}
                    </td>
                    <td className="px-3 py-3 text-zinc-400">
                      {formatUserRef(row.agentId) || '—'}
                    </td>
                    <td className="px-3 py-3 max-w-[14rem] truncate text-zinc-300">
                      {paymentSummary(row.payment)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatPkt(row.closedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailLead(row)}
                          className="cursor-pointer rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMessage('');
                            setAssignTarget(row);
                          }}
                          className="cursor-pointer rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-orange-600/20 hover:bg-orange-500"
                        >
                          Assign to Tech
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AssignTechModal
        open={Boolean(assignTarget)}
        lead={assignTarget}
        onClose={() => setAssignTarget(null)}
        onSuccess={(updated) => {
          setMessage(
            updated?.businessName
              ? `Assigned “${updated.businessName}” to tech.`
              : 'Assigned to tech.'
          );
          // Refetch so the row leaves pending_review view immediately
          queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
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
