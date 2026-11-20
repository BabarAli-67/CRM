import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CstClientComments from '../../components/cst-manager/CstClientComments.jsx';
import LivePortfolioSection, {
  mapChangeRequestsFromLead,
  mapKeywordsFromLead,
} from '../../components/portfolio/LivePortfolioSection.jsx';
import TechTeamShell from '../../components/tech-team/TechTeamShell.jsx';
import { getLeadById } from '../../services/lead.service.js';
import {
  formatMoneyAmount,
  getClientRevenueTotals,
} from '../../utils/formatPayment.util.js';

const DETAIL_TABS = [
  { id: 'portfolio', label: 'Work & Reports' },
  { id: 'comments', label: 'Comments' },
];

const DETAIL_TAB_IDS = new Set(DETAIL_TABS.map((t) => t.id));
const resolveDetailTab = (value) =>
  DETAIL_TAB_IDS.has(value) ? value : 'portfolio';

/**
 * Tech shared client portfolio — keywords, monthly PDFs, change requests,
 * plus the shared CST ↔ Tech Comments thread.
 */
export default function TechClientPortfolioPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [detailTab, setDetailTab] = useState(() =>
    resolveDetailTab(searchParams.get('tab'))
  );
  const [keywords, setKeywords] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);

  const {
    data: lead,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['lead', id, 'tech-portfolio'],
    queryFn: () => getLeadById(id),
    enabled: Boolean(id),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    setDetailTab(resolveDetailTab(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    if (!lead) return;
    setKeywords(mapKeywordsFromLead(lead));
    setChangeRequests(mapChangeRequestsFromLead(lead));
  }, [lead]);

  const selectDetailTab = (next) => {
    const idTab = resolveDetailTab(next);
    setDetailTab(idTab);
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (idTab === 'portfolio') nextParams.delete('tab');
        else nextParams.set('tab', idTab);
        return nextParams;
      },
      { replace: true }
    );
  };

  const onLeadUpdated = (updated) => {
    queryClient.setQueryData(['lead', id, 'tech-portfolio'], updated);
    queryClient.setQueryData(['lead', id], updated);
    queryClient.invalidateQueries({ queryKey: ['myProjects'] });
    queryClient.invalidateQueries({ queryKey: ['commentNotifications'] });
    if (updated) {
      setKeywords(mapKeywordsFromLead(updated));
      setChangeRequests(mapChangeRequestsFromLead(updated));
    }
  };

  const revenue = lead ? getClientRevenueTotals(lead) : null;
  const unread = Number(lead?.unreadCommentCount) || 0;

  return (
    <TechTeamShell title="Client Portfolio">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <Link
            to="/dashboard/tech-team/projects"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-400 transition hover:text-orange-300"
          >
            ← Back to My Projects
          </Link>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load client.'}
          </p>
        ) : !lead ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            Client not found.
          </p>
        ) : (
          <>
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 px-6 py-5 shadow-xl">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Assigned client
              </p>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white">
                {lead.businessName || '—'}
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                {lead.clientName?.trim() || 'No client name'}
              </p>
              {revenue ? (
                <p className="mt-2 text-sm text-zinc-500">
                  Collected{' '}
                  <span className="font-semibold text-emerald-300">
                    {formatMoneyAmount(revenue.totalCollected)}
                  </span>
                </p>
              ) : null}
            </div>

            <div
              role="tablist"
              aria-label="Client sections"
              className="flex flex-wrap gap-1 rounded-xl border border-zinc-800/80 bg-[#111111] p-1"
            >
              {DETAIL_TABS.map((tab) => {
                const active = detailTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => selectDetailTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                      active
                        ? 'bg-[#F25E26]/15 text-[#F25E26] ring-1 ring-[#F25E26]/40'
                        : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                    }`}
                  >
                    {tab.label}
                    {tab.id === 'comments' && unread > 0 ? (
                      <span className="rounded-full bg-[#F25E26]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#F25E26]">
                        {unread}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {detailTab === 'comments' ? (
              <CstClientComments lead={lead} onLeadUpdated={onLeadUpdated} />
            ) : (
              <LivePortfolioSection
                mode="tech"
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
                onLeadUpdated={onLeadUpdated}
              />
            )}
          </>
        )}
      </section>
    </TechTeamShell>
  );
}
