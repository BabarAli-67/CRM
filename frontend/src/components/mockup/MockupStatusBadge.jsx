import { MOCKUP_STATUS_LABEL } from '../../services/mockup.service.js';

const TONE = {
  pending_assignment: 'bg-amber-500/15 text-amber-300 ring-amber-500/35',
  in_progress: 'bg-sky-500/15 text-sky-300 ring-sky-500/35',
  ready_for_review: 'bg-[#F25E26]/15 text-[#F25E26] ring-[#F25E26]/40',
  delivered: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/35',
};

export default function MockupStatusBadge({ status, className = '' }) {
  const label = MOCKUP_STATUS_LABEL[status] || status || '—';
  const tone = TONE[status] || 'bg-zinc-800 text-zinc-300 ring-zinc-600';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${tone} ${className}`}
    >
      {label}
    </span>
  );
}
