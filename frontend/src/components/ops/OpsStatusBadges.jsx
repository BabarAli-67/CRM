import {
  opsStatusBadgeClass,
  resolveClientOpsStatus,
} from '../../utils/opsStatus.util.js';

function Pill({ label, value }) {
  if (!value) return null;
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${opsStatusBadgeClass(value)}`}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * Read-only Client / GMB / Website SEO operational status pills.
 */
export default function OpsStatusBadges({ handover, className = '' }) {
  const client = resolveClientOpsStatus(handover);
  const gmb = handover?.gmbOpsStatus || null;
  const seo = handover?.websiteSeoOpsStatus || null;

  if (!client && !gmb && !seo) return null;

  return (
    <div className={`flex flex-wrap gap-3 ${className}`}>
      <Pill label="Client Status" value={client} />
      <Pill label="GMB Status" value={gmb} />
      <Pill label="Website SEO Status" value={seo} />
    </div>
  );
}

/** Compact single-row scan pills for Tech Head assigned list. */
export function OpsStatusScanRow({ handover, className = '' }) {
  const items = [
    { label: 'Client', value: resolveClientOpsStatus(handover) },
    { label: 'GMB', value: handover?.gmbOpsStatus || null },
    { label: 'SEO', value: handover?.websiteSeoOpsStatus || null },
  ].filter((item) => item.value);

  if (!items.length) return null;

  return (
    <div className={`mt-2 flex flex-wrap gap-1.5 ${className}`}>
      {items.map((item) => (
        <span
          key={item.label}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${opsStatusBadgeClass(item.value)}`}
          title={`${item.label}: ${item.value}`}
        >
          <span className="opacity-70">{item.label}</span>
          {item.value}
        </span>
      ))}
    </div>
  );
}
