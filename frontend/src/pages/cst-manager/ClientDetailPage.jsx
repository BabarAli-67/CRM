import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CstManagerShell from '../../components/cst-manager/CstManagerShell.jsx';
import ClientContextRecord from '../../components/cst-manager/ClientContextRecord.jsx';
import CstUpsellPanel from '../../components/cst-manager/CstUpsellPanel.jsx';
import CstClientComments from '../../components/cst-manager/CstClientComments.jsx';
import CstRetentionPanel from '../../components/cst-manager/CstRetentionPanel.jsx';
import LivePortfolioSection, {
  mapChangeRequestsFromLead,
  mapKeywordsFromLead,
} from '../../components/portfolio/LivePortfolioSection.jsx';
import { updateClientBalances } from '../../services/handover.service.js';
import { getLeadById } from '../../services/lead.service.js';
import {
  formatMoneyAmount,
  formatPaymentSummary,
  getClientRevenueTotals,
} from '../../utils/formatPayment.util.js';
import {
  formatPktDateTimeLong,
  getRetentionBadge,
} from '../../utils/retention.util.js';

const DETAIL_TABS = [
  { id: 'context', label: 'Client Context' },
  { id: 'upsell', label: 'Upsell' },
  { id: 'retention', label: 'Retention' },
  { id: 'comments', label: 'Comments' },
  { id: 'work', label: 'Work & Reports' },
];

const DETAIL_TAB_IDS = new Set(DETAIL_TABS.map((t) => t.id));
const resolveDetailTab = (value) =>
  DETAIL_TAB_IDS.has(value) ? value : 'context';

const cardClass =
  'rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 shadow-xl sm:p-5';

const formatPktFull = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * CST Client Detail — summary header + Context / Upsell / Comments / Work & Reports.
 */
export default function ClientDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [detailTab, setDetailTab] = useState(() =>
    resolveDetailTab(searchParams.get('tab'))
  );
  const [keywords, setKeywords] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [headerPendingDraft, setHeaderPendingDraft] = useState('');
  const [headerBalanceError, setHeaderBalanceError] = useState('');

  useEffect(() => {
    setDetailTab(resolveDetailTab(searchParams.get('tab')));
  }, [searchParams]);

  const selectDetailTab = (next) => {
    const idTab = resolveDetailTab(next);
    setDetailTab(idTab);
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (idTab === 'context') nextParams.delete('tab');
        else nextParams.set('tab', idTab);
        return nextParams;
      },
      { replace: true }
    );
  };

  const {
    data: lead,
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ['lead', id, 'portfolio'],
    queryFn: async () => {
      const row = await getLeadById(id);
      setKeywords(mapKeywordsFromLead(row));
      setChangeRequests(mapChangeRequestsFromLead(row));
      return row;
    },
    enabled: Boolean(id),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const syncLeadCaches = (updated) => {
    if (!updated?._id) return;
    queryClient.setQueryData(['lead', id, 'portfolio'], updated);
    queryClient.setQueryData(['lead', id], updated);
    setKeywords(mapKeywordsFromLead(updated));
    setChangeRequests(mapChangeRequestsFromLead(updated));
    queryClient.setQueryData(['handoverQueue'], (old) => {
      if (!Array.isArray(old)) return old;
      return old.map((row) =>
        String(row._id) === String(updated._id)
          ? {
              ...row,
              ...updated,
              handover: {
                ...(row.handover || {}),
                ...(updated.handover || {}),
              },
            }
          : row
      );
    });
    queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
    queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
    queryClient.invalidateQueries({ queryKey: ['retentionReminders'] });
  };

  const revenue = getClientRevenueTotals(lead);
  const baseAmount = revenue.baseOffered;
  const upsellTotal = revenue.upsellTotal;
  const collected = revenue.totalCollected;
  const pending = revenue.totalPending;
  const retentionBadge = getRetentionBadge(lead);

  useEffect(() => {
    if (!lead) return;
    setHeaderPendingDraft(
      pending === 0 ? '' : String(Number(pending.toFixed(2)))
    );
    setHeaderBalanceError('');
  }, [lead?._id, pending, lead]);

  const headerBalanceMutation = useMutation({
    mutationFn: (totalPending) =>
      updateClientBalances(id, { totalPending }),
    onSuccess: (updated) => {
      setHeaderBalanceError('');
      syncLeadCaches(updated);
    },
    onError: (err) => {
      setHeaderBalanceError(
        err?.response?.data?.message || 'Failed to update pending amount.'
      );
    },
  });

  const saveHeaderPending = (raw) => {
    const value = raw === '' || raw == null ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      setHeaderBalanceError('Pending must be a valid non-negative number.');
      return;
    }
    headerBalanceMutation.mutate(value);
  };

  return (
    <CstManagerShell title="Client Detail">
      <section className="mx-auto w-full max-w-7xl space-y-4">
        <div>
          <Link
            to="/dashboard/cst-manager/handover?tab=onboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#F25E26] transition hover:text-orange-300"
          >
            ← Back to Handover Queue
          </Link>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {loadError?.response?.data?.message || 'Failed to load client.'}
          </p>
        ) : !lead ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            Client not found.
          </p>
        ) : (
          <>
            <div className="shrink-0 space-y-3">
              <div className={`${cardClass} !py-4`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Client summary
                    </p>
                    <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-white">
                      {lead.businessName?.trim() || '—'}
                    </h1>
                    <p className="mt-1 text-sm text-zinc-400">
                      {lead.clientName?.trim() || '—'}
                    </p>

                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <SummaryLine
                        label="Personal Email"
                        value={lead.personalEmail?.trim() || '—'}
                      />
                      <SummaryLine
                        label="Business Email"
                        value={lead.businessEmail?.trim() || '—'}
                      />
                      <SummaryLine
                        label="Payment Method"
                        value={formatPaymentSummary(lead.payment)}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      <p className="text-zinc-400">
                        Base Amount:{' '}
                        <span className="font-semibold text-white">
                          {formatMoneyAmount(baseAmount)}
                        </span>
                      </p>
                      <p className="text-zinc-400">
                        Upsell Total:{' '}
                        <span className="font-semibold text-white">
                          {formatMoneyAmount(upsellTotal)}
                        </span>
                      </p>
                      <p className="text-zinc-400">
                        Collected Amount:{' '}
                        <span className="font-semibold text-emerald-300">
                          {formatMoneyAmount(collected)}
                        </span>
                      </p>
                      <p className="text-zinc-400">
                        Pending Amount:{' '}
                        <span
                          className={`font-semibold ${
                            pending > 0 ? 'text-[#F25E26]' : 'text-zinc-200'
                          }`}
                        >
                          {formatMoneyAmount(pending)}
                        </span>
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
                      <label className="min-w-[9rem] flex-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                          Quick update · Pending
                        </span>
                        <div className="relative mt-1">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                            $
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={headerPendingDraft}
                            placeholder="0"
                            disabled={headerBalanceMutation.isPending}
                            onChange={(e) =>
                              setHeaderPendingDraft(e.target.value)
                            }
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 py-2 pl-7 pr-3 text-sm text-white outline-none focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20"
                          />
                        </div>
                      </label>
                      <button
                        type="button"
                        disabled={headerBalanceMutation.isPending}
                        onClick={() => saveHeaderPending(headerPendingDraft)}
                        className="rounded-lg bg-[#F25E26] px-3 py-2 text-xs font-semibold text-white hover:bg-[#ff6a36] disabled:opacity-60"
                      >
                        {headerBalanceMutation.isPending
                          ? 'Saving…'
                          : 'Update'}
                      </button>
                      <button
                        type="button"
                        disabled={headerBalanceMutation.isPending}
                        onClick={() => {
                          setHeaderPendingDraft('');
                          saveHeaderPending(0);
                        }}
                        className="rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60"
                      >
                        Mark Paid
                      </button>
                      {headerBalanceError ? (
                        <p className="w-full text-sm text-red-400" role="alert">
                          {headerBalanceError}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {retentionBadge ? (
                    <div
                      className={`shrink-0 rounded-xl border px-3 py-2 text-right ${
                        retentionBadge.kind === 'paid'
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : 'border-[#F25E26]/30 bg-[#F25E26]/10'
                      }`}
                    >
                      <p
                        className={`text-[10px] font-semibold uppercase tracking-wide ${
                          retentionBadge.kind === 'paid'
                            ? 'text-emerald-300'
                            : 'text-[#F25E26]'
                        }`}
                      >
                        {retentionBadge.label}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-white">
                        {formatPktDateTimeLong(retentionBadge.at)} PKT
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                role="tablist"
                aria-label="Client detail sections"
                className="flex flex-wrap gap-1 rounded-xl border border-zinc-800/80 bg-[#111111] p-1"
              >
                {DETAIL_TABS.map((tab) => {
                  const active = detailTab === tab.id;
                  const unread =
                    tab.id === 'comments'
                      ? Number(lead.unreadCommentCount) || 0
                      : 0;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`client-detail-tab-${tab.id}`}
                      aria-selected={active}
                      aria-controls={`client-detail-panel-${tab.id}`}
                      onClick={() => selectDetailTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                        active
                          ? 'bg-[#F25E26]/15 text-[#F25E26] ring-1 ring-[#F25E26]/40'
                          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                      }`}
                    >
                      {tab.label}
                      {unread > 0 ? (
                        <span className="rounded-full bg-[#F25E26]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#F25E26]">
                          {unread}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              key={detailTab}
              role="tabpanel"
              id={`client-detail-panel-${detailTab}`}
              aria-labelledby={`client-detail-tab-${detailTab}`}
              className="mt-1 space-y-4 md:max-h-[calc(100vh-12rem)] md:overflow-y-auto md:overscroll-contain md:pr-2 scrollbar-portfolio"
            >
              {detailTab === 'context' ? (
                <ClientContextRecord
                  lead={lead}
                  formatPktFull={formatPktFull}
                  onLeadUpdated={syncLeadCaches}
                />
              ) : null}

              {detailTab === 'upsell' ? (
                <CstUpsellPanel lead={lead} onLeadUpdated={syncLeadCaches} />
              ) : null}

              {detailTab === 'retention' ? (
                <CstRetentionPanel
                  lead={lead}
                  onLeadUpdated={(updated) => {
                    syncLeadCaches(updated);
                    queryClient.invalidateQueries({
                      queryKey: ['retentionReminders'],
                    });
                  }}
                />
              ) : null}

              {detailTab === 'comments' ? (
                <CstClientComments
                  lead={lead}
                  onLeadUpdated={syncLeadCaches}
                />
              ) : null}

              {detailTab === 'work' ? (
                <LivePortfolioSection
                  mode="cst"
                  leadId={id}
                  keywords={keywords}
                  setKeywords={setKeywords}
                  changeRequests={changeRequests}
                  setChangeRequests={setChangeRequests}
                  reports={
                    Array.isArray(lead.handover?.monthlyReports)
                      ? lead.handover.monthlyReports
                      : []
                  }
                  onLeadUpdated={syncLeadCaches}
                />
              ) : null}
            </div>
          </>
        )}
      </section>
    </CstManagerShell>
  );
}

function SummaryLine({ label, value }) {
  return (
    <p className="min-w-0 text-zinc-400">
      <span className="text-zinc-500">{label}: </span>
      <span className="break-all font-medium text-zinc-200">{value}</span>
    </p>
  );
}
