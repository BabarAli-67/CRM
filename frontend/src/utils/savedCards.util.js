/**
 * Client-side aggregation of lead saved cards for CST Upsell Old Card tabs.
 * Dedupes by last4 + name + zip (not by missing vs populated expiry).
 */

import { resolveCardBrandId } from './cardBrand.util.js';

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

/** Identity key: last4 + holder + zip (ignores empty vs populated expiry). */
export function cardIdentityKey(card) {
  const last4 = normalizeLast4(card);
  if (last4.length !== 4) return '';
  return `${last4}|${normalizeName(card)}|${normalizeZip(card)}`;
}

const pickRicher = (a, b) => (a && String(a).trim() ? a : b && String(b).trim() ? b : a || b || null);

/** Merge two representations of the same card — prefer non-empty fields. */
function mergeCardEntries(base, next) {
  const expiry = normalizeCardExpiry(base) || normalizeCardExpiry(next) || null;
  const addedA = base?.addedAt ? new Date(base.addedAt).getTime() : 0;
  const addedB = next?.addedAt ? new Date(next.addedAt).getTime() : 0;
  const preferNextId = Boolean(next?.cardId) && String(next.cardId).startsWith('legacy-') === false;
  const preferBaseId = Boolean(base?.cardId) && String(base.cardId).startsWith('legacy-') === false;

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

function normalizeCandidate(raw) {
  const last4 = normalizeLast4(raw);
  if (last4.length !== 4) return null;
  const cardBrand = resolveCardBrandId(raw) || null;
  return {
    ...raw,
    cardLast4: last4,
    cardBrand,
    expiry: normalizeCardExpiry(raw) || null,
    nameOnCard:
      String(raw?.nameOnCard || raw?.cardHolderName || '').trim() || null,
    billingZipCode:
      String(raw?.billingZipCode || raw?.billingZip || raw?.zip || '').trim() ||
      null,
  };
}

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
    });
  }

  const byKey = new Map();
  for (const raw of candidates) {
    const card = normalizeCandidate(raw);
    if (!card) continue;
    const key = cardIdentityKey(card);
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
