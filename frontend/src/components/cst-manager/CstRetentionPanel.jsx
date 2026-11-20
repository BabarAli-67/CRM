import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  markRetentionPaid,
  setRetention,
} from '../../services/handover.service.js';
import { formatMoneyAmount } from '../../utils/formatPayment.util.js';
import {
  describeRetentionDelta,
  formatPktDateTimeLong,
  fromPktDatetimeLocal,
  getRetentionBadge,
  getRetentionComparisonBaseline,
  resolveRetentionAt,
  toPktDatetimeLocal,
} from '../../utils/retention.util.js';

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none transition [color-scheme:dark] focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20';

/**
 * CST Client Detail — Retention tab:
 * editable next alert schedule, Mark Retention Paid, history + chart.
 */
export default function CstRetentionPanel({ lead, onLeadUpdated }) {
  const retention = lead?.handover?.retention;
  const badge = getRetentionBadge(lead);
  const nextAt = resolveRetentionAt(lead);
  const history = useMemo(() => {
    const rows = Array.isArray(retention?.history) ? [...retention.history] : [];
    return rows.sort(
      (a, b) => new Date(a.paidAt || 0) - new Date(b.paidAt || 0)
    );
  }, [retention?.history]);

  const baseline = getRetentionComparisonBaseline(lead);

  const [scheduleDraft, setScheduleDraft] = useState(() =>
    toPktDatetimeLocal(nextAt)
  );
  const [scheduleMsg, setScheduleMsg] = useState('');
  const [scheduleErr, setScheduleErr] = useState('');

  const [amountDraft, setAmountDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [paidAtDraft, setPaidAtDraft] = useState(() =>
    toPktDatetimeLocal(new Date())
  );
  const [payMsg, setPayMsg] = useState('');
  const [payErr, setPayErr] = useState('');

  useEffect(() => {
    setScheduleDraft(toPktDatetimeLocal(resolveRetentionAt(lead)));
    setScheduleMsg('');
    setScheduleErr('');
  }, [lead?._id, lead?.handover?.retention?.at, lead?.closedAt]);

  useEffect(() => {
    setPaidAtDraft(toPktDatetimeLocal(new Date()));
  }, [lead?._id, history.length]);

  const enteredAmount =
    amountDraft === '' || amountDraft == null ? null : Number(amountDraft);
  const liveDelta =
    enteredAmount != null && Number.isFinite(enteredAmount)
      ? describeRetentionDelta(enteredAmount, baseline)
      : null;

  const scheduleMutation = useMutation({
    mutationFn: (iso) => setRetention(lead._id, iso),
    onSuccess: (updated) => {
      setScheduleMsg('Retention schedule saved.');
      setScheduleErr('');
      onLeadUpdated?.(updated);
    },
    onError: (err) => {
      setScheduleErr(
        err?.response?.data?.message || 'Failed to save retention schedule.'
      );
      setScheduleMsg('');
    },
  });

  const payMutation = useMutation({
    mutationFn: (payload) => markRetentionPaid(lead._id, payload),
    onSuccess: (updated) => {
      setPayMsg('Retention marked paid — next alert advanced +30 days.');
      setPayErr('');
      setAmountDraft('');
      setNoteDraft('');
      setPaidAtDraft(toPktDatetimeLocal(new Date()));
      onLeadUpdated?.(updated);
    },
    onError: (err) => {
      setPayErr(
        err?.response?.data?.message || 'Failed to mark retention paid.'
      );
      setPayMsg('');
    },
  });

  const saveSchedule = () => {
    const when = fromPktDatetimeLocal(scheduleDraft);
    if (!when) {
      setScheduleErr('Pick a valid date and time (PKT).');
      return;
    }
    scheduleMutation.mutate(when.toISOString());
  };

  const submitPaid = () => {
    const amount = Number(amountDraft);
    if (!Number.isFinite(amount) || amount < 0) {
      setPayErr('Enter a valid retention amount paid.');
      return;
    }
    const paidAt = fromPktDatetimeLocal(paidAtDraft) || new Date();
    payMutation.mutate({
      amount,
      note: noteDraft.trim() || undefined,
      paidAt: paidAt.toISOString(),
    });
  };

  const chartMax = Math.max(
    1,
    ...history.map((row) => Math.max(0, Number(row.amount) || 0))
  );

  return (
    <div className="space-y-4">
      {/* Status badge + next schedule */}
      <section className="rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 shadow-xl sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-white">
              Retention
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Monthly recurring retention · audio / popup alerts fire at the
              saved Next Retention Date (PKT)
            </p>
          </div>
          {badge ? (
            <span
              className={`inline-flex flex-col items-end rounded-xl border px-3 py-2 text-right ${
                badge.kind === 'paid'
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-[#F25E26]/40 bg-[#F25E26]/10'
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  badge.kind === 'paid' ? 'text-emerald-300' : 'text-[#F25E26]'
                }`}
              >
                {badge.label}
              </span>
              <span className="mt-0.5 text-xs font-medium text-white">
                Next · {formatPktDateTimeLong(badge.at)} PKT
              </span>
            </span>
          ) : (
            <span className="rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-500">
              No schedule yet
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="space-y-1.5 text-xs font-medium text-zinc-400">
            <span>Next Retention Date &amp; Time (PKT)</span>
            <input
              type="datetime-local"
              value={scheduleDraft}
              onChange={(e) => setScheduleDraft(e.target.value)}
              disabled={scheduleMutation.isPending}
              className={inputClass}
              aria-label="Next retention date and time in PKT"
            />
          </label>
          <button
            type="button"
            disabled={scheduleMutation.isPending}
            onClick={saveSchedule}
            className="rounded-lg bg-[#F25E26] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#F25E26]/20 transition hover:bg-[#ff6a33] disabled:opacity-60"
          >
            {scheduleMutation.isPending ? 'Saving…' : 'Save Schedule'}
          </button>
        </div>
        {scheduleMsg ? (
          <p className="mt-2 text-sm text-emerald-300">{scheduleMsg}</p>
        ) : null}
        {scheduleErr ? (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {scheduleErr}
          </p>
        ) : null}
      </section>

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

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

      {/* Chart */}
      <section className="rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 shadow-xl sm:p-5">
        <h3 className="font-display text-base font-semibold text-white">
          Monthly Retention Chart
        </h3>
        <p className="mt-1 text-sm text-zinc-500">
          Paid amounts by billing cycle
        </p>
        {history.length === 0 ? (
          <p className="mt-6 py-6 text-center text-sm text-zinc-500">
            No retention payments yet.
          </p>
        ) : (
          <div className="mt-5 flex h-44 items-end gap-2 overflow-x-auto pb-1">
            {history.map((row) => {
              const amount = Math.max(0, Number(row.amount) || 0);
              const heightPct = Math.max(8, (amount / chartMax) * 100);
              const delta = describeRetentionDelta(
                amount,
                row.previousAmount ?? 0
              );
              return (
                <div
                  key={row.entryId || `${row.monthLabel}-${row.paidAt}`}
                  className="flex h-full min-w-[3.5rem] flex-1 flex-col items-center"
                  title={`${row.monthLabel}: ${formatMoneyAmount(amount)}`}
                >
                  <span
                    className={`mb-1 text-[10px] font-semibold ${
                      delta.kind === 'up'
                        ? 'text-emerald-300'
                        : delta.kind === 'down'
                          ? 'text-red-400'
                          : 'text-zinc-500'
                    }`}
                  >
                    {delta.arrow}
                  </span>
                  <div className="flex w-full flex-1 items-end justify-center">
                    <div
                      className="w-full max-w-[2.5rem] rounded-t-md bg-gradient-to-t from-[#C92000] to-[#F25E26]"
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className="mt-1 max-w-[4.5rem] truncate text-center text-[10px] text-zinc-500">
                    {(row.monthLabel || '').split(' ')[0] || '—'}
                  </span>
                  <span className="text-[10px] font-medium text-zinc-300">
                    {formatMoneyAmount(amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
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
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Vs. Last Month</th>
                  <th className="px-4 py-3 font-medium">Date &amp; Time (PKT)</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((row) => {
                  const amount = Math.max(0, Number(row.amount) || 0);
                  const delta = describeRetentionDelta(
                    amount,
                    row.previousAmount ?? 0
                  );
                  return (
                    <tr
                      key={row.entryId || `${row.monthLabel}-${row.paidAt}`}
                      className="border-b border-zinc-800/50 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-white">
                        {row.monthLabel || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                          Paid
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-200">
                        {formatMoneyAmount(amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${
                            delta.kind === 'up'
                              ? 'text-emerald-300'
                              : delta.kind === 'down'
                                ? 'text-red-400'
                                : 'text-zinc-400'
                          }`}
                        >
                          <span aria-hidden>{delta.arrow}</span>
                          {delta.kind === 'same' ? 'Same' : delta.label}
                        </span>
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
                      <span className="inline-flex rounded-full border border-[#F25E26]/40 bg-[#F25E26]/10 px-2 py-0.5 text-[11px] font-semibold text-[#F25E26]">
                        Pending
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">—</td>
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
