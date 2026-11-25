import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import MilestoneStepper from '../../components/handover/MilestoneStepper.jsx';
import OpsStatusBadges from '../../components/ops/OpsStatusBadges.jsx';
import ProjectNumberBadge from '../../components/tech/ProjectNumberBadge.jsx';
import TechProjectsFilterBar from '../../components/tech/TechProjectsFilterBar.jsx';
import TechTeamShell from '../../components/tech-team/TechTeamShell.jsx';
import useAuth from '../../hooks/useAuth.hook.js';
import { getMyProjects } from '../../services/handover.service.js';
import {
  CLIENT_OPS_FILTER_OPTIONS,
  TECH_PROJECT_STATUS_OPTIONS,
  TECH_SERVICE_FILTER_OPTIONS,
  matchesClientOpsStatus,
  matchesProjectStatus,
  matchesTechSearch,
  matchesTechService,
} from '../../utils/techProjectFilters.util.js';
import {
  clientPathForTab,
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
    queryKey: ['myProjects'],
    queryFn: getMyProjects,
    refetchInterval: 30_000,
  });

  const hasActiveFilters = Boolean(
    search.trim() || service || projectStatus || clientOpsStatus
  );

  const rows = useMemo(() => {
    const sorted = [...projects].sort((a, b) => {
      const aAt = new Date(a.handover?.assignedAt || 0).getTime();
      const bAt = new Date(b.handover?.assignedAt || 0).getTime();
      return aAt - bAt;
    });
    return sorted.filter(
      (project) =>
        matchesTechSearch(project, search) &&
        matchesTechService(project, service) &&
        matchesProjectStatus(project, projectStatus) &&
        matchesClientOpsStatus(project, clientOpsStatus)
    );
  }, [projects, search, service, projectStatus, clientOpsStatus]);

  const resetFilters = () => {
    setSearch('');
    setService('');
    setProjectStatus('');
    setClientOpsStatus('');
  };

  return (
    <TechTeamShell title="My Projects">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            My projects
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Assigned to you by Tech Head · work fields only (no billing)
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
          statusOptions={TECH_PROJECT_STATUS_OPTIONS}
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
            No projects assigned to you yet.
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

              return (
                <li
                  key={project._id}
                  className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5 transition-all hover:border-zinc-700/60"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ProjectNumberBadge lead={project} size="lg" />
                        <h3 className="font-display text-lg font-semibold text-white">
                          {project.businessName || '—'}
                        </h3>
                        {Number(project.unreadCommentCount) > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-[#F25E26]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#F25E26] ring-1 ring-[#F25E26]/40">
                            {Number(project.unreadCommentCount) === 1
                              ? '1 New Comment'
                              : `${Number(project.unreadCommentCount)} New Comments`}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        Assigned {formatPkt(project.handover?.assignedAt)}
                      </p>
                      <OpsStatusBadges
                        handover={project.handover}
                        className="mt-2"
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {workspaceMeta.cardPrimaryLabel ? (
                          <Link
                            to={clientPathForTab(
                              project._id,
                              workspaceMeta.cardPrimaryTab,
                              workspaceJd
                            )}
                            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
                          >
                            {workspaceMeta.cardPrimaryLabel}
                          </Link>
                        ) : null}
                        <Link
                          to={`/dashboard/tech-team/client/${project._id}?tab=comments`}
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
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      <ExternalLink href={project.websiteLink} label="Website" />
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

                  {Array.isArray(project.handover?.techTaskNotes) &&
                  project.handover.techTaskNotes.length > 0 ? (
                    <div className="mb-4 space-y-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Task notes from Tech Head
                      </p>
                      {project.handover.techTaskNotes.map((note) => (
                        <div
                          key={note.noteId}
                          className="rounded-lg border border-orange-500/25 bg-orange-500/5 px-3 py-2.5"
                        >
                          <p className="whitespace-pre-wrap text-sm text-zinc-200">
                            {note.body}
                          </p>
                          {note.guidance ? (
                            <p className="mt-1.5 text-xs text-orange-200/90">
                              Guidance: {note.guidance}
                            </p>
                          ) : null}
                          <p className="mt-1 text-[11px] text-zinc-500">
                            From {note.createdByName || 'Tech Head'} ·{' '}
                            {formatPkt(note.createdAt)}
                          </p>
                        </div>
                      ))}
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
