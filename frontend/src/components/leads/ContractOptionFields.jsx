import { CONTRACT_MONTH_PRESETS } from '../../utils/contract.util.js';

const fieldClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

/**
 * Contract toggle + timeframe + amount for Services Offered forms.
 * amountLabel defaults to "Contract Amount" (syncs with Payment Offered when parent wires it).
 */
export default function ContractOptionFields({
  enabled,
  onEnabledChange,
  months,
  onMonthsChange,
  customMonths,
  onCustomMonthsChange,
  amount,
  onAmountChange,
  amountLabel = 'Contract Amount',
  previewLabel = '',
  disabled = false,
}) {
  const preset = CONTRACT_MONTH_PRESETS.includes(Number(months))
    ? String(months)
    : 'custom';

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-200">Contract</p>
        <div
          className="inline-flex rounded-lg border border-zinc-700 p-0.5"
          role="group"
          aria-label="Contract option"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onEnabledChange(false)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              !enabled
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            No
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onEnabledChange(true)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              enabled
                ? 'bg-[#F25E26] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Yes
          </button>
        </div>
      </div>

      {enabled ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span>
              Contract Timeframe <span className="text-[#F25E26]">*</span>
            </span>
            <select
              value={preset}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'custom') {
                  onMonthsChange('custom');
                  return;
                }
                onMonthsChange(Number(v));
                onCustomMonthsChange?.('');
              }}
              className={`${fieldClass} [color-scheme:dark]`}
              aria-required="true"
            >
              {CONTRACT_MONTH_PRESETS.map((m) => (
                <option key={m} value={m}>
                  {m} Months
                </option>
              ))}
              <option value="custom">Custom months…</option>
            </select>
            {preset === 'custom' ? (
              <input
                type="number"
                min="1"
                max="120"
                step="1"
                inputMode="numeric"
                value={customMonths}
                disabled={disabled}
                onChange={(e) => onCustomMonthsChange?.(e.target.value)}
                placeholder="e.g. 9"
                className={`${fieldClass} mt-2`}
                aria-label="Custom contract months"
              />
            ) : null}
          </label>

          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span>
              {amountLabel} <span className="text-[#F25E26]">*</span>
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                $
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                disabled={disabled}
                onChange={(e) => onAmountChange(e.target.value)}
                className={`${fieldClass} pl-7`}
                placeholder="0.00"
                aria-required="true"
              />
            </div>
          </label>

          {previewLabel ? (
            <p className="sm:col-span-2 text-xs text-zinc-500">
              Services label preview:{' '}
              <span className="font-medium text-zinc-300">{previewLabel}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
