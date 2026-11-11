import { ExternalLink, Mail, Phone, X } from 'lucide-react';

const STATUS_LABEL = {
  with_agent: 'In Progress',
  with_closer: 'With Closer',
  pending_closer_claim: 'With Closer',
  in_progress: 'With Closer',
};

const STATUS_BADGE = {
  with_agent: 'bg-zinc-500/20 text-zinc-300 ring-1 ring-zinc-500/30',
  with_closer: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  pending_closer_claim: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  in_progress: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
};

const Empty = ({ children = '—' }) => (
  <span className="font-normal text-zinc-500">{children}</span>
);

const valueOrEmpty = (value) => {
  const v = typeof value === 'string' ? value.trim() : value;
  return v ? String(v) : null;
};

const externalHref = (url) => {
  const v = String(url || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
};

const initialsFrom = (name) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const Card = ({ title, children }) => (
  <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3.5">
    {title ? (
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </h3>
    ) : null}
    {children}
  </section>
);

const FieldLabel = ({ children }) => (
  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
    {children}
  </p>
);

const LinkChip = ({ href, label }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-1 text-xs font-medium text-orange-300 transition hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-200"
  >
    <span className="min-w-0 truncate max-w-[280px]">{label}</span>
    <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
  </a>
);

/**
 * Sales-agent lead profile slide-over — card layout, dark theme.
 */
export default function AgentLeadProfileDrawer({
  open,
  lead,
  onClose,
  loading = false,
}) {
  if (!open) return null;

  const businessName = valueOrEmpty(lead?.businessName);
  const clientName = valueOrEmpty(lead?.clientName);
  const phone = valueOrEmpty(lead?.phone);
  const email = valueOrEmpty(lead?.workEmail);
  const serviceArea = valueOrEmpty(lead?.servicesArea);
  const services = valueOrEmpty(lead?.serviceOffered);
  const website = externalHref(lead?.websiteLink);
  const gmb = externalHref(lead?.gmbLink);
  const notes = lead?.notes?.trim();
  const statusKey = lead?.status || 'with_agent';
  const statusLabel = STATUS_LABEL[statusKey] || statusKey;
  const statusClass = STATUS_BADGE[statusKey] || STATUS_BADGE.with_agent;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-zinc-950/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-lead-profile-title"
    >
      <button
        type="button"
        aria-label="Close backdrop"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-900/95 text-zinc-200 shadow-2xl backdrop-blur-md animate-in slide-in-from-right duration-200">
        <header className="flex items-start gap-3 border-b border-zinc-800/80 px-5 py-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/90 to-orange-700/80 font-display text-sm font-bold tracking-wide text-white shadow-lg shadow-orange-950/40 ring-1 ring-orange-400/20"
            aria-hidden
          >
            {initialsFrom(businessName || '?')}
          </div>

          <div className="min-w-0 flex-1">
            <h2
              id="agent-lead-profile-title"
              className="truncate text-xl font-bold tracking-tight text-white"
            >
              {loading && !businessName ? 'Loading…' : businessName || 'Lead profile'}
            </h2>
            <div className="mt-1.5">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusClass}`}
              >
                {statusLabel}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close lead profile"
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {loading && !lead ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              Loading lead details…
            </p>
          ) : !lead ? (
            <p className="py-10 text-center text-sm text-zinc-500">
              Lead not found.
            </p>
          ) : (
            <>
              <Card title="Contact & Client">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Client</FieldLabel>
                    <p className="mt-1 text-sm font-medium text-zinc-100">
                      {clientName || <Empty />}
                    </p>
                  </div>
                  <div>
                    <FieldLabel>Phone</FieldLabel>
                    {phone ? (
                      <a
                        href={`tel:${String(lead.phone).replace(/\s+/g, '')}`}
                        className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-orange-300 transition hover:text-orange-200"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>{phone}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-400/80">
                          Call
                        </span>
                      </a>
                    ) : (
                      <p className="mt-1 text-sm">
                        <Empty />
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 border-t border-zinc-800/60 pt-3">
                  <FieldLabel>Business Email</FieldLabel>
                  {email ? (
                    <a
                      href={`mailto:${lead.workEmail}`}
                      className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-orange-300 transition hover:text-orange-200"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 truncate">{email}</span>
                    </a>
                  ) : (
                    <p className="mt-1 text-sm">
                      <Empty />
                    </p>
                  )}
                </div>
              </Card>

              <Card title="Business Scope">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <FieldLabel>Service Area</FieldLabel>
                    <p className="max-w-[60%] text-right text-sm font-medium text-zinc-100">
                      {serviceArea || <Empty />}
                    </p>
                  </div>
                  <div className="flex items-start justify-between gap-3 border-t border-zinc-800/60 pt-3">
                    <FieldLabel>Services Offered</FieldLabel>
                    <p className="max-w-[60%] text-right text-sm font-medium text-zinc-100">
                      {services || <Empty />}
                    </p>
                  </div>
                </div>
              </Card>

              <Card title="Web & Online Presence">
                <div className="space-y-3">
                  <div>
                    <FieldLabel>Website</FieldLabel>
                    <div className="mt-1.5">
                      {website ? (
                        <LinkChip href={website} label={lead.websiteLink} />
                      ) : (
                        <Empty />
                      )}
                    </div>
                  </div>
                  <div className="border-t border-zinc-800/60 pt-3">
                    <FieldLabel>GMB</FieldLabel>
                    <div className="mt-1.5">
                      {gmb ? (
                        <LinkChip href={gmb} label={lead.gmbLink} />
                      ) : (
                        <Empty />
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              <Card title="Notes & Activity">
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
                  {notes ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                      {notes}
                    </p>
                  ) : (
                    <p className="text-sm italic text-zinc-500">No notes yet.</p>
                  )}
                </div>
              </Card>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
