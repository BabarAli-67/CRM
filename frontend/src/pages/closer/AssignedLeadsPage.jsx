import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import LeadDetailModal from '../../components/leads/LeadDetailModal.jsx';
import LeadTable from '../../components/leads/LeadTable.jsx';
import MoveToCstModal from '../../components/leads/MoveToCstModal.jsx';
import CloserScheduleCallbackModal from '../../components/callbacks/CloserScheduleCallbackModal.jsx';
import CloserShell from '../../components/closer/CloserShell.jsx';
import { getCloserTeamAgentCallbacks } from '../../services/callback.service.js';
import {
  deleteLeadPermanently,
  getAssignedLeads,
  getCloserClosedSales,
  getCloserDisqualifiedLeads,
  getCloserTeamAgents,
  getLeadById,
  moveLeadToCst,
} from '../../services/lead.service.js';
import { formatUserRef } from '../../utils/formatUserRef.util.js';
import {
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

const formatPktFull = (value) => {
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

const isCloserActiveLead = (lead) =>
  lead?.stage === 'active' &&
  (lead.status === 'with_closer' || lead.status === 'in_progress');

const isAwaitingCstHandover = (lead) =>
  !lead?.handover?.cstStatus || lead.handover.cstStatus === 'awaiting_handover';

const TABS = [
  { id: 'leads', label: 'Leads' },
  { id: 'closed', label: 'Closed Sales' },
  { id: 'disqualified', label: 'Disqualified Leads' },
  { id: 'team', label: 'My Team' },
];

const thClass =
  'px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500';
const tdClass = 'px-4 py-3.5 align-middle';
const rowClass =
  'border-b border-zinc-800/50 last:border-0 transition-colors hover:bg-zinc-800/25';

export default function AssignedLeadsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('leads');
  const [detailLead, setDetailLead] = useState(null);
  const [scheduleLead, setScheduleLead] = useState(null);
  const [moveToCstLead, setMoveToCstLead] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [toast, setToast] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState(null);

  const {
    data: leads = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['assignedLeads'],
    queryFn: getAssignedLeads,
    refetchInterval: 15_000,
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

  const {
    data: disqualifiedLeads = [],
    isLoading: dqLoading,
    isError: dqError,
    error: dqErr,
  } = useQuery({
    queryKey: ['closerDisqualified'],
    queryFn: getCloserDisqualifiedLeads,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  const {
    data: teamAgents = [],
    isLoading: teamLoading,
    isError: teamError,
    error: teamErr,
  } = useQuery({
    queryKey: ['closerTeamAgents'],
    queryFn: getCloserTeamAgents,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (tab !== 'team') return;
    if (!teamAgents.length) {
      setSelectedAgentId(null);
      return;
    }
    const stillValid = teamAgents.some(
      (a) => String(a._id) === String(selectedAgentId)
    );
    if (!stillValid) {
      setSelectedAgentId(String(teamAgents[0]._id));
    }
  }, [tab, teamAgents, selectedAgentId]);

  const {
    data: teamCallbacks = [],
    isLoading: teamCbLoading,
    isError: teamCbError,
    error: teamCbErr,
  } = useQuery({
    queryKey: ['closerTeamCallbacks', selectedAgentId],
    queryFn: () => getCloserTeamAgentCallbacks(selectedAgentId),
    enabled: tab === 'team' && Boolean(selectedAgentId),
    refetchInterval: 30_000,
  });

  const openDetail = async (row) => {
    setActionError('');
    setDetailLoading(true);
    try {
      const id = row?._id || row?.id;
      if (!id) {
        throw new Error('Missing lead id');
      }
      const full = await getLeadById(id);
      if (!full) {
        throw new Error('Lead details were empty');
      }
      setDetailLead(full);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load lead details.';
      setActionError(msg);
      // Still open with list row so the user isn't blocked; full refetch may
      // succeed after permission/API fixes on retry via Edit/refresh.
      if (row?._id) {
        setDetailLead(row);
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const moveMutation = useMutation({
    mutationFn: ({ id, formData }) => moveLeadToCst(id, formData),
    onSuccess: (_data, variables) => {
      const id = variables.id;
      setActionMessage('Successfully handed over to CST');
      setToast(true);
      setMoveToCstLead(null);
      setDetailLead((prev) =>
        prev && String(prev._id) === String(id) ? null : prev
      );
      queryClient.setQueryData(['closerClosedSales'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((l) => String(l._id) !== String(id));
      });
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

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(false), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteLeadPermanently(id),
    onSuccess: (_data, id) => {
      setActionMessage('Lead permanently deleted.');
      queryClient.setQueryData(['closerDisqualified'], (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((l) => String(l._id) !== String(id));
      });
      queryClient.invalidateQueries({ queryKey: ['closerDisqualified'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
      queryClient.invalidateQueries({ queryKey: ['allLeads'] });
    },
    onError: (err) => {
      setActionError(
        err?.response?.data?.message || 'Failed to delete lead permanently.'
      );
    },
  });

  // Closed Sales tab: only sales still awaiting CST handoff
  const awaitingHandover = useMemo(
    () =>
      [...closedSales.filter(isAwaitingCstHandover)].sort(
        (a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0)
      ),
    [closedSales]
  );

  const tabCount = (id) => {
    if (id === 'leads') return leads.length;
    if (id === 'closed') return awaitingHandover.length;
    if (id === 'disqualified') return disqualifiedLeads.length;
    if (id === 'team') return teamAgents.length;
    return 0;
  };

  const selectedAgent = teamAgents.find(
    (a) => String(a._id) === String(selectedAgentId)
  );

  return (
    <CloserShell title="Leads">
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 right-6 z-[70] rounded-md border border-emerald-400/30 bg-emerald-950/95 px-4 py-2.5 text-sm font-semibold text-emerald-200 shadow-lg"
        >
          Successfully handed over to CST
        </div>
      ) : null}

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
            const count = tabCount(item.id);
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

        {tab === 'leads' ? (
          <>
            <div className="mb-6">
              <h2 className="font-display text-lg font-semibold tracking-tight text-white">
                My Leads
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Leads assigned to you — agent handoffs and 24h auto-moves
              </p>
            </div>
            {isLoading ? (
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
                emptyMessage="No leads assigned to you yet."
              />
            )}
          </>
        ) : null}

        {tab === 'closed' ? (
          <>
            <div className="mb-6">
              <h2 className="font-display text-lg font-semibold tracking-tight text-white">
                Closed Sales
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Sales awaiting CST handoff — Move to CST sends them to the CST queue
              </p>
            </div>

            {closedLoading ? (
              <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
            ) : closedError ? (
              <p className="py-12 text-center text-sm text-red-400">
                {closedErr?.response?.data?.message ||
                  'Failed to load closed sales.'}
              </p>
            ) : awaitingHandover.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-500">
                No sales awaiting CST handover.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
                <table className="min-w-full text-sm text-zinc-200">
                  <thead className="border-b border-zinc-800 bg-zinc-950/40">
                    <tr>
                      <th className={thClass}>Business</th>
                      <th className={thClass}>Created By</th>
                      <th className={thClass}>Payment</th>
                      <th className={thClass}>Closed</th>
                      <th className={thClass}>Status</th>
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
                            <span className="inline-flex rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-medium text-orange-300 ring-1 ring-orange-500/30">
                              Ready for CST
                            </span>
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
                                onClick={() => {
                                  setActionError('');
                                  setActionMessage('');
                                  setMoveToCstLead(row);
                                }}
                                className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500"
                              >
                                Move to CST
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        {tab === 'disqualified' ? (
          <>
            <div className="mb-6">
              <h2 className="font-display text-lg font-semibold tracking-tight text-white">
                Disqualified Leads
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Leads you marked as disqualified — permanently remove when done
              </p>
            </div>

            {dqLoading ? (
              <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
            ) : dqError ? (
              <p className="py-12 text-center text-sm text-red-400">
                {dqErr?.response?.data?.message ||
                  'Failed to load disqualified leads.'}
              </p>
            ) : disqualifiedLeads.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-500">
                No disqualified leads.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
                <table className="min-w-full text-sm text-zinc-200">
                  <thead className="border-b border-zinc-800 bg-zinc-950/40">
                    <tr>
                      <th className={thClass}>Business</th>
                      <th className={thClass}>Phone</th>
                      <th className={thClass}>Created By</th>
                      <th className={thClass}>Reason</th>
                      <th className={thClass}>Updated</th>
                      <th className={thClass}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disqualifiedLeads.map((row) => {
                      const deleting =
                        deleteMutation.isPending &&
                        deleteMutation.variables === row._id;
                      return (
                        <tr key={row._id} className={rowClass}>
                          <td className={`${tdClass} font-medium text-white`}>
                            {row.businessName}
                          </td>
                          <td
                            className={`${tdClass} whitespace-nowrap text-zinc-400`}
                          >
                            {row.phone || '—'}
                          </td>
                          <td className={`${tdClass} text-zinc-400`}>
                            {formatUserRef(row.agentId) || '—'}
                          </td>
                          <td className={`${tdClass} max-w-[16rem] text-zinc-400`}>
                            <span className="line-clamp-2">
                              {row.disqualifiedReason || '—'}
                            </span>
                          </td>
                          <td
                            className={`${tdClass} whitespace-nowrap text-zinc-400`}
                          >
                            {formatPkt(row.updatedAt)}
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
                                disabled={deleting}
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Permanently delete "${row.businessName}"? This cannot be undone.`
                                    )
                                  ) {
                                    return;
                                  }
                                  setActionError('');
                                  setActionMessage('');
                                  deleteMutation.mutate(row._id);
                                }}
                                className="rounded-lg border border-red-500/40 bg-red-600/15 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-600/25 disabled:opacity-60"
                              >
                                {deleting ? 'Deleting…' : 'Delete Permanently'}
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
          </>
        ) : null}

        {tab === 'team' ? (
          <>
            <div className="mb-6">
              <h2 className="font-display text-lg font-semibold tracking-tight text-white">
                My Team
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Agents who assigned leads or callbacks to you — read-only agenda
              </p>
            </div>

            {teamLoading ? (
              <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
            ) : teamError ? (
              <p className="py-12 text-center text-sm text-red-400">
                {teamErr?.response?.data?.message ||
                  'Failed to load team agents.'}
              </p>
            ) : teamAgents.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-500">
                No agents have tagged you on leads or callbacks yet.
              </p>
            ) : (
              <div className="space-y-5">
                <div
                  className="flex flex-wrap gap-2"
                  role="tablist"
                  aria-label="Team agents"
                >
                  {teamAgents.map((agent) => {
                    const active =
                      String(agent._id) === String(selectedAgentId);
                    const label =
                      agent.fullName || agent.username || 'Agent';
                    return (
                      <button
                        key={agent._id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setSelectedAgentId(String(agent._id))}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                          active
                            ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/25'
                            : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {label}
                        {agent.fullName && agent.username
                          ? ` (@${agent.username})`
                          : ''}
                      </button>
                    );
                  })}
                </div>

                {selectedAgent ? (
                  <p className="text-sm text-zinc-400">
                    Scheduled callbacks for{' '}
                    <span className="font-medium text-zinc-200">
                      {selectedAgent.fullName || selectedAgent.username}
                    </span>
                  </p>
                ) : null}

                {teamCbLoading ? (
                  <p className="py-8 text-center text-sm text-zinc-500">
                    Loading callbacks…
                  </p>
                ) : teamCbError ? (
                  <p className="py-8 text-center text-sm text-red-400">
                    {teamCbErr?.response?.data?.message ||
                      'Failed to load agent callbacks.'}
                  </p>
                ) : teamCallbacks.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500">
                    No scheduled callbacks for this agent.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
                    <table className="min-w-full text-sm text-zinc-200">
                      <thead className="border-b border-zinc-800 bg-zinc-950/40">
                        <tr>
                          <th className={thClass}>Business Name</th>
                          <th className={thClass}>Website Link</th>
                          <th className={thClass}>Email</th>
                          <th className={thClass}>Scheduled Time (PKT)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamCallbacks.map((row) => (
                          <tr key={row._id} className={rowClass}>
                            <td className={`${tdClass} font-medium text-white`}>
                              {row.businessName || '—'}
                            </td>
                            <td className={tdClass}>
                              {row.websiteLink ? (
                                <a
                                  href={
                                    /^https?:\/\//i.test(row.websiteLink)
                                      ? row.websiteLink
                                      : `https://${row.websiteLink}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="break-all text-orange-400 hover:underline"
                                >
                                  {row.websiteLink}
                                </a>
                              ) : (
                                <span className="text-zinc-500">—</span>
                              )}
                            </td>
                            <td className={`${tdClass} text-zinc-400`}>
                              {row.email || '—'}
                            </td>
                            <td
                              className={`${tdClass} whitespace-nowrap text-zinc-300`}
                            >
                              {formatPktFull(row.callbackAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
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
        onLeadUpdated={(updated) => {
          setDetailLead(updated);
          setActionError('');
          queryClient.setQueryData(['closerClosedSales'], (old) => {
            if (!Array.isArray(old) || !updated?._id) return old;
            return old.map((l) =>
              String(l._id) === String(updated._id) ? { ...l, ...updated } : l
            );
          });
        }}
        headerActions={
          isCloserActiveLead(detailLead) ? (
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
              {isCloserActiveLead(detailLead) ? (
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
                  onClick={() => {
                    setActionError('');
                    setMoveToCstLead(detailLead);
                  }}
                  className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                >
                  Move to CST
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

      <MoveToCstModal
        open={Boolean(moveToCstLead)}
        lead={moveToCstLead}
        isSubmitting={moveMutation.isPending}
        onClose={() => {
          if (!moveMutation.isPending) setMoveToCstLead(null);
        }}
        onSubmit={(formData) =>
          moveMutation.mutateAsync({
            id: moveToCstLead._id,
            formData,
          })
        }
      />
    </CloserShell>
  );
}
