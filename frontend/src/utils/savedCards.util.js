/**
 * Client-side aggregation of lead saved cards for CST Upsell Old Card tabs.
 * Mirrors backend vault rules: unique by last4+expiry+token/name, chronological.
 */

const fingerprint = (card) => {
  if (!card) return '';
  const last4 = String(card.cardLast4 || '')
    .replace(/\D/g, '')
    .slice(-4);
  const expiry = String(card.expiry || card.cardExpiry || '')
    .trim()
    .toLowerCase();
  const token = String(card.cardReferenceToken || '')
    .trim()
    .toLowerCase();
  const name = String(card.nameOnCard || card.cardHolderName || '')
    .trim()
    .toLowerCase();
  return `${last4}|${expiry}|${token || name}`;
};

/**
 * @param {object|null|undefined} lead
 * @returns {Array<object>}
 */
export function getAggregatedSavedCards(lead) {
  const vault = Array.isArray(lead?.savedCards) ? [...lead.savedCards] : [];
  const payment = lead?.payment;
  const candidates = [...vault];

  if (payment?.method === 'via_card' && payment.cardLast4) {
    candidates.push({
      cardId: `legacy-payment-${String(payment.cardLast4).slice(-4)}`,
      cardLast4: String(payment.cardLast4).replace(/\D/g, '').slice(-4),
      cardBrand: payment.cardBrand || null,
      cardReferenceToken: payment.cardReferenceToken || null,
      expiry: payment.cardExpiry || null,
      nameOnCard: payment.cardHolderName || null,
      billingZipCode: payment.billingZip || null,
      cvcOnFile: true,
      addedAt: lead?.closedAt || lead?.createdAt || null,
      source: 'close_sale',
    });
  }

  const seen = new Set();
  const unique = [];
  for (const card of candidates) {
    const last4 = String(card?.cardLast4 || '')
      .replace(/\D/g, '')
      .slice(-4);
    if (last4.length !== 4) continue;
    const fp = fingerprint(card);
    if (seen.has(fp)) continue;
    seen.add(fp);
    unique.push(card);
  }

  unique.sort((a, b) => {
    const aMs = a?.addedAt ? new Date(a.addedAt).getTime() : 0;
    const bMs = b?.addedAt ? new Date(b.addedAt).getTime() : 0;
    return aMs - bMs;
  });

  return unique;
}
