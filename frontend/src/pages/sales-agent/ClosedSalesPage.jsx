import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import LeadDetailModal from '../../components/leads/LeadDetailModal.jsx';
import SalesAgentShell from '../../components/sales-agent/SalesAgentShell.jsx';
import { getMyClosedSales } from '../../services/lead.service.js';
import { formatUserRef } from '../../utils/formatUserRef.util.js';
import {
  formatCstStatus,
  formatPaymentSummary,
} from '../../utils/formatPayment.util.js';

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

/**
 * Sales agent closed-sales history — leads that left the active desk.
 */
export default function ClosedSalesPage() {
  const [detailLead, setDetailLead] = useState(null);

  const {
    data: leads = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['agentClosedSales'],
    queryFn: getMyClosedSales,
    refetchInterval: 30_000,
  });

  return (
    <SalesAgentShell title="Closed Sales">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            Closed sales history
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Your closed deals · payment summary · CST / fulfillment status
          </p>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load closed sales.'}
          </p>
        ) : leads.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No closed sales yet. Close a lead from My Leads to see it here.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
            <table className="min-w-full text-left text-sm text-zinc-200">
              <thead className="border-b border-zinc-800 bg-zinc-950/40 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3.5 font-medium">Business</th>
                  <th className="px-4 py-3.5 font-medium">Payment</th>
                  <th className="px-4 py-3.5 font-medium">Closed (PKT)</th>
                  <th className="px-4 py-3.5 font-medium">Closer</th>
                  <th className="px-4 py-3.5 font-medium">CST / Tech</th>
                  <th className="px-4 py-3.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((row) => (
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
                      {formatPaymentSummary(row.payment)}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-zinc-400">
                      {formatPkt(row.closedAt)}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-400">
                      {formatUserRef(row.closerId) || '—'}
                    </td>
                    <td className="px-4 py-3.5 text-zinc-400">
                      {formatCstStatus(row.handover?.cstStatus)}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <LeadDetailModal
        open={Boolean(detailLead)}
        lead={detailLead}
        onClose={() => setDetailLead(null)}
      />
    </SalesAgentShell>
  );
}
