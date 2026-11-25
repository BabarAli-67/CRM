import {
  formatCardBrandLabel,
  resolveCardBrandId,
} from './cardBrand.util.js';
import { currentPktMonth, pktMonthKey } from './pktMonth.util.js';

const moneyOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Unified upsell rows: CST ledger + Closer Move-to-CST handover upscale
 * (when the handoff was never seeded into upsellLedger).
 */
export function getUnifiedUpsellLedger(lead) {
  const rows = Array.isArray(lead?.handover?.upsellLedger)
    ? lead.handover.upsellLedger.map((row, index) => ({
        ...row,
        entryId: row.entryId || `ledger-${index + 1}`,
        source: row.source || 'cst',
      }))
    : [];

  const upscale = lead?.handover?.upscale;
  if (!upscale?.enabled) return rows;

  const offered = Math.max(
    0,
    Number(upscale.offered ?? upscale.price) || 0
  );
  const received = Math.min(
    offered,
    Math.max(0, Number(upscale.received) || 0)
  );
  const title = String(upscale.itemName || '').trim();
  const already = rows.some((r) => {
    const sameTitle =
      String(r.title || '')
        .trim()
        .toLowerCase() === title.toLowerCase();
    const sameTotal =
      Math.abs((Number(r.totalAmount) || 0) - offered) < 0.009;
    return sameTitle && sameTotal;
  });

  if (already) return rows;

  const payMap = {
    old_card: 'old_card',
    new_card: 'new_card',
    other: 'others',
  };

  const closedAt = lead?.closedAt || null;
  return [
    {
      entryId: 'handover-upscale',
      title: title || 'Handover Upsell',
      service: null,
      serviceOther: null,
      totalAmount: offered,
      paidAmount: received,
      paymentOption: payMap[upscale.paymentMethod] || upscale.paymentMethod || null,
      selectedCardId: upscale.selectedCardId || null,
      paymentReference: upscale.paymentReference || null,
      notes: lead?.handover?.upscaleNotes || null,
      source: 'handover',
      createdAt: closedAt,
      paidAt: received > 0 ? closedAt : null,
      paymentEvents:
        received > 0 && closedAt
          ? [{ amount: received, at: closedAt }]
          : [],
    },
    ...rows,
  ];
}

/**
 * Client revenue totals — base paymentOffered/paymentReceived stay separate from upsells.
 * Never treat Mongo null totals as 0 (Number(null) === 0 would wipe real payments).
 */
export function getClientRevenueTotals(lead) {
  const baseOffered = Math.max(
    0,
    moneyOrNull(lead?.paymentOffered) ??
      moneyOrNull(lead?.salesAmount) ??
      0
  );
  const baseReceived = Math.max(0, moneyOrNull(lead?.paymentReceived) ?? 0);
  const rows = getUnifiedUpsellLedger(lead);
  let upsellTotal = 0;
  let upsellPaid = 0;
  for (const row of rows) {
    const total = Math.max(0, Number(row?.totalAmount) || 0);
    let paid = Math.max(0, Number(row?.paidAmount) || 0);
    if (paid > total) paid = total;
    upsellTotal += total;
    upsellPaid += paid;
  }
  // Recurring retention payments — never mixed into base paymentReceived
  const retentionHistory = Array.isArray(lead?.handover?.retention?.history)
    ? lead.handover.retention.history
    : [];
  let retentionPaid = 0;
  for (const row of retentionHistory) {
    retentionPaid += Math.max(0, Number(row?.amount) || 0);
  }
  const computedCollected = baseReceived + upsellPaid + retentionPaid;
  const computedContract = baseOffered + upsellTotal + retentionPaid;
  const computedPending = Math.max(0, computedContract - computedCollected);

  // Prefer live source fields; only use stored rollups when they are real numbers
  // AND match/exceed source math within tolerance (avoids stale 0/null wipe).
  const storedCollected = moneyOrNull(lead?.handover?.totalCollectedAmount);
  const storedContract = moneyOrNull(lead?.handover?.totalContractValue);

  const totalCollected =
    storedCollected != null &&
    Math.abs(storedCollected - computedCollected) < 0.009
      ? storedCollected
      : computedCollected;
  const totalContractValue =
    storedContract != null &&
    Math.abs(storedContract - computedContract) < 0.009
      ? storedContract
      : computedContract;

  return {
    baseAmount: baseOffered,
    baseOffered,
    baseReceived,
    basePending: Math.max(0, baseOffered - baseReceived),
    upsellTotal,
    upsellPaid,
    upsellPending: Math.max(0, upsellTotal - upsellPaid),
    retentionPaid,
    totalCollected,
    totalContractValue,
    totalPending: Math.max(0, totalContractValue - totalCollected) || computedPending,
  };
}

/**
 * CLIENT SUMMARY header totals (CST Client Detail only):
 * - Upsell Total / Collected Amount → current PKT calendar month
 * - Pending Amount → all-time unpaid base + upsell balances
 * - Base Amount → original deal (unchanged)
 * Does not mutate Mongo; historical ledger / retention rows stay intact.
 */
export function getClientDetailSummaryTotals(lead, monthKey = currentPktMonth()) {
  const inMonth = (value) => {
    const key = pktMonthKey(value);
    return Boolean(key) && key === monthKey;
  };

  const baseOffered = Math.max(
    0,
    moneyOrNull(lead?.paymentOffered) ??
      moneyOrNull(lead?.salesAmount) ??
      0
  );
  const baseReceived = Math.max(0, moneyOrNull(lead?.paymentReceived) ?? 0);
  const basePending = Math.max(0, baseOffered - baseReceived);

  // Base collected this PKT month (use closedAt as the collection stamp).
  const baseCollectedThisMonth =
    baseReceived > 0 && inMonth(lead?.closedAt) ? baseReceived : 0;

  const rows = getUnifiedUpsellLedger(lead);
  let upsellTotalMonth = 0;
  let upsellPaidMonth = 0;
  let upsellPendingAll = 0;

  for (const row of rows) {
    const total = Math.max(0, Number(row?.totalAmount) || 0);
    let paid = Math.max(0, Number(row?.paidAmount) || 0);
    if (paid > total) paid = total;
    upsellPendingAll += Math.max(0, total - paid);

    const createdAt =
      row?.createdAt ||
      row?.at ||
      (row?.source === 'handover' ? lead?.closedAt : null);

    if (inMonth(createdAt)) {
      upsellTotalMonth += total;
    }

    const events = Array.isArray(row?.paymentEvents)
      ? row.paymentEvents
      : null;
    if (events && events.length > 0) {
      for (const ev of events) {
        if (inMonth(ev?.at)) {
          upsellPaidMonth += Math.max(0, Number(ev?.amount) || 0);
        }
      }
    } else if (paid > 0 && (inMonth(createdAt) || inMonth(row?.paidAt))) {
      // Legacy rows without paymentEvents — attribute paid to create/pay month.
      upsellPaidMonth += paid;
    }
  }

  const retentionHistory = Array.isArray(lead?.handover?.retention?.history)
    ? lead.handover.retention.history
    : [];
  let retentionPaidMonth = 0;
  for (const row of retentionHistory) {
    if (inMonth(row?.paidAt)) {
      retentionPaidMonth += Math.max(0, Number(row?.amount) || 0);
    }
  }

  const totalCollected =
    baseCollectedThisMonth + upsellPaidMonth + retentionPaidMonth;
  const totalPending = basePending + upsellPendingAll;

  return {
    baseAmount: baseOffered,
    baseOffered,
    baseReceived,
    basePending,
    upsellTotal: upsellTotalMonth,
    upsellPaid: upsellPaidMonth,
    upsellPending: upsellPendingAll,
    retentionPaid: retentionPaidMonth,
    totalCollected,
    totalPending,
    monthKey,
  };
}

export function formatMoneyAmount(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Human-readable payment summary — never includes cardReferenceToken / raw PAN.
 * Card example: Card (Visa •••• 6988)
 */
export function formatPaymentSummary(payment) {
  if (!payment?.method) return '—';

  if (payment.method === 'via_card') {
    const brandLabel = formatCardBrandLabel(resolveCardBrandId(payment));
    const last4 = payment.cardLast4
      ? String(payment.cardLast4).replace(/\D/g, '').slice(-4)
      : '';
    if (brandLabel && last4) return `Card (${brandLabel} •••• ${last4})`;
    if (brandLabel) return `Card (${brandLabel})`;
    if (last4) return `Card (•••• ${last4})`;
    return 'Card';
  }

  if (payment.method === 'other') {
    return payment.otherDetails
      ? `Other · ${payment.otherDetails}`
      : 'Other';
  }

  // Legacy via_link / unknown — never surface a Payment Link URL
  return 'Other';
}

export const CST_STATUS_LABEL = {
  awaiting_handover: 'Awaiting CST handover',
  pending_review: 'Awaiting CST onboard',
  onboarded: 'Onboarded',
  assigned: 'Pending',
  in_progress: 'In Progress',
  ongoing_seo: 'Ongoing (SEO)',
  completed: 'Completed',
};

export function formatCstStatus(status) {
  if (!status) return '—';
  return CST_STATUS_LABEL[status] || status;
}

/** Human-readable lead stage for detail views. */
export function formatLeadStage(lead) {
  if (!lead) return '—';
  const stage = lead.stage;
  if (stage === 'closed_sale') {
    const cst = lead.handover?.cstStatus;
    if (cst === 'pending_review') return 'Awaiting CST onboard';
    if (cst === 'onboarded') return 'Onboarded';
    if (cst === 'assigned') return 'Pending';
    if (cst === 'in_progress') return 'In Progress';
    if (cst === 'ongoing_seo') return 'Ongoing (SEO)';
    if (cst === 'completed') return 'Completed';
    if (cst === 'awaiting_handover') return 'Closed sale';
    return 'Closed sale';
  }
  if (stage === 'disqualified') return 'Disqualified';
  if (stage === 'active') return 'Active';
  return stage || '—';
}

/** Pipeline lane label (sales vs CST operations). */
export function formatLeadPipeline(lead) {
  if (!lead) return '—';
  if (lead.stage === 'closed_sale') {
    const cst = lead.handover?.cstStatus;
    if (
      cst === 'pending_review' ||
      cst === 'onboarded' ||
      cst === 'assigned' ||
      cst === 'in_progress' ||
      cst === 'ongoing_seo' ||
      cst === 'completed'
    ) {
      return 'CST Operations';
    }
    return 'Closed sale';
  }
  if (lead.status === 'with_closer' || lead.status === 'in_progress') {
    return 'With Closer';
  }
  if (lead.status === 'pending_closer_claim') return 'With Closer';
  if (lead.status === 'with_agent') return 'With Agent';
  return lead.status || '—';
}
