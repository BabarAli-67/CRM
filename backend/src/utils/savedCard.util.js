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
  addedAt,
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
    addedAt: addedAt ? new Date(addedAt) : new Date(),
    source: source || 'unknown',
  };
}

/** Stable fingerprint for dedupe (last4 + expiry + token/name). */
export function cardFingerprint(card) {
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
}

/** Append without overwriting prior cards. */
export function appendSavedCard(lead, entry) {
  if (!lead.savedCards) lead.savedCards = [];
  lead.savedCards.push(entry);
  return entry;
}

/**
 * Merge vault + legacy base-deal payment card into a unique chronological list.
 * Does not mutate the lead.
 */
export function listAggregatedSavedCards(lead) {
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
      _legacy: true,
    });
  }

  const seen = new Set();
  const unique = [];
  for (const card of candidates) {
    const last4 = String(card?.cardLast4 || '')
      .replace(/\D/g, '')
      .slice(-4);
    if (last4.length !== 4) continue;
    const fp = cardFingerprint(card);
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

/**
 * Persist any legacy base-deal card into savedCards when missing from the vault.
 * Mutates lead; returns true if lead.savedCards changed.
 */
export function syncLegacyCardsIntoVault(lead) {
  if (!lead) return false;
  if (!Array.isArray(lead.savedCards)) lead.savedCards = [];

  const payment = lead.payment;
  if (payment?.method !== 'via_card' || !payment.cardLast4) return false;

  const last4 = String(payment.cardLast4).replace(/\D/g, '').slice(-4);
  if (last4.length !== 4) return false;

  const legacyFp = cardFingerprint({
    cardLast4: last4,
    expiry: payment.cardExpiry,
    cardReferenceToken: payment.cardReferenceToken,
    nameOnCard: payment.cardHolderName,
  });

  const exists = lead.savedCards.some(
    (c) => cardFingerprint(c) === legacyFp
  );
  if (exists) return false;

  appendSavedCard(
    lead,
    buildSavedCardEntry({
      cardLast4: last4,
      cardBrand: payment.cardBrand || null,
      cardReferenceToken: payment.cardReferenceToken || null,
      expiry: payment.cardExpiry || null,
      nameOnCard: payment.cardHolderName || null,
      billingZipCode: payment.billingZip || null,
      source: 'close_sale',
      cvcCollected: true,
      addedAt: lead.closedAt || lead.createdAt || new Date(),
    })
  );
  return true;
}
