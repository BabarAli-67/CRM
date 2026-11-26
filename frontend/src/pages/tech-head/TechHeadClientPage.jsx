import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CstClientComments from '../../components/cst-manager/CstClientComments.jsx';
import LivePortfolioSection, {
  mapKeywordsFromLead,
} from '../../components/portfolio/LivePortfolioSection.jsx';
import OpsStatusBadges from '../../components/ops/OpsStatusBadges.jsx';
import OpsStatusEditor from '../../components/ops/OpsStatusEditor.jsx';
import ProjectNumberBadge from '../../components/tech/ProjectNumberBadge.jsx';
import PriorityToggleButton, {
  PriorityPill,
} from '../../components/tech/PriorityToggleButton.component.jsx';
import TechProjectWorkScope, {
  resolveProjectStatusLabel,
} from '../../components/tech/TechProjectWorkScope.component.jsx';
import TechHeadShell from '../../components/tech-head/TechHeadShell.jsx';
import { getTechHeadClient } from '../../services/techHead.service.js';
import { resolveTechHeadBackNav } from '../../utils/techDetailNav.util.js';
import { projectTitle } from '../../utils/projectNumber.util.js';

export default function TechHeadClientPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [keywords, setKeywords] = useState([]);
  const tabParam = searchParams.get('tab');
  const detailTab = tabParam === 'comments' ? 'comments' : 'work';
  const backNav = resolveTechHeadBackNav(searchParams.get('from'));

  const {
    data: lead,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['techHeadClient', id],
    queryFn: () => getTechHeadClient(id),
    enabled: Boolean(id),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!lead) return;
    setKeywords(mapKeywordsFromLead(lead));
  }, [lead]);

  const selectTab = (next) => {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (next === 'comments') nextParams.set('tab', 'comments');
        else nextParams.delete('tab');
        return nextParams;
      },
      { replace: true }
    );
  };

  const onLeadUpdated = (updated) => {
    if (updated) {
      queryClient.setQueryData(['techHeadClient', id], updated);
      setKeywords(mapKeywordsFromLead(updated));
    }
    queryClient.invalidateQueries({ queryKey: ['techHeadClient', id] });
    queryClient.invalidateQueries({ queryKey: ['commentNotifications'] });
    queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
    queryClient.invalidateQueries({ queryKey: ['techHeadTeamComments'] });
    queryClient.invalidateQueries({ queryKey: ['techHeadEscalations'] });
    queryClient.invalidateQueries({ queryKey: ['techHeadPriority'] });
  };

  const statusLabel = resolveProjectStatusLabel(lead);

  return (
    <TechHeadShell title="Project Detail">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <Link
            to={backNav.to}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-400 transition hover:text-orange-300"
          >
            ← {backNav.label}
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ProjectNumberBadge lead={lead} size="lg" />
                    <PriorityPill lead={lead} />
                    <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300 ring-1 ring-zinc-600">
                      {statusLabel}
                    </span>
                  </div>
                  <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white">
                    {projectTitle(lead, '—')}
                  </h1>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <OpsStatusBadges handover={lead.handover} />
                  </div>
                </div>
                <PriorityToggleButton lead={lead} />
              </div>
            </div>

            <TechProjectWorkScope lead={lead} showAssignees />

            <div
              role="tablist"
              aria-label="Client sections"
              className="flex flex-wrap gap-1 rounded-xl border border-zinc-800/80 bg-[#111111] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'work'}
                onClick={() => selectTab('work')}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                  detailTab === 'work'
                    ? 'bg-[#F25E26]/15 text-[#F25E26] ring-1 ring-[#F25E26]/40'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }`}
              >
                Work &amp; Reports
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={detailTab === 'comments'}
                onClick={() => selectTab('comments')}
                className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                  detailTab === 'comments'
                    ? 'bg-[#F25E26]/15 text-[#F25E26] ring-1 ring-[#F25E26]/40'
                    : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }`}
              >
                Comments
              </button>
            </div>

            {detailTab === 'comments' ? (
              <CstClientComments lead={lead} onLeadUpdated={onLeadUpdated} />
            ) : (
              <>
                <OpsStatusEditor
                  leadId={lead._id}
                  handover={lead.handover}
                  onUpdated={(updated) => {
                    if (updated) {
                      queryClient.setQueryData(['techHeadClient', id], updated);
                    }
                  }}
                />

                <LivePortfolioSection
                  mode="tech"
                  leadId={lead._id}
                  keywords={keywords}
                  setKeywords={setKeywords}
                  reports={
                    Array.isArray(lead.handover?.monthlyReports)
                      ? lead.handover.monthlyReports
                      : []
                  }
                  keywordsRankedConfirmation={
                    lead.handover?.keywordsRankedConfirmation || null
                  }
                  showConfirmKeywordsRanked
                  onLeadUpdated={() => {
                    queryClient.invalidateQueries({
                      queryKey: ['techHeadClient', id],
                    });
                  }}
                />
              </>
            )}
          </>
        )}
      </section>
    </TechHeadShell>
  );
}
