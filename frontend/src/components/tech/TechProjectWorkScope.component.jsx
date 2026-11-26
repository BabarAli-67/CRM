import { DevelopedWebsiteLink } from './DevelopedWebsiteUrlField.component.jsx';

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

/**
 * Read-only work / service scope block for Tech Project Detail screens.
 * Never includes billing, phone, or email.
 */
export default function TechProjectWorkScope({
  lead,
  showAssignees = false,
}) {
  if (!lead) return null;

  const upsellLabels = (lead.upsells || [])
    .map((u) => u.title || u.serviceOther || u.service)
    .filter(Boolean);
  const social = String(lead.socialLinks || '').trim();
  const assignees = Array.isArray(lead.handover?.assignedTechIds)
    ? lead.handover.assignedTechIds
    : lead.handover?.assignedTechId
      ? [lead.handover.assignedTechId]
      : [];

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 shadow-xl sm:p-6">
      <h2 className="font-display text-lg font-semibold text-white">
        Work &amp; Service Scope
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Work fields only · billing and personal contacts hidden
      </p>

      {showAssignees ? (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Assigned specialists
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {assignees.length ? (
              assignees.map((t) => {
                const id = typeof t === 'object' ? t._id : t;
                const name =
                  typeof t === 'object'
                    ? t.fullName || t.username || 'Specialist'
                    : 'Specialist';
                const jd = typeof t === 'object' ? t.jd : null;
                return (
                  <span
                    key={String(id)}
                    className="inline-flex items-center rounded-full border border-[#F25E26]/35 bg-[#F25E26]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#F25E26]"
                  >
                    {name}
                    {jd ? ` · ${jd}` : ''}
                  </span>
                );
              })
            ) : (
              <span className="text-sm text-zinc-500">No specialists</span>
            )}
          </div>
        </div>
      ) : null}

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Service Areas">{lead.serviceAreas}</Detail>
        <Detail label="Services Offered">{lead.servicesOffered}</Detail>
        <Detail label="Upsell Services">
          {upsellLabels.length ? upsellLabels.join(', ') : '—'}
        </Detail>
        <Detail label="Upsell Notes">
          {lead.upsellNotes || lead.handover?.upscaleNotes || '—'}
        </Detail>
        <Detail label="Social Links">
          {social ? <span className="whitespace-pre-wrap">{social}</span> : '—'}
        </Detail>
        <Detail label="Website">
          {lead.websiteLink ? (
            <a
              href={lead.websiteLink}
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
        <Detail label="Website Developed By Us">
          {lead.handover?.developedWebsiteUrl ? (
            <DevelopedWebsiteLink url={lead.handover.developedWebsiteUrl} />
          ) : (
            '—'
          )}
        </Detail>
      </dl>

      {lead.handover?.onboardingNotes ? (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Onboarding notes
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">
            {lead.handover.onboardingNotes}
          </p>
        </div>
      ) : null}
    </section>
  );
}

const PROJECT_STATUS_LABEL = {
  onboarded: 'Unassigned',
  assigned: 'Pending',
  in_progress: 'In Progress',
  ongoing_seo: 'Ongoing (SEO)',
  completed: 'Completed',
};

export function resolveProjectStatusLabel(lead) {
  if (lead?.statusLabel) return lead.statusLabel;
  const key = lead?.handover?.techStatus || lead?.handover?.cstStatus || '';
  return PROJECT_STATUS_LABEL[key] || key || '—';
}
