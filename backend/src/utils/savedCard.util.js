import { randomUUID } from 'crypto';

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

/** Map expiry / expiryDate / expDate / cardExpiry → MM/YY or ''. */
export function normalizeCardExpiry(cardOrValue) {
  if (cardOrValue == null) return '';
  if (typeof cardOrValue !== 'object') {
    const raw = String(cardOrValue).trim();
    if (!raw || raw === '—' || raw === '-') return '';
    const digits = digitsOnly(raw).slice(0, 4);
    if (digits.length === 4) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    const m = raw.match(/^(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/);
    if (m) {
      const mm = String(m[1]).padStart(2, '0');
      const yy = String(m[2]).slice(-2);
      return `${mm}/${yy}`;
    }
    return raw;
  }
  const raw =
    cardOrValue.expiry ??
    cardOrValue.expiryDate ??
    cardOrValue.expDate ??
    cardOrValue.cardExpiry ??
    '';
  return normalizeCardExpiry(raw);
}

const normalizeLast4 = (card) => {
  const fromLast4 = digitsOnly(card?.cardLast4).slice(-4);
  if (fromLast4.length === 4) return fromLast4;
  const fromNumber = digitsOnly(
    card?.cardNumber || card?.number || card?.pan
  ).slice(-4);
  return fromNumber.length === 4 ? fromNumber : '';
};

const normalizeName = (card) =>
  String(card?.nameOnCard || card?.cardHolderName || '')
    .trim()
    .toLowerCase();

const normalizeZip = (card) =>
  String(card?.billingZipCode || card?.billingZip || card?.zip || '')
    .trim()
    .toLowerCase();

/**
 * Identity for dedupe: last4 + holder + zip.
 * Ignores empty vs populated expiry so legacy/null expiry merges with full card.
 */
export function cardFingerprint(card) {
  const last4 = normalizeLast4(card);
  if (last4.length !== 4) return '';
  return `${last4}|${normalizeName(card)}|${normalizeZip(card)}`;
}

const pickRicher = (a, b) =>
  a && String(a).trim() ? a : b && String(b).trim() ? b : a || b || null;

function mergeCardEntries(base, next) {
  const expiry = normalizeCardExpiry(base) || normalizeCardExpiry(next) || null;
  const addedA = base?.addedAt ? new Date(base.addedAt).getTime() : 0;
  const addedB = next?.addedAt ? new Date(next.addedAt).getTime() : 0;
  const preferBaseId =
    Boolean(base?.cardId) && String(base.cardId).startsWith('legacy-') === false;
  const preferNextId =
    Boolean(next?.cardId) && String(next.cardId).startsWith('legacy-') === false;

  return {
    ...base,
    ...next,
    cardId: preferBaseId
      ? base.cardId
      : preferNextId
        ? next.cardId
        : base.cardId || next.cardId,
    cardLast4: normalizeLast4(base) || normalizeLast4(next),
    cardBrand: pickRicher(base?.cardBrand, next?.cardBrand),
    cardReferenceToken: pickRicher(
      base?.cardReferenceToken,
      next?.cardReferenceToken
    ),
    expiry,
    nameOnCard: pickRicher(
      base?.nameOnCard || base?.cardHolderName,
      next?.nameOnCard || next?.cardHolderName
    ),
    billingZipCode: pickRicher(
      base?.billingZipCode || base?.billingZip,
      next?.billingZipCode || next?.billingZip
    ),
    cvcOnFile:
      base?.cvcOnFile === false && next?.cvcOnFile === false ? false : true,
    addedAt:
      addedA && addedB
        ? new Date(Math.min(addedA, addedB))
        : base?.addedAt || next?.addedAt || null,
    source: base?.source || next?.source || null,
  };
}

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
  const last4 = digitsOnly(cardLast4).slice(-4);
  if (last4.length !== 4) {
    throw new Error('cardLast4 is required to save a card');
  }
  const normalizedExpiry = normalizeCardExpiry(expiry) || null;
  return {
    cardId: randomUUID(),
    cardLast4: last4,
    cardBrand: cardBrand ? String(cardBrand).trim() : null,
    cardReferenceToken: cardReferenceToken
      ? String(cardReferenceToken).trim()
      : `local_${cardBrand || 'card'}_${last4}_${Date.now()}`,
    expiry: normalizedExpiry,
    nameOnCard: nameOnCard ? String(nameOnCard).trim() : null,
    billingZipCode: billingZipCode ? String(billingZipCode).trim() : null,
    cvcOnFile: Boolean(cvcCollected),
    addedAt: addedAt ? new Date(addedAt) : new Date(),
    source: source || 'unknown',
  };
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
      cardId: `legacy-payment-${digitsOnly(payment.cardLast4).slice(-4)}`,
      cardLast4: payment.cardLast4,
      cardBrand: payment.cardBrand || null,
      cardReferenceToken: payment.cardReferenceToken || null,
      expiry: payment.cardExpiry,
      expiryDate: payment.expiryDate,
      expDate: payment.expDate,
      cardExpiry: payment.cardExpiry,
      nameOnCard: payment.cardHolderName || null,
      billingZipCode: payment.billingZip || null,
      cvcOnFile: true,
      addedAt: lead?.closedAt || lead?.createdAt || null,
      source: 'close_sale',
      _legacy: true,
    });
  }

  const byKey = new Map();
  for (const raw of candidates) {
    const last4 = normalizeLast4(raw);
    if (last4.length !== 4) continue;
    const card = {
      ...raw,
      cardLast4: last4,
      expiry: normalizeCardExpiry(raw) || null,
      nameOnCard:
        String(raw?.nameOnCard || raw?.cardHolderName || '').trim() || null,
      billingZipCode:
        String(
          raw?.billingZipCode || raw?.billingZip || raw?.zip || ''
        ).trim() || null,
    };
    const key = cardFingerprint(card);
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeCardEntries(existing, card) : card);
  }

  const unique = [...byKey.values()];
  unique.sort((a, b) => {
    const aMs = a?.addedAt ? new Date(a.addedAt).getTime() : 0;
    const bMs = b?.addedAt ? new Date(b.addedAt).getTime() : 0;
    return aMs - bMs;
  });

  return unique;
}

/**
 * Persist any legacy base-deal card into savedCards when missing from the vault.
 * Also backfills empty expiry on an existing matching vault card when payment has it.
 * Mutates lead; returns true if lead.savedCards changed.
 */
export function syncLegacyCardsIntoVault(lead) {
  if (!lead) return false;
  if (!Array.isArray(lead.savedCards)) lead.savedCards = [];

  const payment = lead.payment;
  if (payment?.method !== 'via_card' || !payment.cardLast4) return false;

  const last4 = digitsOnly(payment.cardLast4).slice(-4);
  if (last4.length !== 4) return false;

  const legacy = {
    cardLast4: last4,
    expiry: payment.cardExpiry,
    cardExpiry: payment.cardExpiry,
    expiryDate: payment.expiryDate,
    expDate: payment.expDate,
    nameOnCard: payment.cardHolderName,
    billingZipCode: payment.billingZip,
    cardReferenceToken: payment.cardReferenceToken,
    cardBrand: payment.cardBrand,
  };
  const legacyFp = cardFingerprint(legacy);
  if (!legacyFp) return false;

  const existingIdx = lead.savedCards.findIndex(
    (c) => cardFingerprint(c) === legacyFp
  );

  if (existingIdx >= 0) {
    const existing = lead.savedCards[existingIdx];
    const merged = mergeCardEntries(existing, {
      ...legacy,
      cardId: existing.cardId,
      source: existing.source || 'close_sale',
      addedAt: existing.addedAt || lead.closedAt || lead.createdAt,
      cvcOnFile: existing.cvcOnFile !== false,
    });
    const before = JSON.stringify({
      expiry: existing.expiry || null,
      nameOnCard: existing.nameOnCard || null,
      billingZipCode: existing.billingZipCode || null,
      cardBrand: existing.cardBrand || null,
    });
    const after = JSON.stringify({
      expiry: merged.expiry || null,
      nameOnCard: merged.nameOnCard || null,
      billingZipCode: merged.billingZipCode || null,
      cardBrand: merged.cardBrand || null,
    });
    if (before === after) return false;
    lead.savedCards[existingIdx] = {
      ...existing.toObject?.() || existing,
      expiry: merged.expiry,
      nameOnCard: merged.nameOnCard,
      billingZipCode: merged.billingZipCode,
      cardBrand: merged.cardBrand,
      cardReferenceToken:
        merged.cardReferenceToken || existing.cardReferenceToken,
    };
    return true;
  }

  appendSavedCard(
    lead,
    buildSavedCardEntry({
      cardLast4: last4,
      cardBrand: payment.cardBrand || null,
      cardReferenceToken: payment.cardReferenceToken || null,
      expiry: normalizeCardExpiry(legacy) || null,
      nameOnCard: payment.cardHolderName || null,
      billingZipCode: payment.billingZip || null,
      source: 'close_sale',
      cvcCollected: true,
      addedAt: lead.closedAt || lead.createdAt || new Date(),
    })
  );
  return true;
}
