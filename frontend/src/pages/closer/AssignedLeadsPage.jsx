import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import HorizontalScrollArea from '../../components/HorizontalScrollArea.component.jsx';
import LeadDetailModal from '../../components/leads/LeadDetailModal.jsx';
import LeadTable from '../../components/leads/LeadTable.jsx';
import CloseSaleModal from '../../components/leads/CloseSaleModal.jsx';
import MoveToCstModal from '../../components/leads/MoveToCstModal.jsx';
import CloserScheduleCallbackModal from '../../components/callbacks/CloserScheduleCallbackModal.jsx';
import CloserShell from '../../components/closer/CloserShell.jsx';
import CloserTableFilterBar, {
  pktDateKey,
} from '../../components/closer/CloserTableFilterBar.jsx';
import { getCloserTeamAgentCallbacks } from '../../services/callback.service.js';
import {
  getAssignedLeads,
  getCloserClosedSales,
  getCloserDisqualifiedLeads,
  getCloserTeamAgents,
  getLeadById,
  moveLeadToCst,
  restoreDisqualifiedLead,
} from '../../services/lead.service.js';
import { formatUserRef } from '../../utils/formatUserRef.util.js';
import {
  formatPaymentSummary,
} from '../../utils/formatPayment.util.js';
import { sortCallbacksChronologically } from '../../utils/callbackListTabs.js';
import {
  currentPktMonth,
  formatPktMonthLabel,
} from '../../utils/pktMonth.util.js';

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

const TAB_IDS = new Set(['leads', 'closed', 'disqualified', 'team']);

const resolveTab = (value) => (TAB_IDS.has(value) ? value : 'leads');

const PAGE_TITLE = {
  leads: 'Leads',
  closed: 'Closed Sales',
  disqualified: 'Disqualified Leads',
  team: 'My Team',
};

const thClass =
  'px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wide text-zinc-500';
const tdClass = 'px-4 py-3.5 align-middle';
const rowClass =
  'border-b border-zinc-800/50 last:border-0 transition-colors hover:bg-zinc-800/25';

export default function AssignedLeadsPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveTab(searchParams.get('tab'));
  const setTab = (next) => {
    const id = resolveTab(next);
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (id === 'leads') nextParams.delete('tab');
        else nextParams.set('tab', id);
        return nextParams;
      },
      { replace: true }
    );
  };
  const [detailLead, setDetailLead] = useState(null);
  const [scheduleLead, setScheduleLead] = useState(null);
  const [moveToCstLead, setMoveToCstLead] = useState(null);
  const [closeSaleLead, setCloseSaleLead] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [toast, setToast] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [closedBusinessFilter, setClosedBusinessFilter] = useState('');
  const [closedEmailFilter, setClosedEmailFilter] = useState('');
  const [closedDateFilter, setClosedDateFilter] = useState('');
  const [closedMonth, setClosedMonth] = useState(currentPktMonth);
  const closedMonthPinnedRef = useRef(false);
  const [teamBusinessFilter, setTeamBusinessFilter] = useState('');
  const [teamEmailFilter, setTeamEmailFilter] = useState('');
  const [teamDateFilter, setTeamDateFilter] = useState('');

  // Follow the live PKT month unless the user pinned an archive month
  useEffect(() => {
    const id = window.setInterval(() => {
      if (closedMonthPinnedRef.current) return;
      const live = currentPktMonth();
      setClosedMonth((prev) => (prev === live ? prev : live));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const selectClosedMonth = (value) => {
    const next = value || currentPktMonth();
    closedMonthPinnedRef.current = next !== currentPktMonth();
    setClosedMonth(next);
  };

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
    queryKey: ['closerClosedSales', closedMonth],
    queryFn: () => getCloserClosedSales(closedMonth),
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

  // Fresh filter state when switching agent chips
  useEffect(() => {
    setTeamBusinessFilter('');
    setTeamEmailFilter('');
    setTeamDateFilter('');
  }, [selectedAgentId]);

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

  const openMoveToCst = async (row) => {
    setActionError('');
    setActionMessage('');
    try {
      const id = row?._id || row?.id;
      if (!id) throw new Error('Missing lead id');
      const full = await getLeadById(id);
      setMoveToCstLead(full || row);
    } catch {
      setMoveToCstLead(row);
    }
  };

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
      queryClient.setQueriesData({ queryKey: ['closerClosedSales'] }, (old) => {
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

  // Toast / message from Move to Leads (Direct Contact promote)
  useEffect(() => {
    const msg = location.state?.toast;
    if (!msg) return;
    setActionMessage(String(msg));
    navigate(location.pathname + location.search, {
      replace: true,
      state: {},
    });
  }, [location.state, location.pathname, location.search, navigate]);

  const restoreMutation = useMutation({
    mutationFn: (id) => restoreDisqualifiedLead(id),
    onSuccess: (lead) => {
      const id = lead?._id;
      setActionMessage('Lead moved back to Leads.');
      queryClient.setQueryData(['closerDisqualified'], (old) => {
        if (!Array.isArray(old) || !id) return old;
        return old.filter((l) => String(l._id) !== String(id));
      });
      queryClient.setQueryData(['assignedLeads'], (old) => {
        const list = Array.isArray(old) ? old : [];
        if (!lead?._id) return list;
        if (list.some((l) => String(l._id) === String(lead._id))) {
          return list.map((l) =>
            String(l._id) === String(lead._id) ? { ...l, ...lead } : l
          );
        }
        return [lead, ...list];
      });
      queryClient.invalidateQueries({ queryKey: ['closerDisqualified'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
      queryClient.invalidateQueries({ queryKey: ['allLeads'] });
    },
    onError: (err) => {
      setActionError(
        err?.response?.data?.message || 'Failed to move lead back to Leads.'
      );
    },
  });

  // Closed Sales tab: only sales still awaiting CST handoff
  const awaitingHandover = useMemo(() => {
    const base = [...closedSales.filter(isAwaitingCstHandover)].sort(
      (a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0)
    );
    const nameQ = closedBusinessFilter.trim().toLowerCase();
    const emailQ = closedEmailFilter.trim().toLowerCase();
    const dateQ = closedDateFilter.trim();
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
      if (dateQ && pktDateKey(lead.closedAt) !== dateQ) {
        return false;
      }
      return true;
    });
  }, [
    closedSales,
    closedBusinessFilter,
    closedEmailFilter,
    closedDateFilter,
  ]);

  const liveClosedMonth = currentPktMonth();
  const viewingArchiveMonth = closedMonth !== liveClosedMonth;

  const hasClosedFilters =
    closedBusinessFilter.trim() !== '' ||
    closedEmailFilter.trim() !== '' ||
    closedDateFilter.trim() !== '' ||
    viewingArchiveMonth;

  const clearClosedFilters = () => {
    setClosedBusinessFilter('');
    setClosedEmailFilter('');
    setClosedDateFilter('');
    closedMonthPinnedRef.current = false;
    setClosedMonth(currentPktMonth());
  };

  const selectedAgent = teamAgents.find(
    (a) => String(a._id) === String(selectedAgentId)
  );

  const filteredTeamCallbacks = useMemo(() => {
    const nameQ = teamBusinessFilter.trim().toLowerCase();
    const emailQ = teamEmailFilter.trim().toLowerCase();
    const dateQ = teamDateFilter.trim();
    const filtered =
      !nameQ && !emailQ && !dateQ
        ? teamCallbacks
        : teamCallbacks.filter((row) => {
            if (nameQ) {
              const name = String(row.businessName || '').toLowerCase();
              if (!name.includes(nameQ)) return false;
            }
            if (emailQ) {
              const personal = String(row.personalEmail || '').toLowerCase();
              const business = String(row.businessEmail || '').toLowerCase();
              const combined = String(row.email || '').toLowerCase();
              if (
                !personal.includes(emailQ) &&
                !business.includes(emailQ) &&
                !combined.includes(emailQ)
              ) {
                return false;
              }
            }
            if (dateQ) {
              const cbKey = pktDateKey(row.callbackAt);
              const createdKey = pktDateKey(row.createdAt);
              if (cbKey !== dateQ && createdKey !== dateQ) return false;
            }
            return true;
          });
    return sortCallbacksChronologically(filtered);
  }, [
    teamCallbacks,
    teamBusinessFilter,
    teamEmailFilter,
    teamDateFilter,
  ]);

  const hasTeamFilters =
    teamBusinessFilter.trim() !== '' ||
    teamEmailFilter.trim() !== '' ||
    teamDateFilter.trim() !== '';

  const clearTeamFilters = () => {
    setTeamBusinessFilter('');
    setTeamEmailFilter('');
    setTeamDateFilter('');
  };

  return (
    <CloserShell title={PAGE_TITLE[tab] || 'Leads'}>
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
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold tracking-tight text-white">
                  Closed Sales
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {formatPktMonthLabel(closedMonth)} (PKT) · awaiting CST handoff
                  {viewingArchiveMonth ? ' · archive month' : ' · current month'}
                </p>
              </div>
              <label className="space-y-1 text-xs font-medium text-zinc-400">
                <span>Month (PKT)</span>
                <input
                  type="month"
                  value={closedMonth}
                  onChange={(e) => selectClosedMonth(e.target.value)}
                  max={liveClosedMonth}
                  className="block rounded-lg border border-white/15 bg-[#111111] px-3 py-2 text-sm text-white outline-none transition [color-scheme:dark] focus:border-[#F25E26]/60 focus:ring-2 focus:ring-[#F25E26]/30"
                  aria-label="Closed sales month (Asia/Karachi)"
                />
              </label>
            </div>

            {closedLoading ? (
              <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
            ) : closedError ? (
              <p className="py-12 text-center text-sm text-red-400">
                {closedErr?.response?.data?.message ||
                  'Failed to load closed sales.'}
              </p>
            ) : (
              <div className="space-y-3">
                <CloserTableFilterBar
                  businessName={closedBusinessFilter}
                  onBusinessNameChange={setClosedBusinessFilter}
                  email={closedEmailFilter}
                  onEmailChange={setClosedEmailFilter}
                  date={closedDateFilter}
                  onDateChange={setClosedDateFilter}
                  onClear={clearClosedFilters}
                  dateLabel="Date"
                />
                {awaitingHandover.length === 0 ? (
                  <p className="py-12 text-center text-sm text-zinc-500">
                    {hasClosedFilters
                      ? 'No closed sales match these filters.'
                      : `No sales awaiting CST handover in ${formatPktMonthLabel(closedMonth)}.`}
                  </p>
                ) : (
                  <HorizontalScrollArea className="rounded-xl border border-zinc-800/60">
                    <table className="min-w-full text-sm text-zinc-200">
                      <thead className="border-b border-zinc-800 bg-zinc-950/40">
                        <tr>
                          <th className={`${thClass} whitespace-nowrap`}>
                            Business Name
                          </th>
                          <th className={`${thClass} whitespace-nowrap`}>
                            Personal Email
                          </th>
                          <th className={`${thClass} whitespace-nowrap`}>
                            Business Email
                          </th>
                          <th className={`${thClass} whitespace-nowrap`}>
                            Created By
                          </th>
                          <th className={`${thClass} whitespace-nowrap`}>
                            Payment
                          </th>
                          <th className={`${thClass} whitespace-nowrap`}>
                            Personal Phone
                          </th>
                          <th className={`${thClass} whitespace-nowrap`}>
                            Business Phone
                          </th>
                          <th className={`${thClass} whitespace-nowrap`}>
                            Closed / Closed Timings
                          </th>
                          <th
                            className={`${thClass} min-w-[12rem] whitespace-nowrap`}
                          >
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {awaitingHandover.map((row) => {
                          const offered =
                            row.paymentOffered != null
                              ? `$${Number(row.paymentOffered).toLocaleString()}`
                              : null;
                          const received =
                            row.paymentReceived != null
                              ? `$${Number(row.paymentReceived).toLocaleString()}`
                              : null;
                          return (
                            <tr key={row._id} className={rowClass}>
                              <td
                                className={`${tdClass} font-medium text-white`}
                              >
                                {row.businessName || '—'}
                              </td>
                              <td
                                className={`${tdClass} whitespace-nowrap text-zinc-400`}
                              >
                                {row.personalEmail || '—'}
                              </td>
                              <td
                                className={`${tdClass} whitespace-nowrap text-zinc-400`}
                              >
                                {row.businessEmail || '—'}
                              </td>
                              <td className={`${tdClass} whitespace-nowrap`}>
                                {formatUserRef(row.agentId) ? (
                                  <span className="inline-flex max-w-[14rem] flex-col gap-0.5">
                                    <span className="truncate font-medium text-zinc-200">
                                      {row.agentId?.fullName ||
                                        row.agentId?.username ||
                                        '—'}
                                    </span>
                                    {row.agentId?.fullName &&
                                    row.agentId?.username ? (
                                      <span className="truncate text-xs text-zinc-500">
                                        @{row.agentId.username}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : (
                                  <span className="text-zinc-500">—</span>
                                )}
                              </td>
                              <td className={tdClass}>
                                <span className="inline-flex flex-col gap-0.5">
                                  <span className="text-zinc-200">
                                    {formatPaymentSummary(row.payment)}
                                  </span>
                                  {offered || received ? (
                                    <span className="text-xs text-zinc-500">
                                      {[
                                        offered ? `Offered ${offered}` : null,
                                        received
                                          ? `Received ${received}`
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </span>
                                  ) : null}
                                </span>
                              </td>
                              <td
                                className={`${tdClass} whitespace-nowrap text-zinc-300`}
                              >
                                {row.personalPhone || '—'}
                              </td>
                              <td
                                className={`${tdClass} whitespace-nowrap text-zinc-300`}
                              >
                                {row.businessPhone || '—'}
                              </td>
                              <td
                                className={`${tdClass} whitespace-nowrap text-zinc-400`}
                              >
                                {formatPktFull(row.closedAt)}
                              </td>
                              <td
                                className={`${tdClass} min-w-[12rem] whitespace-nowrap`}
                              >
                                <div className="flex flex-nowrap items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openDetail(row)}
                                    className="whitespace-nowrap rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60"
                                  >
                                    Details
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openMoveToCst(row)}
                                    className="whitespace-nowrap rounded-lg bg-[#F25E26] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                                  >
                                    Move to CST
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </HorizontalScrollArea>
                )}
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
                Stay here until you restore to Leads or move to Closed Sales
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
                      <th className={thClass}>Agent Name</th>
                      <th className={thClass}>Reason</th>
                      <th className={thClass}>Updated</th>
                      <th className={thClass}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disqualifiedLeads.map((row) => {
                      const restoring =
                        restoreMutation.isPending &&
                        restoreMutation.variables === row._id;
                      return (
                        <tr key={row._id} className={rowClass}>
                          <td className={`${tdClass} font-medium text-white`}>
                            {row.businessName}
                          </td>
                          <td
                            className={`${tdClass} whitespace-nowrap text-zinc-400`}
                          >
                            {row.businessPhone || row.personalPhone || '—'}
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
                                onClick={() => {
                                  setActionError('');
                                  setActionMessage('');
                                  setCloseSaleLead(row);
                                }}
                                className="rounded-lg border border-orange-500/40 bg-orange-600/15 px-3 py-1.5 text-xs font-semibold text-orange-300 hover:bg-orange-600/25"
                              >
                                Move to Closed Sales
                              </button>
                              <button
                                type="button"
                                disabled={restoring}
                                onClick={() => {
                                  setActionError('');
                                  setActionMessage('');
                                  restoreMutation.mutate(row._id);
                                }}
                                className="rounded-lg border border-emerald-500/40 bg-emerald-600/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/25 disabled:opacity-60"
                              >
                                {restoring ? 'Moving…' : 'Move to Leads'}
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

                <CloserTableFilterBar
                  businessName={teamBusinessFilter}
                  onBusinessNameChange={setTeamBusinessFilter}
                  email={teamEmailFilter}
                  onEmailChange={setTeamEmailFilter}
                  date={teamDateFilter}
                  onDateChange={setTeamDateFilter}
                  onClear={clearTeamFilters}
                  dateLabel="Date"
                />

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
                ) : filteredTeamCallbacks.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500">
                    {hasTeamFilters
                      ? 'No callbacks match these filters.'
                      : 'No scheduled callbacks for this agent.'}
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
                        {filteredTeamCallbacks.map((row) => (
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
                              {row.email ||
                                row.businessEmail ||
                                row.personalEmail ||
                                '—'}
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
          (isCloserActiveLead(detailLead) ||
            (detailLead.stage === 'closed_sale' &&
              isAwaitingCstHandover(detailLead)))
        }
        initialEditing={
          isCloserActiveLead(detailLead) ||
          (detailLead?.stage === 'closed_sale' &&
            isAwaitingCstHandover(detailLead))
        }
        onLeadUpdated={(updated) => {
          setDetailLead(updated);
          setActionError('');
          queryClient.setQueryData(['assignedLeads'], (old) => {
            if (!Array.isArray(old) || !updated?._id) return old;
            return old.map((l) =>
              String(l._id) === String(updated._id) ? { ...l, ...updated } : l
            );
          });
          queryClient.setQueriesData({ queryKey: ['closerClosedSales'] }, (old) => {
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

      <CloseSaleModal
        open={Boolean(closeSaleLead)}
        lead={closeSaleLead}
        onClose={() => setCloseSaleLead(null)}
        onSuccess={() => {
          setActionMessage('Lead moved to Closed Sales.');
          setToast(true);
          setCloseSaleLead(null);
          setTab('closed');
        }}
      />
    </CloserShell>
  );
}
