import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AssignTechModal from '../../components/handover/AssignTechModal.jsx';
import CstManagerShell from '../../components/cst-manager/CstManagerShell.jsx';
import { getHandoverQueue } from '../../services/handover.service.js';

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
  if (!payment?.method) return '—';

  if (payment.method === 'via_link') {
    return payment.linkUrl ? `Link · ${payment.linkUrl}` : 'Via link';
  }

  if (payment.method === 'via_card') {
    const brand = payment.cardBrand || 'Card';
    const last4 = payment.cardLast4 ? `•••• ${payment.cardLast4}` : '••••';
    return `${brand} · ${last4}`;
  }

  return payment.method;
}

function ExternalLink({ href, label }) {
  if (!href) {
    return <span className="text-ink/40">—</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-flash-secondary hover:underline"
    >
      {label}
    </a>
  );
}

export default function HandoverQueuePage() {
  const queryClient = useQueryClient();
  const [assignTarget, setAssignTarget] = useState(null);
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
      <section className="w-full rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold text-ink">
            Pending review
          </h2>
          <p className="mt-1 text-sm text-ink/70">
            Closed sales awaiting tech assignment · payment token never shown
          </p>
        </div>

        {message ? (
          <p className="mb-3 text-sm text-emerald-300">{message}</p>
        ) : null}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-ink/60">Loading…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-300">
            {error?.response?.data?.message || 'Failed to load handover queue.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink/60">
            No leads pending review.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-ink">
              <thead className="border-b border-white/10 text-ink/70">
                <tr>
                  <th className="px-3 py-2 font-medium">Business</th>
                  <th className="px-3 py-2 font-medium">Technical links</th>
                  <th className="px-3 py-2 font-medium">Payment</th>
                  <th className="px-3 py-2 font-medium">Closed (PKT)</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row._id}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="px-3 py-2.5 font-medium">
                      {row.businessName}
                      {row.clientName ? (
                        <span className="mt-0.5 block text-xs font-normal text-ink/55">
                          {row.clientName}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <ExternalLink href={row.yelpLink} label="Yelp" />
                        <ExternalLink href={row.websiteLink} label="Website" />
                        <ExternalLink href={row.gmbLink} label="GMB" />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[14rem] truncate text-ink/85">
                      {paymentSummary(row.payment)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {formatPkt(row.closedAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setMessage('');
                          setAssignTarget(row);
                        }}
                        className="rounded-md bg-flash-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-flash-secondary"
                      >
                        Assign to Tech
                      </button>
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
    </CstManagerShell>
  );
}
