/** Resolve project number from lead / list item shapes. */
export const resolveProjectNumber = (item) => {
  const raw =
    item?.projectNumber ??
    item?.handover?.projectNumber ??
    null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
};

/** Format as `#1`, `#2`, … or null when missing. */
export const formatProjectNumber = (itemOrNumber) => {
  const n =
    typeof itemOrNumber === 'number' || typeof itemOrNumber === 'string'
      ? (() => {
          const v = Number(itemOrNumber);
          return Number.isFinite(v) && v >= 1 ? Math.floor(v) : null;
        })()
      : resolveProjectNumber(itemOrNumber);
  return n == null ? null : `#${n}`;
};

/** Title line: `#1 • Business Name` (falls back to name alone). */
export const projectTitle = (item, fallbackName = 'Client') => {
  const name =
    String(item?.businessName || '').trim() || fallbackName;
  const badge = formatProjectNumber(item);
  return badge ? `${badge} • ${name}` : name;
};
