/** Multi-month contract helpers for Services Offered + retention deferral. */

export const CONTRACT_MONTH_PRESETS = [3, 6, 12];

/**
 * Strip a prior " Contract (N Months)" suffix so edits don't stack labels.
 * @param {string} raw
 */
export const stripContractLabel = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s
    .replace(/\s*Contract\s*\(\s*\d+\s*Months?\s*\)\s*$/i, '')
    .trim();
};

/**
 * Format services label with Contract appended.
 * e.g. "SEO" + 3 → "SEO Contract (3 Months)"
 */
export const formatContractServicesLabel = (servicesOffered, months) => {
  const base = stripContractLabel(servicesOffered);
  const m = Math.max(0, Math.floor(Number(months) || 0));
  if (!base || !m) return base;
  const unit = m === 1 ? 'Month' : 'Months';
  return `${base} Contract (${m} ${unit})`;
};

export const parseContractMonths = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(120, Math.floor(n));
};

/** True when lead has an active multi-month contract. */
export const hasActiveContract = (lead) =>
  Boolean(lead?.contractEnabled) &&
  Number(lead?.contractMonths) > 0;

/**
 * closedAt + N calendar months (PKT wall-clock via ms approx using Date).
 * Prefer dayjs-style month add: setMonth(getMonth()+n) preserves clock.
 */
export const addMonthsToDate = (dateLike, months) => {
  const d = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const m = Math.max(0, Math.floor(Number(months) || 0));
  if (!m) return d;
  const next = new Date(d.getTime());
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + m);
  // Clamp overflow (e.g. Jan 31 + 1 month)
  if (next.getUTCDate() < day) {
    next.setUTCDate(0);
  }
  return next;
};

/** Initial retention alert: closedAt + contractMonths, else +30 days. */
export const retentionAlertAtFromDeal = (closedAt, leadOrMonths) => {
  if (!closedAt) return null;
  const closed = new Date(closedAt);
  if (Number.isNaN(closed.getTime())) return null;

  let months = null;
  if (typeof leadOrMonths === 'number') {
    months = parseContractMonths(leadOrMonths);
  } else if (leadOrMonths && typeof leadOrMonths === 'object') {
    if (hasActiveContract(leadOrMonths)) {
      months = parseContractMonths(leadOrMonths.contractMonths);
    }
  }

  if (months) {
    return addMonthsToDate(closed, months);
  }
  return new Date(closed.getTime() + 30 * 24 * 60 * 60 * 1000);
};

export const formatContractBadgeLabel = (lead) => {
  if (!hasActiveContract(lead)) return null;
  const m = Math.floor(Number(lead.contractMonths) || 0);
  const unit = m === 1 ? 'Month' : 'Months';
  return `Active Contract · ${m} ${unit}`;
};
