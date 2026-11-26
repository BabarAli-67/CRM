import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { getMyPriorityProjects } from '../../services/handover.service.js';
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

export default function PriorityTasksPage() {
  const { user } = useAuth();
  const workspaceJd = resolveTechWorkspaceJd(user);
  const workspaceMeta = getWorkspaceMeta(workspaceJd);

  const [search, setSearch] = useState('');
  const [service, setService] = useState('');
  const [projectStatus, setProjectStatus] = useState('');
  const [clientOpsStatus, setClientOpsStatus] = useState('');

  const {
    data: projects = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['myPriorityProjects'],
    queryFn: getMyPriorityProjects,
    refetchInterval: 15_000,
  });

  const hasActiveFilters = Boolean(
    search.trim() || service || projectStatus || clientOpsStatus
  );

  const rows = useMemo(
    () =>
      projects.filter(
        (project) =>
          matchesTechSearch(project, search) &&
          matchesTechService(project, service) &&
          matchesProjectStatus(project, projectStatus) &&
          matchesClientOpsStatus(project, clientOpsStatus)
      ),
    [projects, search, service, projectStatus, clientOpsStatus]
  );

  const resetFilters = () => {
    setSearch('');
    setService('');
    setProjectStatus('');
    setClientOpsStatus('');
  };

  return (
    <TechTeamShell title="Priority Task">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            Priority Task
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Your active priority assignments · newest priority first
          </p>
        </div>

        <TechProjectsFilterBar
          search={search}
          onSearchChange={setSearch}
          service={service}
          onServiceChange={setService}
          serviceOptions={TECH_SERVICE_FILTER_OPTIONS}
          status={projectStatus}
          onStatusChange={setProjectStatus}
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
            {error?.response?.data?.message ||
              'Failed to load priority projects.'}
          </p>
        ) : projects.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No priority tasks assigned to you.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No projects match the current filters.
          </p>
        ) : (
          <ul className="space-y-5">
            {rows.map((project) => {
              const waitingForDeveloper = Boolean(
                project.waitingForDeveloper || project.seoActionsLocked
              );
              const waitingNote =
                'Waiting for Developer to push to Ongoing (SEO)';

              return (
                <li
                  key={project._id}
                  className="rounded-xl border border-amber-500/25 bg-zinc-900/40 p-5"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ProjectNumberBadge lead={project} size="lg" />
                        <Link
                          to={techTeamClientPath(project._id, {
                            from: 'priority',
                          })}
                          className="cursor-pointer font-display text-lg font-semibold text-white underline-offset-2 transition hover:text-orange-300 hover:underline"
                        >
                          {project.businessName || '—'}
                        </Link>
                        <PriorityPill lead={project} />
                        {waitingForDeveloper ? (
                          <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300/90 ring-1 ring-amber-500/25">
                            Waiting on Developer
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        Priority since{' '}
                        {formatPkt(project.handover?.priorityAssignedAt)}
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
                                from: 'priority',
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
                            from: 'priority',
                            tab: 'comments',
                          })}
                          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                        >
                          Comments
                        </Link>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {workspaceJd !== 'Developer' ? (
                        <DevelopedWebsiteLink
                          url={project.handover?.developedWebsiteUrl}
                        />
                      ) : null}
                    </div>
                  </div>

                  {workspaceJd === 'Developer' ? (
                    <div className="mb-4">
                      <DevelopedWebsiteUrlField
                        leadId={project._id}
                        value={project.handover?.developedWebsiteUrl || ''}
                      />
                    </div>
                  ) : null}

                  <MilestoneStepper
                    leadId={project._id}
                    status={
                      project.handover?.techStatus ||
                      project.handover?.cstStatus ||
                      'assigned'
                    }
                    developerHandoffOnly={workspaceJd === 'Developer'}
                    seoStatusActions={workspaceJd === 'SEO Expert'}
                    actionsDisabled={waitingForDeveloper}
                    disabledNote=""
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </TechTeamShell>
  );
}
