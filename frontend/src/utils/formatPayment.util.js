/**
 * Client revenue totals — base salesAmount stays separate from upsell ledger.
 * Prefer persisted handover.totalCollectedAmount / totalContractValue when present.
 */
export function getClientRevenueTotals(lead) {
  const base = Math.max(0, Number(lead?.salesAmount) || 0);
  const rows = Array.isArray(lead?.handover?.upsellLedger)
    ? lead.handover.upsellLedger
    : [];
  let upsellTotal = 0;
  let upsellPaid = 0;
  for (const row of rows) {
    const total = Math.max(0, Number(row?.totalAmount) || 0);
    let paid = Math.max(0, Number(row?.paidAmount) || 0);
    if (paid > total) paid = total;
    upsellTotal += total;
    upsellPaid += paid;
  }
  const computedCollected = base + upsellPaid;
  const computedContract = base + upsellTotal;
  const storedCollected = Number(lead?.handover?.totalCollectedAmount);
  const storedContract = Number(lead?.handover?.totalContractValue);

  return {
    baseAmount: base,
    upsellTotal,
    upsellPaid,
    upsellPending: Math.max(0, upsellTotal - upsellPaid),
    totalCollected:
      Number.isFinite(storedCollected) && storedCollected >= 0
        ? storedCollected
        : computedCollected,
    totalContractValue:
      Number.isFinite(storedContract) && storedContract >= 0
        ? storedContract
        : computedContract,
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
 */
export function formatPaymentSummary(payment) {
  if (!payment?.method) return '—';

  if (payment.method === 'via_link') return 'Via link';

  if (payment.method === 'via_card') {
    const brand = payment.cardBrand
      ? String(payment.cardBrand).charAt(0).toUpperCase() +
        String(payment.cardBrand).slice(1)
      : 'Card';
    const last4 = payment.cardLast4 ? `•••• ${payment.cardLast4}` : '••••';
    return `${brand} · ${last4}`;
  }

  if (payment.method === 'other') {
    return payment.otherDetails
      ? `Other · ${payment.otherDetails}`
      : 'Other';
  }

  return payment.method;
}

export const CST_STATUS_LABEL = {
  awaiting_handover: 'Awaiting CST handover',
  pending_review: 'Awaiting CST onboard',
  onboarded: 'Onboarded',
  assigned: 'Assigned to tech',
  in_progress: 'In progress',
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
    if (cst === 'assigned') return 'Assigned to tech';
    if (cst === 'in_progress') return 'Fulfillment in progress';
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
