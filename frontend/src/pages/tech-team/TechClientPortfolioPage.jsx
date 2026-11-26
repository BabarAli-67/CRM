import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CstClientComments from '../../components/cst-manager/CstClientComments.jsx';
import OpsStatusBadges from '../../components/ops/OpsStatusBadges.jsx';
import LivePortfolioSection, {
  mapKeywordsFromLead,
} from '../../components/portfolio/LivePortfolioSection.jsx';
import DevelopedWebsiteUrlField from '../../components/tech/DevelopedWebsiteUrlField.component.jsx';
import ProjectNumberBadge from '../../components/tech/ProjectNumberBadge.jsx';
import { PriorityPill } from '../../components/tech/PriorityToggleButton.component.jsx';
import TechProjectWorkScope, {
  resolveProjectStatusLabel,
} from '../../components/tech/TechProjectWorkScope.component.jsx';
import {
  DeveloperMockupPanel,
  RoleDeliverableWorkspace,
} from '../../components/tech-team/JdWorkspacePanels.jsx';
import TechTeamShell from '../../components/tech-team/TechTeamShell.jsx';
import useAuth from '../../hooks/useAuth.hook.js';
import { getLeadById } from '../../services/lead.service.js';
import { resolveTechTeamBackNav } from '../../utils/techDetailNav.util.js';
import { opsStatusBadgeClass } from '../../utils/opsStatus.util.js';
import { projectTitle } from '../../utils/projectNumber.util.js';
import {
  getClientTabsForJd,
  getWorkspaceMeta,
  resolveClientTab,
  resolveTechWorkspaceJd,
} from '../../utils/techWorkspace.util.js';

/**
 * JD-routed Tech client project detail — work scope + role workspace + Comments.
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
  const backNav = resolveTechTeamBackNav(searchParams.get('from'));

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
    queryClient.invalidateQueries({ queryKey: ['myPriorityProjects'] });
    queryClient.invalidateQueries({ queryKey: ['commentNotifications'] });
    if (updated) {
      setKeywords(mapKeywordsFromLead(updated));
    }
  };

  const unread = Number(lead?.unreadCommentCount) || 0;
  const waitingForDeveloper = Boolean(
    lead?.waitingForDeveloper || lead?.seoActionsLocked
  );
  const waitingNote = 'Waiting for Developer to push to Ongoing (SEO)';
  const statusLabel = resolveProjectStatusLabel(lead);
  const clientLifecycle = lead?.handover?.clientStatus || 'Active';

  return (
    <TechTeamShell title="Project Detail">
      <section className="mx-auto w-full max-w-7xl space-y-6">
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
              <div className="flex flex-wrap items-center gap-2">
                <ProjectNumberBadge lead={lead} size="lg" />
                <span className="inline-flex rounded-full border border-[#F25E26]/40 bg-[#F25E26]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#F25E26]">
                  {meta.badge}
                </span>
                <PriorityPill lead={lead} />
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300 ring-1 ring-zinc-600">
                  {statusLabel}
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
              <div className="mt-3 flex flex-wrap gap-3">
                <span className="inline-flex max-w-full flex-col items-start gap-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Client Status
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${opsStatusBadgeClass(
                      clientLifecycle === 'Expired' ? 'Suspended' : 'Verified'
                    )}`}
                  >
                    {clientLifecycle}
                  </span>
                </span>
                <OpsStatusBadges handover={lead.handover} />
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Work fields only · billing hidden from Tech · statuses set by
                Tech Head
              </p>
              {waitingForDeveloper ? (
                <p className="mt-2 text-xs text-amber-400/90">{waitingNote}</p>
              ) : null}
            </div>

            <TechProjectWorkScope lead={lead} />

            {workspaceJd === 'Developer' ? (
              <DevelopedWebsiteUrlField
                leadId={lead._id}
                value={lead.handover?.developedWebsiteUrl || ''}
              />
            ) : null}

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
                keywordsRankedConfirmation={
                  lead.handover?.keywordsRankedConfirmation || null
                }
                showConfirmKeywordsRanked
                actionsLocked={waitingForDeveloper}
                lockedReason={waitingNote}
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
              />
            ) : null}
          </>
        )}
      </section>
    </TechTeamShell>
  );
}
