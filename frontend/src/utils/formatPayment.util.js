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
  pending_review: 'Awaiting tech assignment',
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
    if (cst === 'pending_review') return 'Awaiting tech assignment';
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
      cst === 'assigned' ||
      cst === 'in_progress' ||
      cst === 'completed'
    ) {
      return 'CST Operations';
    }
    return 'Closed sale';
  }
  if (lead.status === 'pending_closer_claim') return 'Pending Closer Claim';
  if (lead.status === 'in_progress') return 'In Progress';
  if (lead.status === 'with_agent') return 'With Agent';
  return lead.status || '—';
}
