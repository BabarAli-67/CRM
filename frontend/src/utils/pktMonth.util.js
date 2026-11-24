/** Asia/Karachi calendar helpers for monthly closed-sales / activity scoping. */

export const PKT_TZ = 'Asia/Karachi';

/** Current PKT calendar month as YYYY-MM. */
export const currentPktMonth = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: PKT_TZ }).slice(0, 7);

/** YYYY-MM for a Date / ISO string in PKT, or '' if invalid. */
export const pktMonthKey = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: PKT_TZ }).slice(0, 7);
};

/**
 * Exact previous calendar month for a YYYY-MM key (Jan → prior Dec).
 * Uses calendar arithmetic only — never day-count / rolling windows.
 */
export const previousPktMonth = (yyyyMm = currentPktMonth()) => {
  if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return '';
  const [y, m] = yyyyMm.split('-').map(Number);
  if (m <= 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
};

/** Short label e.g. "Nov 2026". */
export const formatPktMonthLabel = (yyyyMm) => {
  if (!yyyyMm || !/^\d{4}-\d{2}$/.test(yyyyMm)) return yyyyMm || '—';
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString('en-PK', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};
