import DevelopedWebsiteUrlField, {
  DevelopedWebsiteLink,
} from './DevelopedWebsiteUrlField.component.jsx';
import LivePortfolioSection, {
  mapKeywordsFromLead,
} from '../portfolio/LivePortfolioSection.jsx';
import { opsStatusBadgeClass } from '../../utils/opsStatus.util.js';

const WEBSITE_STATUS_LABEL = {
  pending: 'Pending',
  in_progress: 'In Progress',
  handed_to_seo: 'Handed over to SEO',
  completed: 'Completed',
};

const SEO_STATUS_LABEL = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const WEBSITE_STEPS = [
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'handed_to_seo', label: 'Handed over to SEO' },
  { key: 'completed', label: 'Completed' },
];

const SEO_STEPS = [
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

const statusTone = (status) => {
  if (status === 'completed' || status === 'handed_to_seo') {
    return opsStatusBadgeClass('Verified');
  }
  if (status === 'in_progress') return opsStatusBadgeClass('In Progress');
  return opsStatusBadgeClass('Pending');
};

function LaneTimeline({ steps, current }) {
  const idx = Math.max(
    0,
    steps.findIndex((s) => s.key === current)
  );
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-2">
      {steps.map((step, i) => {
        const done = i < idx || (current === 'completed' && i <= idx);
        const active = i === idx && current !== 'completed';
        return (
          <li key={step.key} className="flex items-center gap-2">
            {i > 0 ? (
              <span
                className={`hidden h-px w-5 sm:block ${
                  i <= idx ? 'bg-orange-500/70' : 'bg-zinc-700'
                }`}
                aria-hidden
              />
            ) : null}
            <span
              className={[
                'inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset',
                done
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                  : active
                    ? 'bg-orange-600/20 text-orange-200 ring-orange-500/40'
                    : 'bg-zinc-800/60 text-zinc-500 ring-zinc-700/60',
              ].join(' ')}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AssigneesRow({ people }) {
  if (!people?.length) {
    return <p className="mt-2 text-xs text-zinc-500">No specialist assigned</p>;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {people.map((t) => {
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
      })}
    </div>
  );
}

function filterAssigneesByJd(lead, jd) {
  const multi = Array.isArray(lead?.handover?.assignedTechIds)
    ? lead.handover.assignedTechIds
    : [];
  const legacy = lead?.handover?.assignedTechId;
  const list = [...multi];
  if (legacy) {
    const lid =
      typeof legacy === 'object' ? String(legacy._id) : String(legacy);
    if (
      !list.some(
        (u) => String(typeof u === 'object' ? u?._id : u) === lid
      )
    ) {
      list.push(legacy);
    }
  }
  return list.filter(
    (u) => u && typeof u === 'object' && String(u.jd || '') === jd
  );
}

/**
 * Separate Website vs SEO work lanes for Project Detail screens.
 */
export default function TechWorkLanePanels({
  lead,
  keywords,
  setKeywords,
  onLeadUpdated,
  showWebsiteEditor = false,
  showSeoEditor = false,
  seoActionsLocked = false,
  seoLockedReason = '',
  showAssignees = true,
  /** 'both' | 'website' | 'seo' */
  lanes = 'both',
}) {
  if (!lead) return null;

  // Prefer explicit lane flags from API; fall back to services / assignees
  let showWebsite =
    lead.handover?.hasWebsiteLane === true ||
    (lead.handover?.hasWebsiteLane == null &&
      (Boolean(lead.handover?.websiteStatus) ||
        /website\s*develop|web\s*develop/i.test(
          `${lead.servicesOffered || ''} ${lead.serviceAreas || ''}`
        ) ||
        filterAssigneesByJd(lead, 'Developer').length > 0));

  let showSeo =
    lead.handover?.hasSeoLane === true ||
    (lead.handover?.hasSeoLane == null &&
      (Boolean(lead.handover?.seoStatus) ||
        /\bseo\b|\bgmb\b|google my business/i.test(
          `${lead.servicesOffered || ''} ${lead.serviceAreas || ''}`
        ) ||
        filterAssigneesByJd(lead, 'SEO Expert').length > 0 ||
        Boolean(lead.gmbLink)));

  if (lanes === 'website') showSeo = false;
  if (lanes === 'seo') showWebsite = false;

  if (!showWebsite && !showSeo) return null;

  const websiteStatus = lead.handover?.websiteStatus || 'pending';
  const seoStatus = lead.handover?.seoStatus || 'pending';
  const developers = filterAssigneesByJd(lead, 'Developer');
  const seoExperts = filterAssigneesByJd(lead, 'SEO Expert');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {showWebsite ? (
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Website
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Website Development lane · independent of SEO
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusTone(
                websiteStatus
              )}`}
            >
              {WEBSITE_STATUS_LABEL[websiteStatus] || websiteStatus}
            </span>
          </div>

          <LaneTimeline steps={WEBSITE_STEPS} current={websiteStatus} />

          {showAssignees ? (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Assigned Developer
              </p>
              <AssigneesRow people={developers} />
            </div>
          ) : null}

          <dl className="mt-4 grid gap-3">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Original Website
              </dt>
              <dd className="mt-0.5 text-sm text-zinc-300">
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
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Website Developed By Us
              </dt>
              <dd className="mt-0.5 text-sm text-zinc-300">
                {lead.handover?.developedWebsiteUrl ? (
                  <DevelopedWebsiteLink
                    url={lead.handover.developedWebsiteUrl}
                  />
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>

          {showWebsiteEditor ? (
            <div className="mt-4">
              <DevelopedWebsiteUrlField
                leadId={lead._id}
                value={lead.handover?.developedWebsiteUrl || ''}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {showSeo ? (
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 shadow-xl lg:col-span-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                SEO
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                SEO / GMB lane · independent of Website build
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusTone(
                seoStatus
              )}`}
            >
              {SEO_STATUS_LABEL[seoStatus] || seoStatus}
            </span>
          </div>

          <LaneTimeline steps={SEO_STEPS} current={seoStatus} />

          {showAssignees ? (
            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Assigned SEO Expert
              </p>
              <AssigneesRow people={seoExperts} />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            {lead.handover?.gmbOpsStatus ? (
              <span className="inline-flex flex-col gap-0.5">
                <span className="uppercase tracking-wide text-zinc-500">
                  GMB Status
                </span>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 font-semibold ${opsStatusBadgeClass(
                    lead.handover.gmbOpsStatus
                  )}`}
                >
                  {lead.handover.gmbOpsStatus}
                </span>
              </span>
            ) : null}
            {lead.handover?.websiteSeoOpsStatus ? (
              <span className="inline-flex flex-col gap-0.5">
                <span className="uppercase tracking-wide text-zinc-500">
                  Website SEO Status
                </span>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 font-semibold ${opsStatusBadgeClass(
                    lead.handover.websiteSeoOpsStatus
                  )}`}
                >
                  {lead.handover.websiteSeoOpsStatus}
                </span>
              </span>
            ) : null}
            {lead.handover?.keywordsRankedConfirmation?.confirmed ? (
              <span className="inline-flex flex-col gap-0.5">
                <span className="uppercase tracking-wide text-zinc-500">
                  Keywords Ranked
                </span>
                <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 font-semibold text-emerald-300">
                  Confirmed
                </span>
              </span>
            ) : null}
          </div>

          {showSeoEditor ? (
            <div className="mt-4">
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
                actionsLocked={seoActionsLocked}
                lockedReason={seoLockedReason}
                onLeadUpdated={onLeadUpdated}
              />
            </div>
          ) : keywords?.length ? (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Portfolio Keywords
              </p>
              <ul className="mt-2 space-y-1.5">
                {(keywords.length
                  ? keywords
                  : mapKeywordsFromLead(lead)
                ).map((kw) => (
                  <li
                    key={kw.keywordId || kw.text}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-zinc-300"
                  >
                    <span>{kw.text || '—'}</span>
                    <span className="text-xs text-zinc-500">
                      {kw.position?.trim() || 'Not Ranked'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export { WEBSITE_STATUS_LABEL, SEO_STATUS_LABEL };
