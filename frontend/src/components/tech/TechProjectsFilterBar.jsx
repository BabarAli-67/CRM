/**
 * Shared dark CRM filter bar for Tech Head / Tech Team project lists.
 * Theme: #111111 / white / #F25E26.
 */
export default function TechProjectsFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Business name, #1, service area…',
  service,
  onServiceChange,
  serviceOptions = [],
  date,
  onDateChange,
  dateLabel = 'Onboarded Date',
  specialistId,
  onSpecialistChange,
  specialists = [],
  status,
  onStatusChange,
  statusOptions = [],
  statusLabel = 'Status',
  clientOpsStatus,
  onClientOpsStatusChange,
  clientOpsOptions = [],
  onReset,
  hasActiveFilters = false,
}) {
  const inputClass =
    'w-full rounded-lg border border-white/15 bg-[#111111] px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-[#F25E26]/60 focus:ring-2 focus:ring-[#F25E26]/30';

  return (
    <div className="mb-5 flex flex-wrap items-end gap-2.5 rounded-xl border border-white/10 bg-[#111111]/80 p-3">
      {onSearchChange ? (
        <label className="min-w-[14rem] flex-[2] space-y-1 text-xs font-medium text-zinc-400">
          <span>Search</span>
          <input
            type="search"
            value={search || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className={inputClass}
            aria-label="Search projects"
          />
        </label>
      ) : null}

      {onServiceChange ? (
        <label className="min-w-[10rem] flex-1 space-y-1 text-xs font-medium text-zinc-400">
          <span>Service</span>
          <select
            value={service || ''}
            onChange={(e) => onServiceChange(e.target.value)}
            className={`${inputClass} [color-scheme:dark]`}
            aria-label="Filter by service"
          >
            <option value="">All Services</option>
            {serviceOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {onSpecialistChange ? (
        <label className="min-w-[10rem] flex-1 space-y-1 text-xs font-medium text-zinc-400">
          <span>Assigned Specialist</span>
          <select
            value={specialistId || ''}
            onChange={(e) => onSpecialistChange(e.target.value)}
            className={`${inputClass} [color-scheme:dark]`}
            aria-label="Filter by assigned specialist"
          >
            <option value="">All Specialists</option>
            {specialists.map((m) => (
              <option key={m._id} value={m._id}>
                {m.fullName || m.username}
                {m.jd ? ` · ${m.jd}` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {onStatusChange ? (
        <label className="min-w-[10rem] flex-1 space-y-1 text-xs font-medium text-zinc-400">
          <span>{statusLabel}</span>
          <select
            value={status || ''}
            onChange={(e) => onStatusChange(e.target.value)}
            className={`${inputClass} [color-scheme:dark]`}
            aria-label={statusLabel}
          >
            <option value="">All Statuses</option>
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {onClientOpsStatusChange ? (
        <label className="min-w-[10rem] flex-1 space-y-1 text-xs font-medium text-zinc-400">
          <span>Client Status</span>
          <select
            value={clientOpsStatus || ''}
            onChange={(e) => onClientOpsStatusChange(e.target.value)}
            className={`${inputClass} [color-scheme:dark]`}
            aria-label="Filter by client operational status"
          >
            <option value="">All Client Statuses</option>
            {clientOpsOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {onDateChange ? (
        <label className="min-w-[10rem] space-y-1 text-xs font-medium text-zinc-400">
          <span>{dateLabel}</span>
          <input
            type="date"
            value={date || ''}
            onChange={(e) => onDateChange(e.target.value)}
            className={`${inputClass} [color-scheme:dark]`}
            aria-label={dateLabel}
          />
        </label>
      ) : null}

      {hasActiveFilters && onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 rounded-lg border border-[#F25E26]/40 bg-[#F25E26]/15 px-3 py-2 text-xs font-semibold text-[#F25E26] transition hover:bg-[#F25E26]/25"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}
