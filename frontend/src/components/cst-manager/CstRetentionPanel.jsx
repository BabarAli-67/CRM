import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import useAuth from '../../hooks/useAuth.hook.js';
import { markRetentionPaid } from '../../services/handover.service.js';
import { stripContractLabel } from '../../utils/contract.util.js';
import { formatMoneyAmount } from '../../utils/formatPayment.util.js';
import {
  currentPktMonth,
  pktMonthKey,
  previousPktMonth,
} from '../../utils/pktMonth.util.js';
import {
  describeRetentionDelta,
  formatPktDateTimeLong,
  fromPktDatetimeLocal,
  getRetentionComparisonBaseline,
  resolveRetentionAt,
  toPktDatetimeLocal,
} from '../../utils/retention.util.js';

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none transition [color-scheme:dark] focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20';

/** Fixed Mark Retention Paid product pills (no dynamic client strings). */
const RETENTION_SERVICE_OPTIONS = [
  'Citation Pages',
  'Web SEO',
  'SEO',
  'Others',
];

/** History fallback when an older entry has no saved serviceName. */
const getPrimaryBaseService = (lead) => {
  const raw = stripContractLabel(lead?.servicesOffered || '').trim();
  if (!raw) return '';
  return raw.split(',')[0].trim() || raw;
};

const defaultRetentionServicePill = () => 'SEO';

/**
 * CST Client Detail — Retention tab:
 * Mark Retention Paid (+30 day auto advance) and history.
 */
export default function CstRetentionPanel({ lead, onLeadUpdated }) {
  const { user } = useAuth();
  const retention = lead?.handover?.retention;
  const nextAt = resolveRetentionAt(lead);
  const history = useMemo(() => {
    const rows = Array.isArray(retention?.history) ? [...retention.history] : [];
    return rows.sort(
      (a, b) => new Date(a.paidAt || 0) - new Date(b.paidAt || 0)
    );
  }, [retention?.history]);

  // Admin / Super Admin: full audit trail.
  // CST Manager: strict PKT calendar months — current + previous only (+ Next cycle).
  // All entries remain in MongoDB either way (no deletes / no rolling day window).
  const canViewFullHistory =
    user?.role === 'super_admin' || user?.role === 'admin';
  const visibleHistory = useMemo(() => {
    if (canViewFullHistory) return [...history].reverse();
    const currentYYYYMM = currentPktMonth();
    const prevYYYYMM = previousPktMonth(currentYYYYMM);
    const allowed = new Set([currentYYYYMM, prevYYYYMM]);
    return history
      .filter((row) => allowed.has(pktMonthKey(row?.paidAt)))
      .reverse();
  }, [history, canViewFullHistory]);

  const baseline = getRetentionComparisonBaseline(lead);
  const primaryService = useMemo(() => getPrimaryBaseService(lead), [lead]);

  const [servicePill, setServicePill] = useState(defaultRetentionServicePill);
  const [othersText, setOthersText] = useState('');
  const [amountDraft, setAmountDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [paidAtDraft, setPaidAtDraft] = useState(() =>
    toPktDatetimeLocal(new Date())
  );
  const [payMsg, setPayMsg] = useState('');
  const [payErr, setPayErr] = useState('');

  useEffect(() => {
    setPaidAtDraft(toPktDatetimeLocal(new Date()));
    setServicePill(defaultRetentionServicePill());
    setOthersText('');
    // Reset after a successful pay / lead change — don't fight mid-edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?._id, history.length]);

  const enteredAmount =
    amountDraft === '' || amountDraft == null ? null : Number(amountDraft);
  const liveDelta =
    enteredAmount != null && Number.isFinite(enteredAmount)
      ? describeRetentionDelta(enteredAmount, baseline)
      : null;

  const payMutation = useMutation({
    mutationFn: (payload) => markRetentionPaid(lead._id, payload),
    onSuccess: (updated) => {
      setPayMsg('Retention marked paid — next alert advanced +30 days.');
      setPayErr('');
      setAmountDraft('');
      setNoteDraft('');
      setPaidAtDraft(toPktDatetimeLocal(new Date()));
      setServicePill(defaultRetentionServicePill());
      setOthersText('');
      onLeadUpdated?.(updated);
    },
    onError: (err) => {
      setPayErr(
        err?.response?.data?.message || 'Failed to mark retention paid.'
      );
      setPayMsg('');
    },
  });

  const submitPaid = () => {
    const serviceName =
      servicePill === 'Others'
        ? String(othersText || '').trim()
        : String(servicePill || '').trim();
    if (!serviceName) {
      setPayErr(
        servicePill === 'Others'
          ? 'Enter a product / service name for Others.'
          : 'Select a Product / Service.'
      );
      return;
    }
    const amount = Number(amountDraft);
    if (!Number.isFinite(amount) || amount < 0) {
      setPayErr('Enter a valid retention amount paid.');
      return;
    }
    const paidAt = fromPktDatetimeLocal(paidAtDraft) || new Date();
    payMutation.mutate({
      amount,
      serviceName,
      note: noteDraft.trim() || undefined,
      paidAt: paidAt.toISOString(),
    });
  };

  const resolveHistoryProduct = (row) => {
    const saved = String(row?.serviceName || '').trim();
    if (saved) return saved;
    return primaryService || '—';
  };

  return (
    <div className="space-y-4">
      {/* Mark Retention Paid */}
      <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4 shadow-xl sm:p-5">
        <h3 className="font-display text-base font-semibold text-white">
          Mark Retention Paid
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Logs this cycle, updates the badge to Retention Paid, advances the
          next alert by +30 days, and rolls revenue into Collected (base
          untouched).
        </p>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-zinc-400">
              Product / Service <span className="text-red-400">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {RETENTION_SERVICE_OPTIONS.map((opt) => {
                const active = servicePill === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={payMutation.isPending}
                    onClick={() => {
                      setServicePill(opt);
                      setPayErr('');
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/50'
                        : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800/80'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {servicePill === 'Others' ? (
              <input
                type="text"
                value={othersText}
                onChange={(e) => setOthersText(e.target.value)}
                disabled={payMutation.isPending}
                placeholder="Enter product / service name"
                className={`${inputClass} mt-2`}
                aria-label="Other product or service name"
              />
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium text-zinc-400">
              <span>Retention Amount Paid</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amountDraft}
                  placeholder="0"
                  disabled={payMutation.isPending}
                  onChange={(e) => setAmountDraft(e.target.value)}
                  className={`${inputClass} pl-7`}
                />
              </div>
              {liveDelta ? (
                <span
                  className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${
                    liveDelta.kind === 'up'
                      ? 'text-emerald-300'
                      : liveDelta.kind === 'down'
                        ? 'text-red-400'
                        : 'text-zinc-400'
                  }`}
                >
                  <span aria-hidden>{liveDelta.arrow}</span>
                  {liveDelta.kind === 'same'
                    ? 'Same as last month'
                    : `${liveDelta.label} vs last month`}
                </span>
              ) : (
                <span className="mt-1 block text-xs text-zinc-600">
                  Baseline · {formatMoneyAmount(baseline)}
                </span>
              )}
            </label>

            <label className="space-y-1.5 text-xs font-medium text-zinc-400">
              <span>Payment Date &amp; Time (PKT)</span>
              <input
                type="datetime-local"
                value={paidAtDraft}
                onChange={(e) => setPaidAtDraft(e.target.value)}
                disabled={payMutation.isPending}
                className={inputClass}
              />
            </label>

            <label className="space-y-1.5 text-xs font-medium text-zinc-400 sm:col-span-2">
              <span>Note (optional)</span>
              <input
                type="text"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                disabled={payMutation.isPending}
                placeholder="e.g. Card ending 4242 · renewed SEO package"
                className={inputClass}
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={payMutation.isPending}
            onClick={submitPaid}
            className="rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-60"
          >
            {payMutation.isPending ? 'Saving…' : 'Mark Retention Paid'}
          </button>
          {payMsg ? (
            <p className="text-sm text-emerald-300">{payMsg}</p>
          ) : null}
          {payErr ? (
            <p className="text-sm text-red-400" role="alert">
              {payErr}
            </p>
          ) : null}
        </div>
      </section>

      {/* History table */}
      <section className="rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 shadow-xl sm:p-5">
        <h3 className="font-display text-base font-semibold text-white">
          Monthly Retention History
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Every paid cycle with vs-last-month trend
        </p>

        {history.length === 0 ? (
          <p className="mt-6 py-6 text-center text-sm text-zinc-500">
            History will appear after the first Mark Retention Paid.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800/60">
            <table className="min-w-full text-left text-sm text-zinc-200">
              <thead className="border-b border-zinc-800 bg-zinc-950/40 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Date &amp; Time (PKT)</th>
                </tr>
              </thead>
              <tbody>
                {visibleHistory.map((row) => {
                  const amount = Math.max(0, Number(row.amount) || 0);
                  const product = resolveHistoryProduct(row);
                  return (
                    <tr
                      key={row.entryId || `${row.monthLabel}-${row.paidAt}`}
                      className="border-b border-zinc-800/50 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        {row.monthLabel || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {product && product !== '—' ? (
                          <span className="inline-flex max-w-[12rem] truncate rounded-full border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                            {product}
                          </span>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                          Paid
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-200">
                        {formatMoneyAmount(amount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-400">
                        {formatPktDateTimeLong(row.paidAt)} PKT
                      </td>
                    </tr>
                  );
                })}
                {/* Pending next cycle row */}
                {nextAt ? (
                  <tr className="border-b border-zinc-800/50 last:border-0 bg-zinc-950/20">
                    <td className="px-4 py-3 font-medium text-zinc-300">
                      Next cycle
                    </td>
                    <td className="px-4 py-3">
                      {primaryService ? (
                        <span className="inline-flex max-w-[12rem] truncate rounded-full border border-zinc-600/50 bg-zinc-800/60 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
                          {primaryService}
                        </span>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-[#F25E26]/40 bg-[#F25E26]/10 px-2 py-0.5 text-[11px] font-semibold text-[#F25E26]">
                        Pending
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">—</td>
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-400">
                      Due · {formatPktDateTimeLong(nextAt)} PKT
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
