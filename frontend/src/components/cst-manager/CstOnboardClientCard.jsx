import { Link } from 'react-router-dom';
import {
  formatMoneyAmount,
  getClientRevenueTotals,
} from '../../utils/formatPayment.util.js';
import {
  formatContractBadgeLabel,
  formatPktDateTimeLong,
  getRetentionBadge,
} from '../../utils/retention.util.js';

/**
 * Exact Onboard-tab client card layout reused by Client → Active / Non-Active.
 */
export default function CstOnboardClientCard({
  lead,
  from = 'onboard',
  footer = null,
}) {
  if (!lead) return null;

  const revenue = getClientRevenueTotals(lead);
  const base = revenue.baseOffered;
  const collected = revenue.totalCollected;
  const pending = revenue.totalPending;
  const retentionBadge = getRetentionBadge(lead);
  const contractBadge = formatContractBadgeLabel(lead);
  const unread = Number(lead.unreadCommentCount) || 0;

  const detailTo =
    unread > 0
      ? `/dashboard/cst-manager/client/${lead._id}?tab=comments&from=${from}`
      : `/dashboard/cst-manager/client/${lead._id}?from=${from}`;

  return (
    <div className="rounded-xl border border-white/10 bg-[#111111] px-4 py-3.5 transition hover:border-[#F25E26]/45 hover:bg-[#161616]">
      <Link
        to={detailTo}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F25E26]/40"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-display text-sm font-bold tracking-tight text-white">
            {lead.businessName?.trim() || '—'}
          </h3>
          {contractBadge ? (
            <span
              className="inline-flex max-w-[14rem] shrink-0 truncate items-center rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-300 ring-1 ring-sky-500/40"
              title={contractBadge}
            >
              {contractBadge}
            </span>
          ) : null}
          {retentionBadge ? (
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                retentionBadge.kind === 'paid'
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
                  : 'bg-[#F25E26]/15 text-[#F25E26] ring-[#F25E26]/40'
              }`}
            >
              {retentionBadge.label}
            </span>
          ) : null}
          {unread > 0 ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-[#F25E26]/15 px-2 py-0.5 text-[10px] font-bold text-[#F25E26] ring-1 ring-[#F25E26]/40">
              {unread === 1 ? '1 New Comment' : `${unread} New Comments`}
            </span>
          ) : null}
        </div>

        <dl className="mt-3 space-y-1.5 text-xs">
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">Business Email</dt>
            <dd className="min-w-0 truncate text-zinc-300">
              {lead.businessEmail?.trim() || '—'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">Client Name</dt>
            <dd className="min-w-0 truncate text-zinc-300">
              {lead.clientName?.trim() || '—'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">Next Retention</dt>
            <dd className="min-w-0 text-zinc-200">
              {retentionBadge?.at
                ? formatPktDateTimeLong(retentionBadge.at)
                : '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Base
            </p>
            <p className="mt-0.5 text-xs font-semibold text-white">
              {formatMoneyAmount(base)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Collected
            </p>
            <p className="mt-0.5 text-xs font-semibold text-emerald-300">
              {formatMoneyAmount(collected)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Pending
            </p>
            <p
              className={`mt-0.5 text-xs font-semibold ${
                pending > 0 ? 'text-[#F25E26]' : 'text-zinc-300'
              }`}
            >
              {formatMoneyAmount(pending)}
            </p>
          </div>
        </div>
      </Link>

      {footer ? <div className="mt-3">{footer}</div> : null}
    </div>
  );
}
