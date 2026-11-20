/**
 * Universal BIN / IIN card brand detection + display formatting.
 * Digits-only detection; never persist raw PAN beyond last4 on the client submit path.
 */

const BRANDS = [
  {
    id: 'amex',
    label: 'Amex',
    // American Express
    test: (d) => /^3[47]/.test(d),
    gaps: [4, 10],
    lengths: [15],
    cvvLength: 4,
  },
  {
    id: 'diners',
    label: 'Diners Club',
    test: (d) => /^3(?:0[0-5]|[68]\d)/.test(d),
    gaps: [4, 10],
    lengths: [14, 16, 19],
    cvvLength: 3,
  },
  {
    id: 'jcb',
    label: 'JCB',
    test: (d) => /^(?:2131|1800|35\d{0,3})/.test(d),
    gaps: [4, 8, 12],
    lengths: [16, 17, 18, 19],
    cvvLength: 3,
  },
  {
    id: 'elo',
    label: 'Elo',
    test: (d) =>
      /^(4011|438935|451416|4576|504175|5067|5090|627780|636297|636368)/.test(d),
    gaps: [4, 8, 12],
    lengths: [16],
    cvvLength: 3,
  },
  {
    id: 'maestro',
    label: 'Maestro',
    test: (d) =>
      /^(5018|5020|5038|5893|6304|6759|6761|6763)/.test(d),
    gaps: [4, 8, 12],
    lengths: [12, 13, 14, 15, 16, 17, 18, 19],
    cvvLength: 3,
  },
  {
    id: 'unionpay',
    label: 'UnionPay',
    // Prefer UnionPay over Discover for 62* when overlapping
    test: (d) => /^(62|81)/.test(d),
    gaps: [4, 8, 12],
    lengths: [16, 17, 18, 19],
    cvvLength: 3,
  },
  {
    id: 'discover',
    label: 'Discover',
    test: (d) => /^(6011|65|64[4-9]|622)/.test(d),
    gaps: [4, 8, 12],
    lengths: [16, 17, 18, 19],
    cvvLength: 3,
  },
  {
    id: 'mastercard',
    label: 'Mastercard',
    test: (d) =>
      /^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(d),
    gaps: [4, 8, 12],
    lengths: [16],
    cvvLength: 3,
  },
  {
    id: 'visa',
    label: 'Visa',
    test: (d) => /^4/.test(d),
    gaps: [4, 8, 12],
    lengths: [13, 16, 19],
    cvvLength: 3,
  },
];

const UNKNOWN = {
  id: 'other',
  label: 'Other',
  gaps: [4, 8, 12],
  lengths: [16, 19],
  cvvLength: 3,
};

/** Digits only from a raw / formatted card string. */
export function cardDigitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Detect brand from PAN digits (as typed — works with partial BINs).
 * @returns {{ id: string, label: string, gaps: number[], lengths: number[], cvvLength: number }}
 */
export function detectCardBrand(digitsOrRaw) {
  const digits = cardDigitsOnly(digitsOrRaw);
  if (!digits) return { ...UNKNOWN, id: '', label: '' };

  for (const brand of BRANDS) {
    if (brand.test(digits)) {
      return {
        id: brand.id,
        label: brand.label,
        gaps: brand.gaps,
        lengths: brand.lengths,
        cvvLength: brand.cvvLength,
      };
    }
  }

  return { ...UNKNOWN };
}

/** Max digit length for the detected (or standard) brand. */
export function maxCardDigits(brand) {
  const lengths = brand?.lengths?.length
    ? brand.lengths
    : UNKNOWN.lengths;
  return Math.max(...lengths);
}

/**
 * Format PAN with brand-aware spacing.
 * Amex: #### ###### #####
 * Diners (14): #### ###### ####
 * Standard: #### #### #### #### (+ extra groups up to 19)
 */
export function formatCardNumber(raw, brandHint = null) {
  const brand = brandHint || detectCardBrand(raw);
  const max = maxCardDigits(brand);
  const digits = cardDigitsOnly(raw).slice(0, max);

  if (!digits) return '';

  // Amex: 4-6-5
  if (brand.id === 'amex') {
    const a = digits.slice(0, 4);
    const b = digits.slice(4, 10);
    const c = digits.slice(10, 15);
    return [a, b, c].filter(Boolean).join(' ');
  }

  // Diners Club classic 14: 4-6-4
  if (brand.id === 'diners' && digits.length <= 14) {
    const a = digits.slice(0, 4);
    const b = digits.slice(4, 10);
    const c = digits.slice(10, 14);
    return [a, b, c].filter(Boolean).join(' ');
  }

  // Standard 4-4-4-4… up to max
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

/** Payload brand string (canonical id). Empty → other when submitting with digits. */
export function brandPayloadId(brand) {
  if (!brand?.id) return 'other';
  return brand.id;
}

const BRAND_LABEL_BY_ID = Object.fromEntries(
  BRANDS.map((b) => [b.id, b.label])
);

/**
 * Human-readable brand for UI (Visa, Mastercard, Amex, …).
 * Accepts canonical id, detectCardBrand result, or free-form string.
 */
export function formatCardBrandLabel(brandOrId) {
  if (brandOrId == null || brandOrId === '') return '';
  if (typeof brandOrId === 'object') {
    if (brandOrId.label) return String(brandOrId.label).trim();
    return formatCardBrandLabel(brandOrId.id);
  }
  const raw = String(brandOrId).trim();
  if (!raw) return '';
  const id = raw.toLowerCase();
  if (id === 'other' || id === 'card' || id === 'unknown') return '';
  if (BRAND_LABEL_BY_ID[id]) return BRAND_LABEL_BY_ID[id];
  // Already a display label (e.g. "American Express")
  if (/[A-Z]/.test(raw) && raw.includes(' ')) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Resolve a canonical brand id for a saved/payment card:
 * 1) stored cardBrand / brand
 * 2) detect from cardNumber / pan digits when present
 * 3) parse opaque token `local_{brand}_{last4}_…`
 */
export function resolveCardBrandId(card) {
  if (!card || typeof card !== 'object') return '';

  const stored = String(card.cardBrand || card.brand || '')
    .trim()
    .toLowerCase();
  if (stored && stored !== 'other' && stored !== 'card' && stored !== 'unknown') {
    return stored;
  }

  const digits = cardDigitsOnly(
    card.cardNumber || card.number || card.pan || ''
  );
  if (digits.length >= 4) {
    const detected = detectCardBrand(digits);
    if (detected?.id) return detected.id;
  }

  const token = String(card.cardReferenceToken || '');
  const fromToken = token.match(/^local_([a-z0-9]+)_/i);
  if (fromToken?.[1]) {
    const id = fromToken[1].toLowerCase();
    if (id && id !== 'card' && id !== 'other' && id !== 'unknown') return id;
  }

  return stored === 'other' ? 'other' : '';
}
