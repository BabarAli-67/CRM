/** Multi-month contract helpers (backend). */

export const stripContractLabel = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s
    .replace(/\s*Contract\s*\(\s*\d+\s*Months?\s*\)\s*$/i, '')
    .trim();
};

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

export const addMonthsToDate = (dateLike, months) => {
  const d = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const m = Math.max(0, Math.floor(Number(months) || 0));
  if (!m) return d;
  const next = new Date(d.getTime());
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + m);
  if (next.getUTCDate() < day) {
    next.setUTCDate(0);
  }
  return next;
};

/**
 * Apply contract fields from request body onto a lead document.
 * When enabled, formats servicesOffered and syncs paymentOffered from contractAmount when provided.
 */
export const applyContractFieldsToLead = (lead, body) => {
  if (!body || typeof body !== 'object') return;

  const hasAny =
    body.contractEnabled !== undefined ||
    body.contractMonths !== undefined ||
    body.contractAmount !== undefined;
  if (!hasAny) return;

  let enabled = lead.contractEnabled === true;
  if (body.contractEnabled !== undefined) {
    const raw = body.contractEnabled;
    enabled =
      raw === true ||
      raw === 'true' ||
      raw === '1' ||
      raw === 'yes' ||
      raw === 'Yes';
  }

  if (!enabled) {
    lead.contractEnabled = false;
    lead.contractMonths = null;
    lead.contractAmount = null;
    // Keep servicesOffered as provided (caller may still set it); strip stacked suffix if body sent services
    if (body.servicesOffered !== undefined) {
      lead.servicesOffered = stripContractLabel(body.servicesOffered) || lead.servicesOffered;
    }
    return;
  }

  const months = parseContractMonths(
    body.contractMonths !== undefined ? body.contractMonths : lead.contractMonths
  );
  if (!months) {
    throw new Error('Contract Timeframe (months) is required when Contract is Yes');
  }

  let amount = null;
  if (body.contractAmount !== undefined && body.contractAmount !== '' && body.contractAmount != null) {
    amount = Number(body.contractAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Contract Amount must be a valid non-negative number');
    }
  } else if (lead.contractAmount != null) {
    amount = Number(lead.contractAmount);
  }

  const rawServices =
    body.servicesOffered !== undefined
      ? String(body.servicesOffered || '')
      : String(lead.servicesOffered || '');
  const labeled = formatContractServicesLabel(rawServices, months);

  lead.contractEnabled = true;
  lead.contractMonths = months;
  lead.contractAmount = amount;
  if (labeled) {
    lead.servicesOffered = labeled;
  }
  // Sync base deal value when contract amount is provided
  if (amount != null) {
    lead.paymentOffered = amount;
    const received = Math.max(0, Number(lead.paymentReceived) || 0);
    lead.paymentPending = Math.max(0, amount - received);
  }
};

export const computeRetentionAlertAt = (closedAt, lead) => {
  const closed = closedAt ? new Date(closedAt) : new Date();
  const closedMs = closed.getTime();
  const fallback = () =>
    new Date(
      (Number.isNaN(closedMs) ? Date.now() : closedMs) +
        30 * 24 * 60 * 60 * 1000
    );

  if (Number.isNaN(closedMs)) return fallback();

  const months =
    lead?.contractEnabled && Number(lead.contractMonths) > 0
      ? parseContractMonths(lead.contractMonths)
      : null;

  if (months) {
    return addMonthsToDate(closed, months) || fallback();
  }
  return new Date(closedMs + 30 * 24 * 60 * 60 * 1000);
};
