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
  pending_review: 'Handed over to CST',
  assigned: 'Assigned to Tech',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export function formatCstStatus(status) {
  if (!status) return '—';
  return CST_STATUS_LABEL[status] || status;
}
