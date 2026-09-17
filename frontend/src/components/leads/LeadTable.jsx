import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import CloseSaleModal from './CloseSaleModal.jsx';
import DisqualifyModal from './DisqualifyModal.jsx';

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

/**
 * Active-leads table with close / disqualify actions.
 * Expects backend lists that already exclude closed_sale / disqualified.
 */
export default function LeadTable({
  leads = [],
  listQueryKey,
  showEdit = false,
  emptyMessage = 'No active leads.',
}) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [closeTarget, setCloseTarget] = useState(null);
  const [disqualifyTarget, setDisqualifyTarget] = useState(null);

  const rows = useMemo(
    () =>
      [...leads]
        .filter((l) => l.stage !== 'closed_sale')
        .sort(
          (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
        ),
    [leads]
  );

  const invalidate = () => {
    if (listQueryKey) {
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    }
    queryClient.invalidateQueries({ queryKey: ['myLeads'] });
    queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
  };

  return (
    <div className="space-y-3">
      {actionError ? (
        <p role="alert" className="text-sm text-red-300">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="text-sm text-emerald-300">{actionMessage}</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink/60">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-ink">
            <thead className="border-b border-white/10 text-ink/70">
              <tr>
                <th className="px-3 py-2 font-medium">Business</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Follow-up (PKT)</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const followAt = row.followUp?.callbackAt;
                const at = followAt ? new Date(followAt).getTime() : NaN;
                const overdue = !Number.isNaN(at) && at < Date.now();

                return (
                  <tr
                    key={row._id}
                    data-reminder-row={`followup-${row._id}`}
                    className={[
                      'border-b border-white/5 last:border-0 transition',
                      overdue ? 'bg-flash-primary/10' : '',
                    ].join(' ')}
                  >
                    <td className="px-3 py-2.5 font-medium">
                      {row.businessName}
                      {overdue ? (
                        <span className="ml-2 inline-flex rounded-md bg-flash-primary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-flash-secondary">
                          Follow-up overdue
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">{row.clientName || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.phone}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {formatPkt(followAt)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.salesAmount != null && row.salesAmount !== ''
                        ? row.salesAmount
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        {showEdit ? (
                          <Link
                            to={`/dashboard/sales-agent/leads/${row._id}/edit`}
                            className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-ink/80 hover:bg-white/5"
                          >
                            Edit
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setActionError('');
                            setActionMessage('');
                            setCloseTarget(row);
                          }}
                          className="rounded-md bg-emerald-600/90 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          Move to Closed Sale
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionError('');
                            setActionMessage('');
                            setDisqualifyTarget(row);
                          }}
                          className="rounded-md border border-red-400/40 px-2.5 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/10"
                        >
                          Mark Disqualified
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CloseSaleModal
        open={Boolean(closeTarget)}
        lead={closeTarget}
        onClose={() => setCloseTarget(null)}
        onSuccess={() => {
          setActionError('');
          setActionMessage('');
        }}
      />

      <DisqualifyModal
        open={Boolean(disqualifyTarget)}
        lead={disqualifyTarget}
        onClose={() => setDisqualifyTarget(null)}
        onSuccess={() => {
          setActionError('');
          setActionMessage('Lead marked disqualified.');
          invalidate();
        }}
      />
    </div>
  );
}
