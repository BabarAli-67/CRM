/**
 * Format late duration for UI (e.g. "56 mins late", "1 hr 15 mins late").
 */
export function formatLateDuration(lateMinutes, { suffix = true } = {}) {
  const n = Number(lateMinutes);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return suffix ? '0 mins late' : '0 mins';

  const hours = Math.floor(n / 60);
  const mins = n % 60;
  let body = '';

  if (hours > 0 && mins > 0) {
    body = `${hours} hr${hours === 1 ? '' : 's'} ${mins} min${mins === 1 ? '' : 's'}`;
  } else if (hours > 0) {
    body = `${hours} hr${hours === 1 ? '' : 's'}`;
  } else {
    body = `${mins} min${mins === 1 ? '' : 's'}`;
  }

  return suffix ? `${body} late` : body;
}
