import { useQuery } from '@tanstack/react-query';
import MilestoneStepper from '../../components/handover/MilestoneStepper.jsx';
import TechTeamShell from '../../components/tech-team/TechTeamShell.jsx';
import { getMyProjects } from '../../services/handover.service.js';
import { formatPaymentSummary } from '../../utils/formatPayment.util.js';

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
  if (!href) return null;
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
  if (children == null || children === '') return null;
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-zinc-300">{children}</dd>
    </div>
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
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            My projects
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Assigned to you only · Assigned → In Progress → Completed
          </p>
        </div>

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load projects.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No projects assigned to you yet.
          </p>
        ) : (
          <ul className="space-y-5">
            {rows.map((project) => {
              const links = [
                <ExternalLink
                  key="yelp"
                  href={project.yelpLink}
                  label="Yelp"
                />,
                <ExternalLink
                  key="web"
                  href={project.websiteLink}
                  label="Website"
                />,
                <ExternalLink key="gmb" href={project.gmbLink} label="GMB" />,
              ].filter(Boolean);

              return (
                <li
                  key={project._id}
                  className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5 transition-all hover:border-zinc-700/60"
                >
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-semibold text-white">
                        {project.businessName}
                      </h3>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        Assigned {formatPkt(project.handover?.assignedAt)}
                        {project.phone ? ` · ${project.phone}` : ''}
                      </p>
                    </div>
                    {links.length > 0 ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        {links}
                      </div>
                    ) : null}
                  </div>

                  <dl className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Detail label="Client">{project.clientName}</Detail>
                    <Detail label="Work email">{project.workEmail}</Detail>
                    <Detail label="Personal email">
                      {project.personalEmail}
                    </Detail>
                    <Detail label="Package / amount">
                      {project.salesAmount != null
                        ? `$${Number(project.salesAmount).toLocaleString()}`
                        : null}
                    </Detail>
                    <Detail label="Services">{project.serviceOffered}</Detail>
                    <Detail label="Service area">
                      {project.servicesArea}
                    </Detail>
                    <Detail label="Payment">
                      {formatPaymentSummary(project.payment)}
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

                  <MilestoneStepper
                    leadId={project._id}
                    status={
                      project.handover?.techStatus ||
                      project.handover?.cstStatus ||
                      'assigned'
                    }
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
