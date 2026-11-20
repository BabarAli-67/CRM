/**
 * CST Handover Queue → Onboard tab filter bar.
 * Theme: #111111 / white / #F25E26. Date input uses color-scheme: dark.
 */
export default function CstOnboardFilterBar({
  businessName,
  onBusinessNameChange,
  clientName,
  onClientNameChange,
  retentionDate,
  onRetentionDateChange,
  onClear,
}) {
  const hasFilters =
    String(businessName || '').trim() !== '' ||
    String(clientName || '').trim() !== '' ||
    String(retentionDate || '').trim() !== '';

  const inputClass =
    'w-full rounded-lg border border-white/15 bg-[#111111] px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-[#F25E26]/60 focus:ring-2 focus:ring-[#F25E26]/30';

  return (
    <div className="flex flex-wrap items-end gap-2.5 rounded-xl border border-white/10 bg-[#111111]/80 p-3">
      <label className="min-w-[11rem] flex-1 space-y-1 text-xs font-medium text-zinc-400">
        <span>Business Name</span>
        <input
          type="search"
          value={businessName}
          onChange={(e) => onBusinessNameChange(e.target.value)}
          placeholder="Search business…"
          className={inputClass}
          aria-label="Filter by business name"
        />
      </label>
      <label className="min-w-[11rem] flex-1 space-y-1 text-xs font-medium text-zinc-400">
        <span>Client Name</span>
        <input
          type="search"
          value={clientName}
          onChange={(e) => onClientNameChange(e.target.value)}
          placeholder="Search client…"
          className={inputClass}
          aria-label="Filter by client name"
        />
      </label>
      <label className="min-w-[10rem] space-y-1 text-xs font-medium text-zinc-400">
        <span>Retention Date</span>
        <input
          type="date"
          value={retentionDate}
          onChange={(e) => onRetentionDateChange(e.target.value)}
          className={`${inputClass} [color-scheme:dark]`}
          aria-label="Filter by retention date"
        />
      </label>
      {hasFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-lg border border-[#F25E26]/40 bg-[#F25E26]/15 px-3 py-2 text-xs font-semibold text-[#F25E26] transition hover:bg-[#F25E26]/25"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
