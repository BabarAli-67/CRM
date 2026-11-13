import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

/**
 * Tech shared client portfolio — keywords, monthly PDFs, change requests.
 */
export default function TechClientPortfolioPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
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
    if (!lead) return;
    setKeywords(mapKeywordsFromLead(lead));
    setChangeRequests(mapChangeRequestsFromLead(lead));
  }, [lead]);

  const onLeadUpdated = (updated) => {
    queryClient.setQueryData(['lead', id, 'tech-portfolio'], updated);
    queryClient.setQueryData(['lead', id], updated);
    queryClient.invalidateQueries({ queryKey: ['myProjects'] });
    setKeywords(mapKeywordsFromLead(updated));
    setChangeRequests(mapChangeRequestsFromLead(updated));
  };

  const revenue = lead ? getClientRevenueTotals(lead) : null;

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
          </>
        )}
      </section>
    </TechTeamShell>
  );
}
