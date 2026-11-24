import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import HorizontalScrollArea from '../HorizontalScrollArea.component.jsx';
import CloseSaleModal from './CloseSaleModal.jsx';
import DisqualifyModal from './DisqualifyModal.jsx';
import CloserScheduleCallbackModal from '../callbacks/CloserScheduleCallbackModal.jsx';
import CloserTableFilterBar, {
  pktDateKey,
} from '../closer/CloserTableFilterBar.jsx';
import useAuth from '../../hooks/useAuth.hook.js';
import { handLeadToCloser } from '../../services/lead.service.js';
import { formatUserRef } from '../../utils/formatUserRef.util.js';

const STATUS_LABEL = {
  with_agent: 'In Progress',
  with_closer: 'With Closer',
  pending_closer_claim: 'With Closer',
  in_progress: 'With Closer',
};

const STATUS_BADGE = {
  with_agent: 'bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30',
  with_closer: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  pending_closer_claim: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
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
 * Active-leads table with close / disqualify / handoff actions.
 * Expects backend lists that already exclude closed_sale / disqualified.
 */
export default function LeadTable({
  leads = [],
  listQueryKey,
  showEdit = false,
  showCreatedBy = false,
  showCloserSchedule = false,
  onViewDetails = null,
  emptyMessage = 'No active leads.',
}) {
  const { user } = useAuth();
  const isCloser = user?.role === 'closer';
  const closerView = isCloser && !showEdit;
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [closeTarget, setCloseTarget] = useState(null);
  const [disqualifyTarget, setDisqualifyTarget] = useState(null);
  const [closerCallbackTarget, setCloserCallbackTarget] = useState(null);
  const [businessNameFilter, setBusinessNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const rows = useMemo(() => {
    const leadSortMs = (lead) => {
      if (closerView) {
        // Closer Leads: newest created / assigned first
        return Math.max(
          new Date(lead.createdAt || 0).getTime() || 0,
          new Date(
            lead.handedOverAt ||
              lead.handedToCloserAt ||
              lead.escalatedAt ||
              0
          ).getTime() || 0
        );
      }
      return new Date(lead.updatedAt || 0).getTime() || 0;
    };

    const base = [...leads]
      .filter((l) => l.stage !== 'closed_sale' && l.stage !== 'disqualified')
      .sort((a, b) => leadSortMs(b) - leadSortMs(a));

    if (!closerView) return base;

    const nameQ = businessNameFilter.trim().toLowerCase();
    const emailQ = emailFilter.trim().toLowerCase();
    const dateQ = dateFilter.trim();
    if (!nameQ && !emailQ && !dateQ) return base;

    return base.filter((lead) => {
      if (nameQ) {
        const name = String(lead.businessName || '').toLowerCase();
        if (!name.includes(nameQ)) return false;
      }
      if (emailQ) {
        const personal = String(lead.personalEmail || '').toLowerCase();
        const business = String(lead.businessEmail || '').toLowerCase();
        if (!personal.includes(emailQ) && !business.includes(emailQ)) {
          return false;
        }
      }
      if (dateQ) {
        const createdKey = pktDateKey(lead.createdAt);
        const handedKey = pktDateKey(
          lead.handedOverAt || lead.handedToCloserAt || lead.escalatedAt
        );
        if (createdKey !== dateQ && handedKey !== dateQ) return false;
      }
      return true;
    });
  }, [leads, closerView, businessNameFilter, emailFilter, dateFilter]);

  const hasCloserFilters =
    closerView &&
    (businessNameFilter.trim() !== '' ||
      emailFilter.trim() !== '' ||
      dateFilter.trim() !== '');

  const clearCloserFilters = () => {
    setBusinessNameFilter('');
    setEmailFilter('');
    setDateFilter('');
  };

  const invalidate = () => {
    if (listQueryKey) {
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    }
    queryClient.invalidateQueries({ queryKey: ['myLeads'] });
    queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
    queryClient.invalidateQueries({ queryKey: ['allLeads'] });
    queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
    queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
    queryClient.invalidateQueries({ queryKey: ['closerClosedSales'] });
    queryClient.invalidateQueries({ queryKey: ['agentClosedSales'] });
    queryClient.invalidateQueries({ queryKey: ['closerDisqualified'] });
    queryClient.invalidateQueries({ queryKey: ['closerTeamAgents'] });
  };

  const handOffMutation = useMutation({
    mutationFn: (id) => handLeadToCloser(id),
    onSuccess: (_lead, id) => {
      setActionError('');
      setActionMessage('Lead handed to closer (Forced Moved).');
      // Drop from agent list immediately
      queryClient.setQueryData(['myLeads'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((l) => String(l._id) !== String(id));
      });
      invalidate();
    },
    onError: (err) => {
      setActionMessage('');
      setActionError(
        err?.response?.data?.message || 'Failed to hand lead to closer.'
      );
    },
  });

  const showCreator = showCreatedBy;
  const handingId = handOffMutation.isPending
    ? handOffMutation.variables
    : null;

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

      {closerView ? (
        <CloserTableFilterBar
          businessName={businessNameFilter}
          onBusinessNameChange={setBusinessNameFilter}
          email={emailFilter}
          onEmailChange={setEmailFilter}
          date={dateFilter}
          onDateChange={setDateFilter}
          onClear={clearCloserFilters}
          dateLabel="Date"
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          {closerView && hasCloserFilters
            ? 'No leads match these filters.'
            : emptyMessage}
        </p>
      ) : (
        <HorizontalScrollArea className="rounded-xl border border-zinc-800/60">
          <table className="min-w-full text-left text-sm text-zinc-200">
            <thead className="border-b border-zinc-800 bg-zinc-950/40 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3.5 font-medium whitespace-nowrap">
                  {closerView ? 'Business Name' : 'Business'}
                </th>
                {closerView ? (
                  <>
                    <th className="px-4 py-3.5 font-medium whitespace-nowrap">
                      Personal Phone
                    </th>
                    <th className="px-4 py-3.5 font-medium whitespace-nowrap">
                      Business Phone
                    </th>
                  </>
                ) : (
                  <th className="px-4 py-3.5 font-medium">Phone</th>
                )}
                {!closerView ? (
                  <th className="px-4 py-3.5 font-medium">Status</th>
                ) : null}
                {showCreator ? (
                  <th className="px-4 py-3.5 font-medium">Created By</th>
                ) : null}
                {closerView ? (
                  <>
                    <th className="px-4 py-3.5 font-medium">Personal Email</th>
                    <th className="px-4 py-3.5 font-medium">Business Email</th>
                  </>
                ) : null}
                <th className="px-4 py-3.5 font-medium">Follow-up (PKT)</th>
                <th
                  className={[
                    'px-4 py-3.5 font-medium whitespace-nowrap',
                    closerView ? 'min-w-[22rem]' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const followAt = row.followUp?.callbackAt;
                const at = followAt ? new Date(followAt).getTime() : NaN;
                const acknowledged = Boolean(row.followUp?.acknowledged);
                const overdue =
                  !acknowledged && !Number.isNaN(at) && at < Date.now();
                const statusKey = row.status || 'with_agent';
                const statusClass =
                  STATUS_BADGE[statusKey] || STATUS_BADGE.with_agent;
                const autoMoved =
                  row.escalationType === 'auto' ||
                  row.escalatedReason === 'Auto Moved' ||
                  row.escalatedReason === '48h_unclosed_timeout' ||
                  row.escalatedReason === '24h_unclosed_timeout';
                const forcedMoved =
                  row.escalationType === 'forced' ||
                  row.escalationType === 'manual' ||
                  row.escalatedReason === 'Forced Moved' ||
                  row.escalatedReason === 'agent_handoff';

                return (
                  <tr
                    key={row._id}
                    data-reminder-row={`followup-${row._id}`}
                    className={[
                      'border-b border-zinc-800/50 last:border-0 transition-colors hover:bg-zinc-800/25',
                      overdue ? 'bg-orange-600/10' : '',
                    ].join(' ')}
                  >
                    <td className="px-4 py-3.5 font-medium text-white">
                      {closerView ? (
                        <div className="flex flex-col gap-1.5">
                          <span>{row.businessName || '—'}</span>
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            {overdue ? (
                              <span className="inline-flex rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                                Overdue
                              </span>
                            ) : null}
                            {autoMoved ? (
                              <span className="inline-flex rounded border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                                Auto Moved
                              </span>
                            ) : null}
                            {forcedMoved && !autoMoved ? (
                              <span className="inline-flex rounded border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400">
                                Forced Moved
                              </span>
                            ) : null}
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {onViewDetails ? (
                            <button
                              type="button"
                              onClick={() => onViewDetails(row)}
                              className="cursor-pointer text-left font-medium text-white transition-colors hover:text-orange-400 hover:underline"
                            >
                              {row.businessName}
                            </button>
                          ) : (
                            row.businessName
                          )}
                          {overdue ? (
                            <span className="inline-flex rounded-md bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-400">
                              Overdue
                            </span>
                          ) : null}
                        </span>
                      )}
                    </td>
                    {closerView ? (
                      <>
                        <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                          {row.personalPhone || '—'}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                          {row.businessPhone || '—'}
                        </td>
                      </>
                    ) : (
                      <td className="px-4 py-3.5 whitespace-nowrap text-zinc-300">
                        {row.businessPhone || row.personalPhone || '—'}
                      </td>
                    )}
                    {!closerView ? (
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}
                        >
                          {STATUS_LABEL[statusKey] || statusKey}
                        </span>
                      </td>
                    ) : null}
                    {showCreator ? (
                      <td className="px-4 py-3.5 whitespace-nowrap">
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
                    {closerView ? (
                      <>
                        <td className="px-4 py-3.5 whitespace-nowrap text-zinc-400">
                          {row.personalEmail || '—'}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-zinc-400">
                          {row.businessEmail || '—'}
                        </td>
                      </>
                    ) : null}
                    <td className="px-4 py-3.5 whitespace-nowrap text-zinc-400">
                      {formatPkt(followAt)}
                    </td>
                    <td
                      className={[
                        'px-4 py-3.5 whitespace-nowrap',
                        closerView ? 'min-w-[22rem]' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div
                        className={[
                          'flex items-center justify-end gap-1.5',
                          closerView ? 'flex-nowrap' : 'flex-wrap sm:flex-nowrap',
                        ].join(' ')}
                      >
                        {closerView && onViewDetails ? (
                          <button
                            type="button"
                            onClick={() => onViewDetails(row)}
                            className="cursor-pointer whitespace-nowrap rounded-md border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                          >
                            Details
                          </button>
                        ) : null}
                        {onViewDetails && !showEdit && !closerView ? (
                          <button
                            type="button"
                            onClick={() => onViewDetails(row)}
                            className="cursor-pointer rounded-md border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                          >
                            Details
                          </button>
                        ) : null}
                        {showCloserSchedule ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActionError('');
                              setActionMessage('');
                              setCloserCallbackTarget(row);
                            }}
                            className="cursor-pointer whitespace-nowrap rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-400 hover:bg-sky-500/20"
                          >
                            Schedule Callback
                          </button>
                        ) : null}
                        {showEdit ? (
                          <>
                            <Link
                              to={`/dashboard/sales-agent/leads/${row._id}/edit`}
                              className="cursor-pointer rounded-md border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                            >
                              Edit
                            </Link>
                            {statusKey === 'with_agent' ? (
                              <button
                                type="button"
                                disabled={handingId === row._id || !row.closerId}
                                title={
                                  !row.closerId
                                    ? 'Assign a closer on Edit before handing off'
                                    : 'Hand this lead to the assigned closer now'
                                }
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Hand "${row.businessName}" to the assigned closer now?`
                                    )
                                  ) {
                                    return;
                                  }
                                  setActionError('');
                                  setActionMessage('');
                                  handOffMutation.mutate(row._id);
                                }}
                                className="cursor-pointer rounded-md border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/20 disabled:opacity-60"
                              >
                                {handingId === row._id
                                  ? 'Sending…'
                                  : 'Hand to Closer'}
                              </button>
                            ) : null}
                          </>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setActionError('');
                            setActionMessage('');
                            setCloseTarget(row);
                          }}
                          className="cursor-pointer whitespace-nowrap rounded-md bg-flash-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-[#ff6a36]"
                        >
                          Close Sale
                        </button>
                        {isCloser ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActionError('');
                              setActionMessage('');
                              setDisqualifyTarget(row);
                            }}
                            className="cursor-pointer whitespace-nowrap rounded-md border border-red-500/20 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10"
                          >
                            Disqualify
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </HorizontalScrollArea>
      )}

      <CloserScheduleCallbackModal
        open={Boolean(closerCallbackTarget)}
        lead={closerCallbackTarget}
        onClose={() => setCloserCallbackTarget(null)}
        onSuccess={() => {
          setActionError('');
          setActionMessage('Callback scheduled.');
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
