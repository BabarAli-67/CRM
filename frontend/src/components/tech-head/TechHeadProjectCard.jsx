import { Link } from 'react-router-dom';
import OpsStatusEditor from '../ops/OpsStatusEditor.jsx';
import { DevelopedWebsiteLink } from '../tech/DevelopedWebsiteUrlField.component.jsx';
import ProjectNumberBadge from '../tech/ProjectNumberBadge.jsx';
import { techHeadClientPath } from '../../utils/techDetailNav.util.js';

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

/**
 * Structured Tech Head project card (Assigned / Completed) — mirrors Incoming Queue layout.
 * Work fields only; never billing / phone / email / GMB link.
 */
export default function TechHeadProjectCard({
  lead,
  statusText,
  metaLine,
  headerExtra = null,
  actions = null,
  showOpsEditor = true,
  onOpsUpdated,
  detailFrom = 'assigned',
}) {
  const assignees = Array.isArray(lead.handover?.assignedTechIds)
    ? lead.handover.assignedTechIds
    : lead.handover?.assignedTechId
      ? [lead.handover.assignedTechId]
      : [];

  const upsellLabels = (lead.upsells || [])
    .map((u) => u.title || u.serviceOther || u.service)
    .filter(Boolean);

  const upsellNotes =
    lead.upsellNotes || lead.handover?.upscaleNotes || null;

  return (
    <li className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ProjectNumberBadge lead={lead} size="lg" />
            <Link
              to={techHeadClientPath(lead._id, { from: detailFrom })}
              className="cursor-pointer font-display text-lg font-semibold text-white underline-offset-2 transition hover:text-orange-300 hover:underline"
            >
              {lead.businessName || '—'}
            </Link>
            {statusText ? (
              <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300 ring-1 ring-zinc-600">
                {statusText}
              </span>
            ) : null}
            {headerExtra}
          </div>
          {metaLine ? (
            <p className="mt-0.5 text-sm text-zinc-500">{metaLine}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-1.5">
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
              <span className="text-xs text-zinc-500">No specialists</span>
            )}
          </div>

          <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <dt className="text-[11px] uppercase text-zinc-500">
                Service Areas
              </dt>
              <dd className="text-zinc-300">{lead.serviceAreas || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-zinc-500">
                Services Offered
              </dt>
              <dd className="text-zinc-300">{lead.servicesOffered || '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-zinc-500">
                Upsell Services
              </dt>
              <dd className="text-zinc-300">
                {upsellLabels.length ? upsellLabels.join(', ') : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-zinc-500">
                Upsell Notes
              </dt>
              <dd className="whitespace-pre-wrap text-zinc-300">
                {upsellNotes || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-zinc-500">
                Social Links
              </dt>
              <dd className="whitespace-pre-wrap text-zinc-300">
                {lead.socialLinks?.trim() || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-zinc-500">Website</dt>
              <dd className="text-zinc-300">
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
          </dl>
        </div>
        <div className="flex flex-col items-end gap-2">
          <DevelopedWebsiteLink url={lead.handover?.developedWebsiteUrl} />
          {actions}
        </div>
      </div>

      {showOpsEditor ? (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <OpsStatusEditor
            leadId={lead._id}
            handover={lead.handover}
            onUpdated={onOpsUpdated}
          />
        </div>
      ) : null}
    </li>
  );
}

export { formatPkt as formatPktForTechHeadCard };
