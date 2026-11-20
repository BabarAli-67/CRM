import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CstManagerShell from '../../components/cst-manager/CstManagerShell.jsx';
import ClientContextRecord from '../../components/cst-manager/ClientContextRecord.jsx';
import CstUpsellPanel from '../../components/cst-manager/CstUpsellPanel.jsx';
import CstClientComments from '../../components/cst-manager/CstClientComments.jsx';
import LivePortfolioSection, {
  mapChangeRequestsFromLead,
  mapKeywordsFromLead,
} from '../../components/portfolio/LivePortfolioSection.jsx';
import { getLeadById } from '../../services/lead.service.js';
import { retentionAlertAtFromClosedAt } from '../../utils/emailjs.util.js';
import {
  formatMoneyAmount,
  formatPaymentSummary,
  getClientRevenueTotals,
} from '../../utils/formatPayment.util.js';

const DETAIL_TABS = [
  { id: 'context', label: 'Client Context' },
  { id: 'upsell', label: 'Upsell' },
  { id: 'comments', label: 'Comments' },
  { id: 'work', label: 'Work & Reports' },
];

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
  const queryClient = useQueryClient();
  const [detailTab, setDetailTab] = useState('context');
  const [keywords, setKeywords] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);

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
  const retentionAt =
    lead?.handover?.retention?.at ||
    retentionAlertAtFromClosedAt(lead?.closedAt);

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
                  </div>

                  {retentionAt ? (
                    <div className="shrink-0 rounded-xl border border-[#F25E26]/30 bg-[#F25E26]/10 px-3 py-2 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#F25E26]">
                        Retention Alert
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-white">
                        {formatPktFull(retentionAt)} PKT
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
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`client-detail-tab-${tab.id}`}
                      aria-selected={active}
                      aria-controls={`client-detail-panel-${tab.id}`}
                      onClick={() => setDetailTab(tab.id)}
                      className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                        active
                          ? 'bg-[#F25E26]/15 text-[#F25E26] ring-1 ring-[#F25E26]/40'
                          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                      }`}
                    >
                      {tab.label}
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
                />
              ) : null}

              {detailTab === 'upsell' ? (
                <CstUpsellPanel lead={lead} onLeadUpdated={syncLeadCaches} />
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
