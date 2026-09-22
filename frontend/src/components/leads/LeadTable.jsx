import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import CloseSaleModal from './CloseSaleModal.jsx';
import DisqualifyModal from './DisqualifyModal.jsx';
import ScheduleCallbackModal from './ScheduleCallbackModal.jsx';
import { claimLead } from '../../services/lead.service.js';
import { formatUserRef } from '../../utils/formatUserRef.util.js';

const STATUS_LABEL = {
  with_agent: 'With Agent',
  pending_closer_claim: 'Pending Closer Claim',
  in_progress: 'In Progress',
};

const STATUS_BADGE = {
  with_agent: 'bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30',
  pending_closer_claim:
    'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  in_progress: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
};

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
 * Active-leads table with close / disqualify / claim actions.
 * Expects backend lists that already exclude closed_sale / disqualified.
 *
 * @param {'default'|'pool'} [mode]
 */
export default function LeadTable({
  leads = [],
  listQueryKey,
  showEdit = false,
  showCreatedBy = false,
  onViewDetails = null,
  mode = 'default',
  emptyMessage = 'No active leads.',
}) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [closeTarget, setCloseTarget] = useState(null);
  const [disqualifyTarget, setDisqualifyTarget] = useState(null);
  const [callbackTarget, setCallbackTarget] = useState(null);

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
    queryClient.invalidateQueries({ queryKey: ['closerPool'] });
    queryClient.invalidateQueries({ queryKey: ['allLeads'] });
    queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
    queryClient.invalidateQueries({ queryKey: ['closerClosedSales'] });
  };

  const claimMutation = useMutation({
    mutationFn: (id) => claimLead(id),
    onSuccess: () => {
      setActionError('');
      setActionMessage('Lead claimed — it is now In Progress on your list.');
      invalidate();
    },
    onError: (err) => {
      setActionMessage('');
      setActionError(
        err?.response?.data?.message || 'Failed to claim lead.'
      );
    },
  });

  const isPool = mode === 'pool';
  const showCreator = showCreatedBy || isPool;

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
        <p className="py-10 text-center text-sm text-zinc-500">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-zinc-200">
            <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Business</th>
                <th className="px-3 py-2.5 font-medium">Phone</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                {showCreator ? (
                  <th className="px-3 py-2.5 font-medium">Created By</th>
                ) : null}
                {!isPool ? (
                  <th className="px-3 py-2.5 font-medium">Follow-up (PKT)</th>
                ) : null}
                <th className="px-3 py-2.5 font-medium">Notes</th>
                <th className="px-3 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const followAt = row.followUp?.callbackAt;
                const at = followAt ? new Date(followAt).getTime() : NaN;
                const overdue = !Number.isNaN(at) && at < Date.now();
                const statusKey = row.status || 'with_agent';
                const statusClass =
                  STATUS_BADGE[statusKey] || STATUS_BADGE.with_agent;
                const claiming =
                  claimMutation.isPending &&
                  claimMutation.variables === row._id;

                return (
                  <tr
                    key={row._id}
                    data-reminder-row={`followup-${row._id}`}
                    className={[
                      'border-b border-zinc-800/60 last:border-0 transition-colors hover:bg-zinc-800/30',
                      overdue && !isPool ? 'bg-orange-600/10' : '',
                    ].join(' ')}
                  >
                    <td className="px-3 py-2.5 font-medium">
                      {row.businessName}
                      {overdue && !isPool ? (
                        <span className="ml-2 inline-flex rounded-full border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                          Follow-up overdue
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {row.phone}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}
                      >
                        {STATUS_LABEL[statusKey] || statusKey}
                      </span>
                    </td>
                    {showCreator ? (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {formatUserRef(row.agentId) ? (
                          <span className="inline-flex max-w-[14rem] flex-col gap-0.5">
                            <span className="truncate font-medium text-zinc-200">
                              {row.agentId?.fullName ||
                                row.agentId?.username ||
                                '—'}
                            </span>
                            {row.agentId?.fullName && row.agentId?.username ? (
                              <span className="truncate text-xs text-zinc-500">
                                @{row.agentId.username}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>
                    ) : null}
                    {!isPool ? (
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {formatPkt(followAt)}
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5 max-w-xs">
                      <p className="line-clamp-2 text-zinc-400">
                        {row.notes || '—'}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        {isPool ? (
                          <button
                            type="button"
                            disabled={claiming}
                            onClick={() => {
                              setActionError('');
                              setActionMessage('');
                              claimMutation.mutate(row._id);
                            }}
                            className="cursor-pointer rounded-full bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                          >
                            {claiming ? 'Claiming…' : 'Claim Lead'}
                          </button>
                        ) : (
                          <>
                            {onViewDetails ? (
                              <button
                                type="button"
                                onClick={() => onViewDetails(row)}
                                className="cursor-pointer rounded-full border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
                              >
                                View details
                              </button>
                            ) : null}
                            {showEdit ? (
                              <>
                                <Link
                                  to={`/dashboard/sales-agent/leads/${row._id}/edit`}
                                  className="cursor-pointer rounded-full border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
                                >
                                  Edit
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionError('');
                                    setActionMessage('');
                                    setCallbackTarget(row);
                                  }}
                                  className="cursor-pointer rounded-full border border-sky-500/40 bg-sky-600/15 px-2.5 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-600/25"
                                >
                                  Schedule Callback
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                setActionError('');
                                setActionMessage('');
                                setCloseTarget(row);
                              }}
                              className="cursor-pointer rounded-full bg-emerald-600/90 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
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
                              className="cursor-pointer rounded-full border border-red-500/30 px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10"
                            >
                              Mark Disqualified
                            </button>
                          </>
                        )}
                        {isPool && onViewDetails ? (
                          <button
                            type="button"
                            onClick={() => onViewDetails(row)}
                            className="cursor-pointer rounded-full border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800/50"
                          >
                            View details
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ScheduleCallbackModal
        open={Boolean(callbackTarget)}
        lead={callbackTarget}
        onClose={() => setCallbackTarget(null)}
        onSuccess={() => {
          setActionError('');
          setActionMessage('Callback scheduled — follow-up updated.');
          invalidate();
        }}
      />

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
