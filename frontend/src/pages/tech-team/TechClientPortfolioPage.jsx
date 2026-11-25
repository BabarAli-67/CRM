import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CstClientComments from '../../components/cst-manager/CstClientComments.jsx';
import OpsStatusBadges from '../../components/ops/OpsStatusBadges.jsx';
import LivePortfolioSection, {
  mapKeywordsFromLead,
} from '../../components/portfolio/LivePortfolioSection.jsx';
import ProjectNumberBadge from '../../components/tech/ProjectNumberBadge.jsx';
import {
  DeveloperMockupPanel,
  RoleDeliverableWorkspace,
} from '../../components/tech-team/JdWorkspacePanels.jsx';
import TechTeamShell from '../../components/tech-team/TechTeamShell.jsx';
import useAuth from '../../hooks/useAuth.hook.js';
import { getLeadById } from '../../services/lead.service.js';
import { projectTitle } from '../../utils/projectNumber.util.js';
import {
  getClientTabsForJd,
  getWorkspaceMeta,
  resolveClientTab,
  resolveTechWorkspaceJd,
} from '../../utils/techWorkspace.util.js';

/**
 * JD-routed Tech client workspace — SEO keeps Work & Reports;
 * Developer / Content / Social / Design get dedicated panels + Comments.
 */
export default function TechClientPortfolioPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const workspaceJd = resolveTechWorkspaceJd(user);
  const meta = getWorkspaceMeta(workspaceJd);
  const tabs = useMemo(
    () => getClientTabsForJd(workspaceJd),
    [workspaceJd]
  );

  const [detailTab, setDetailTab] = useState(() =>
    resolveClientTab(workspaceJd, searchParams.get('tab'))
  );
  const [keywords, setKeywords] = useState([]);

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
    setDetailTab(resolveClientTab(workspaceJd, searchParams.get('tab')));
  }, [searchParams, workspaceJd]);

  useEffect(() => {
    if (!lead) return;
    setKeywords(mapKeywordsFromLead(lead));
  }, [lead]);

  const selectDetailTab = (next) => {
    const idTab = resolveClientTab(workspaceJd, next);
    setDetailTab(idTab);
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (idTab === meta.primaryTab) nextParams.delete('tab');
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
    }
  };

  const unread = Number(lead?.unreadCommentCount) || 0;

  return (
    <TechTeamShell title="Client Portfolio">
      <section className="mx-auto w-full max-w-7xl space-y-6">
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
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Assigned client
                </p>
                <ProjectNumberBadge lead={lead} size="lg" />
                <span className="inline-flex rounded-full border border-[#F25E26]/40 bg-[#F25E26]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#F25E26]">
                  {meta.badge}
                </span>
                {user?.jd === 'Intern' && workspaceJd ? (
                  <span className="text-[11px] text-zinc-500">
                    Intern · under {workspaceJd}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white">
                {projectTitle(lead, '—')}
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                {lead.serviceAreas?.trim() || 'Assigned project'}
              </p>
              <OpsStatusBadges handover={lead.handover} className="mt-3" />
              <p className="mt-2 text-xs text-zinc-500">
                Work fields only · billing hidden from Tech · statuses set by
                Tech Head · forwards appear in Comments
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Client sections"
              className="flex flex-wrap gap-1 rounded-xl border border-zinc-800/80 bg-[#111111] p-1"
            >
              {tabs.map((tab) => {
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
            ) : null}

            {detailTab === 'portfolio' && workspaceJd === 'SEO Expert' ? (
              <LivePortfolioSection
                mode="tech"
                leadId={id}
                keywords={keywords}
                setKeywords={setKeywords}
                reports={
                  Array.isArray(lead.handover?.monthlyReports)
                    ? lead.handover.monthlyReports
                    : []
                }
                onLeadUpdated={onLeadUpdated}
              />
            ) : null}

            {detailTab === 'mockup' && workspaceJd === 'Developer' ? (
              <DeveloperMockupPanel />
            ) : null}

            {detailTab === 'workspace' &&
            workspaceJd !== 'SEO Expert' &&
            workspaceJd !== 'Developer' ? (
              <RoleDeliverableWorkspace
                badge={meta.badge}
                title={meta.notesTitle || meta.primaryLabel}
                hint={meta.notesHint}
                taskNotes={taskNotes}
              />
            ) : null}
          </>
        )}
      </section>
    </TechTeamShell>
  );
}
