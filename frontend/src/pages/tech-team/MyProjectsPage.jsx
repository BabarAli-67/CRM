import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import MilestoneStepper from '../../components/handover/MilestoneStepper.jsx';
import OpsStatusBadges from '../../components/ops/OpsStatusBadges.jsx';
import DevelopedWebsiteUrlField, {
  DevelopedWebsiteLink,
} from '../../components/tech/DevelopedWebsiteUrlField.component.jsx';
import ProjectNumberBadge from '../../components/tech/ProjectNumberBadge.jsx';
import { PriorityPill } from '../../components/tech/PriorityToggleButton.component.jsx';
import TechProjectsFilterBar from '../../components/tech/TechProjectsFilterBar.jsx';
import TechTeamShell from '../../components/tech-team/TechTeamShell.jsx';
import useAuth from '../../hooks/useAuth.hook.js';
import {
  getMyCompletedProjects,
  getMyProjects,
  getMyTaskStats,
} from '../../services/handover.service.js';
import {
  CLIENT_OPS_FILTER_OPTIONS,
  TECH_LIVE_STATUS_OPTIONS,
  TECH_SERVICE_FILTER_OPTIONS,
  matchesClientOpsStatus,
  matchesProjectStatus,
  matchesTechSearch,
  matchesTechService,
} from '../../utils/techProjectFilters.util.js';
import { techTeamClientPath } from '../../utils/techDetailNav.util.js';
import {
  getWorkspaceMeta,
  resolveTechWorkspaceJd,
} from '../../utils/techWorkspace.util.js';

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

function ExternalLink({ href, label }) {
  if (!href?.trim()) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-orange-400 hover:text-orange-300 hover:underline"
    >
      {label}
    </a>
  );
}

function Detail({ label, children }) {
  const empty =
    children == null || children === '' || children === false;
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-zinc-300">
        {empty ? '—' : children}
      </dd>
    </div>
  );
}

/** Tech-safe project card — never shows pricing / payment / balances. */
export default function MyProjectsPage() {
  const { user } = useAuth();
  const workspaceJd = resolveTechWorkspaceJd(user);
  const workspaceMeta = getWorkspaceMeta(workspaceJd);
  const [searchParams, setSearchParams] = useSearchParams();
  const view =
    searchParams.get('view') === 'completed' ? 'completed' : 'active';

  const [search, setSearch] = useState('');
  const [service, setService] = useState('');
  const [projectStatus, setProjectStatus] = useState('');
  const [clientOpsStatus, setClientOpsStatus] = useState('');

  const {
    data: activeProjects = [],
    isLoading: activeLoading,
    isError: activeError,
    error: activeErr,
  } = useQuery({
    queryKey: ['myProjects'],
    queryFn: getMyProjects,
    refetchInterval: 30_000,
  });

  const {
    data: completedProjects = [],
    isLoading: completedLoading,
    isError: completedError,
    error: completedErr,
  } = useQuery({
    queryKey: ['myCompletedProjects'],
    queryFn: getMyCompletedProjects,
    refetchInterval: 30_000,
  });

  const { data: taskStats } = useQuery({
    queryKey: ['myTaskStats'],
    queryFn: getMyTaskStats,
    refetchInterval: 30_000,
  });

  const projects = view === 'completed' ? completedProjects : activeProjects;
  const isLoading = view === 'completed' ? completedLoading : activeLoading;
  const isError = view === 'completed' ? completedError : activeError;
  const error = view === 'completed' ? completedErr : activeErr;

  const hasActiveFilters = Boolean(
    search.trim() || service || projectStatus || clientOpsStatus
  );

  const rows = useMemo(() => {
    // Newest assignment / completion first (API already sorts; keep stable client-side)
    const sorted = [...projects].sort((a, b) => {
      const ts = (p) =>
        view === 'completed'
          ? new Date(
              p.completedAt ||
                p.handover?.completedAt ||
                p.handover?.assignedAt ||
                p.createdAt ||
                0
            ).getTime()
          : new Date(
              p.handover?.assignedAt || p.createdAt || 0
            ).getTime();
      return ts(b) - ts(a);
    });
    return sorted.filter(
      (project) =>
        matchesTechSearch(project, search) &&
        matchesTechService(project, service) &&
        (view === 'completed' ||
          matchesProjectStatus(project, projectStatus)) &&
        matchesClientOpsStatus(project, clientOpsStatus)
    );
  }, [projects, search, service, projectStatus, clientOpsStatus, view]);

  const resetFilters = () => {
    setSearch('');
    setService('');
    setProjectStatus('');
    setClientOpsStatus('');
  };

  const selectView = (next) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'completed') p.set('view', 'completed');
        else p.delete('view');
        return p;
      },
      { replace: true }
    );
  };

  return (
    <TechTeamShell title="My Projects">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            My projects
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Assigned to you by Tech Head · work fields only (no billing) · newest
            first
          </p>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: 'Total Tasks',
              value: taskStats?.totalTasks ?? 0,
            },
            {
              label: 'Tasks Pending',
              value: taskStats?.tasksPending ?? 0,
            },
            {
              label: 'Tasks Completed',
              value: taskStats?.tasksCompleted ?? 0,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {stat.label}
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-white">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div
          role="tablist"
          aria-label="Project views"
          className="mb-5 flex flex-wrap gap-1 rounded-xl border border-zinc-800/80 bg-[#111111] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'active'}
            onClick={() => selectView('active')}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              view === 'active'
                ? 'bg-[#F25E26]/15 text-[#F25E26] ring-1 ring-[#F25E26]/40'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
            }`}
          >
            Active
            <span className="ml-1.5 text-xs opacity-80">
              ({activeProjects.length})
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'completed'}
            onClick={() => selectView('completed')}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              view === 'completed'
                ? 'bg-[#F25E26]/15 text-[#F25E26] ring-1 ring-[#F25E26]/40'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
            }`}
          >
            Completed
            <span className="ml-1.5 text-xs opacity-80">
              ({completedProjects.length})
            </span>
          </button>
        </div>

        <TechProjectsFilterBar
          search={search}
          onSearchChange={setSearch}
          service={service}
          onServiceChange={setService}
          serviceOptions={TECH_SERVICE_FILTER_OPTIONS}
          status={view === 'active' ? projectStatus : undefined}
          onStatusChange={view === 'active' ? setProjectStatus : undefined}
          statusOptions={TECH_LIVE_STATUS_OPTIONS}
          statusLabel="Project Status"
          clientOpsStatus={clientOpsStatus}
          onClientOpsStatusChange={setClientOpsStatus}
          clientOpsOptions={CLIENT_OPS_FILTER_OPTIONS}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load projects.'}
          </p>
        ) : projects.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            {view === 'completed'
              ? 'No completed projects yet.'
              : 'No projects assigned to you yet.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No projects match the current filters.
          </p>
        ) : (
          <ul className="space-y-5">
            {rows.map((project) => {
              const upsellLabels = (project.upsells || [])
                .map((u) => u.title || u.serviceOther || u.service)
                .filter(Boolean);
              const social = String(project.socialLinks || '').trim();
              const waitingForDeveloper = Boolean(
                project.waitingForDeveloper || project.seoActionsLocked
              );
              const waitingNote =
                'Waiting for Developer to push to Ongoing (SEO)';

              return (
                <li
                  key={project._id}
                  className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5 transition-all hover:border-zinc-700/60"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ProjectNumberBadge lead={project} size="lg" />
                        <Link
                          to={techTeamClientPath(project._id, {
                            from:
                              view === 'completed' ? 'completed' : 'projects',
                          })}
                          className="cursor-pointer font-display text-lg font-semibold text-white underline-offset-2 transition hover:text-orange-300 hover:underline"
                        >
                          {project.businessName || '—'}
                        </Link>
                        <PriorityPill lead={project} />
                        {view === 'completed' ? (
                          <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 ring-1 ring-emerald-500/35">
                            {project.completedReason || 'Completed'}
                          </span>
                        ) : null}
                        {waitingForDeveloper && view === 'active' ? (
                          <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300/90 ring-1 ring-amber-500/25">
                            Waiting on Developer
                          </span>
                        ) : null}
                        {Number(project.unreadCommentCount) > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-[#F25E26]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#F25E26] ring-1 ring-[#F25E26]/40">
                            {Number(project.unreadCommentCount) === 1
                              ? '1 New Comment'
                              : `${Number(project.unreadCommentCount)} New Comments`}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {view === 'completed'
                          ? `Finished ${formatPkt(project.completedAt)}`
                          : `Assigned ${formatPkt(project.handover?.assignedAt)}`}
                      </p>
                      <OpsStatusBadges
                        handover={project.handover}
                        className="mt-2"
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {workspaceMeta.cardPrimaryLabel ? (
                          waitingForDeveloper ? (
                            <span
                              title={waitingNote}
                              aria-disabled="true"
                              className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-orange-500/40 px-4 py-2 text-sm font-medium text-white/70"
                            >
                              {workspaceMeta.cardPrimaryLabel}
                            </span>
                          ) : (
                            <Link
                              to={techTeamClientPath(project._id, {
                                from:
                                  view === 'completed'
                                    ? 'completed'
                                    : 'projects',
                                tab: workspaceMeta.cardPrimaryTab || undefined,
                              })}
                              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
                            >
                              {workspaceMeta.cardPrimaryLabel}
                            </Link>
                          )
                        ) : null}
                        <Link
                          to={techTeamClientPath(project._id, {
                            from:
                              view === 'completed' ? 'completed' : 'projects',
                            tab: 'comments',
                          })}
                          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                        >
                          Comments
                          {Number(project.unreadCommentCount) > 0 ? (
                            <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[#F25E26]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#F25E26]">
                              {Number(project.unreadCommentCount)}
                            </span>
                          ) : null}
                        </Link>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 text-sm">
                      {workspaceJd !== 'SEO Expert' ? (
                        <ExternalLink
                          href={project.websiteLink}
                          label="Website"
                        />
                      ) : null}
                      {workspaceJd !== 'Developer' ? (
                        <DevelopedWebsiteLink
                          url={project.handover?.developedWebsiteUrl}
                        />
                      ) : null}
                    </div>
                  </div>

                  <dl className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Detail label="Service Areas">
                      {project.serviceAreas}
                    </Detail>
                    <Detail label="Services Offered">
                      {project.servicesOffered}
                    </Detail>
                    <Detail label="Upsell Services">
                      {upsellLabels.length ? upsellLabels.join(', ') : '—'}
                    </Detail>
                    <Detail label="Upsell Notes">
                      {project.upsellNotes ||
                        project.handover?.upscaleNotes ||
                        '—'}
                    </Detail>
                    <Detail label="Social Links">
                      {social ? (
                        <span className="whitespace-pre-wrap">{social}</span>
                      ) : (
                        '—'
                      )}
                    </Detail>
                    <Detail label="Website">
                      {project.websiteLink ? (
                        <a
                          href={project.websiteLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-orange-400 hover:underline"
                        >
                          Open website
                        </a>
                      ) : (
                        '—'
                      )}
                    </Detail>
                  </dl>

                  {project.handover?.onboardingNotes ? (
                    <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Onboarding notes
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
                        {project.handover.onboardingNotes}
                      </p>
                    </div>
                  ) : null}

                  {workspaceJd === 'Developer' && view === 'active' ? (
                    <div className="mb-4">
                      <DevelopedWebsiteUrlField
                        leadId={project._id}
                        value={project.handover?.developedWebsiteUrl || ''}
                      />
                    </div>
                  ) : null}

                  {view === 'active' ? (
                    <MilestoneStepper
                      leadId={project._id}
                      status={
                        project.handover?.techStatus ||
                        project.handover?.cstStatus ||
                        'assigned'
                      }
                      developerHandoffOnly={workspaceJd === 'Developer'}
                      actionsDisabled={waitingForDeveloper}
                      disabledNote=""
                    />
                  ) : (
                    <p className="text-xs text-zinc-500">
                      Read-only completed record · open Work & Reports or
                      Comments for details
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </TechTeamShell>
  );
}
