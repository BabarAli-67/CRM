import { randomUUID } from 'crypto';

/**
 * PCI-safe card vault entry for a lead.
 * Never stores raw PAN or CVC — only last4, brand, token, expiry (MM/YY),
 * holder name, and billing zip.
 */
export function buildSavedCardEntry({
  cardLast4,
  cardBrand,
  cardReferenceToken,
  expiry,
  nameOnCard,
  billingZipCode,
  source,
  cvcCollected = true,
}) {
  const last4 = String(cardLast4 || '').replace(/\D/g, '').slice(-4);
  if (last4.length !== 4) {
    throw new Error('cardLast4 is required to save a card');
  }
  return {
    cardId: randomUUID(),
    cardLast4: last4,
    cardBrand: cardBrand ? String(cardBrand).trim() : null,
    cardReferenceToken: cardReferenceToken
      ? String(cardReferenceToken).trim()
      : `local_${cardBrand || 'card'}_${last4}_${Date.now()}`,
    expiry: expiry ? String(expiry).trim() : null,
    nameOnCard: nameOnCard ? String(nameOnCard).trim() : null,
    billingZipCode: billingZipCode ? String(billingZipCode).trim() : null,
    cvcOnFile: Boolean(cvcCollected),
    addedAt: new Date(),
    source: source || 'unknown',
  };
}

/** Append without overwriting prior cards. */
export function appendSavedCard(lead, entry) {
  if (!lead.savedCards) lead.savedCards = [];
  lead.savedCards.push(entry);
  return entry;
}
