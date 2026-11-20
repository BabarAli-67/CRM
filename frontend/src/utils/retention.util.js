import { retentionAlertAtFromClosedAt } from './emailjs.util.js';
import {
  formatContractBadgeLabel,
  hasActiveContract,
} from './contract.util.js';

export { formatContractBadgeLabel, hasActiveContract };

/** Format a Date / ISO as datetime-local value in Asia/Karachi. */
export const toPktDatetimeLocal = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
};

/** Parse datetime-local string as PKT (UTC+5) wall clock → Date. */
export const fromPktDatetimeLocal = (localStr) => {
  if (!localStr || typeof localStr !== 'string') return null;
  const m = localStr
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:00+05:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatPktDateTimeLong = (value) => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const resolveRetentionAt = (lead) => {
  const at = lead?.handover?.retention?.at;
  if (at) {
    const d = new Date(at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return retentionAlertAtFromClosedAt(lead?.closedAt, lead);
};

/**
 * Badge for Onboard cards + Client Detail Retention surfaces.
 * Paid (green) while next schedule is still in the future after a payment;
 * Alert (orange) when due / overdue / never paid.
 */
export const getRetentionBadge = (lead, nowMs = Date.now()) => {
  const retention = lead?.handover?.retention;
  const at = resolveRetentionAt(lead);
  const atMs = at ? at.getTime() : null;
  const history = Array.isArray(retention?.history) ? retention.history : [];
  const lastPaid = history.length ? history[history.length - 1] : null;
  const lastPaidAt = retention?.lastPaidAt || lastPaid?.paidAt || null;

  if (atMs != null && atMs > nowMs && lastPaidAt) {
    return {
      kind: 'paid',
      label: 'Retention Paid',
      at,
      lastPaidAt: new Date(lastPaidAt),
      lastPaidAmount:
        retention?.lastPaidAmount != null
          ? Number(retention.lastPaidAmount)
          : Number(lastPaid?.amount) || 0,
    };
  }

  if (atMs != null) {
    return {
      kind: 'alert',
      label: 'Retention Alert',
      at,
      lastPaidAt: lastPaidAt ? new Date(lastPaidAt) : null,
      lastPaidAmount:
        retention?.lastPaidAmount != null
          ? Number(retention.lastPaidAmount)
          : lastPaid
            ? Number(lastPaid.amount) || 0
            : null,
    };
  }

  return null;
};

/** Baseline for first-cycle comparison: last retention paid, else base deal. */
export const getRetentionComparisonBaseline = (lead) => {
  const history = Array.isArray(lead?.handover?.retention?.history)
    ? lead.handover.retention.history
    : [];
  if (history.length > 0) {
    return Math.max(0, Number(history[history.length - 1]?.amount) || 0);
  }
  return Math.max(
    0,
    Number(lead?.paymentReceived ?? lead?.paymentOffered ?? lead?.salesAmount) ||
      0
  );
};

export const describeRetentionDelta = (amount, previousAmount) => {
  const current = Math.max(0, Number(amount) || 0);
  const previous = Math.max(0, Number(previousAmount) || 0);
  const delta = current - previous;
  if (Math.abs(delta) < 0.009) {
    return { kind: 'same', delta: 0, label: 'Same', arrow: '→' };
  }
  if (delta > 0) {
    return {
      kind: 'up',
      delta,
      label: `+$${delta.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      arrow: '↑',
    };
  }
  return {
    kind: 'down',
    delta,
    label: `-$${Math.abs(delta).toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    arrow: '↓',
  };
};
