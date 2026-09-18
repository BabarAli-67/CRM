import { useQuery } from '@tanstack/react-query';
import MilestoneStepper from '../../components/handover/MilestoneStepper.jsx';
import TechTeamShell from '../../components/tech-team/TechTeamShell.jsx';
import { getMyProjects } from '../../services/handover.service.js';

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
  if (!href) return <span className="text-zinc-600">—</span>;
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

export default function MyProjectsPage() {
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

  const rows = [...projects].sort((a, b) => {
    const aAt = new Date(a.handover?.assignedAt || 0).getTime();
    const bAt = new Date(b.handover?.assignedAt || 0).getTime();
    return aAt - bAt;
  });

  return (
    <TechTeamShell title="My Projects">
      <section className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold text-white">
            Assigned projects
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Advance milestones one step at a time · Assigned → In Progress →
            Completed
          </p>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load projects.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            No projects assigned yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {rows.map((project) => (
              <li
                key={project._id}
                className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 hover:border-zinc-700/60 transition-all"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-white">
                      {project.businessName}
                    </h3>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      Assigned {formatPkt(project.handover?.assignedAt)}
                      {project.phone ? ` · ${project.phone}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    <ExternalLink href={project.yelpLink} label="Yelp" />
                    <ExternalLink href={project.websiteLink} label="Website" />
                    <ExternalLink href={project.gmbLink} label="GMB" />
                  </div>
                </div>

                <MilestoneStepper
                  leadId={project._id}
                  status={project.handover?.cstStatus || 'assigned'}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </TechTeamShell>
  );
}
