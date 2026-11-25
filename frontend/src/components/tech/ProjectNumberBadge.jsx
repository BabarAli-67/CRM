import { formatProjectNumber } from '../../utils/projectNumber.util.js';

/**
 * Persistent Tech Department project number badge (`#1`, `#2`, …).
 */
export default function ProjectNumberBadge({
  projectNumber,
  lead,
  className = '',
  size = 'md',
}) {
  const label =
    formatProjectNumber(
      projectNumber != null ? projectNumber : lead
    ) || null;
  if (!label) return null;

  const sizeClass =
    size === 'lg'
      ? 'px-2.5 py-1 text-xs'
      : size === 'sm'
        ? 'px-1.5 py-0.5 text-[10px]'
        : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border border-[#F25E26]/45 bg-[#F25E26]/15 font-bold tabular-nums tracking-wide text-[#F25E26] ring-1 ring-[#F25E26]/25 ${sizeClass} ${className}`}
      title={`Project ${label}`}
      aria-label={`Project ${label}`}
    >
      {label}
    </span>
  );
}
