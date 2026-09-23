import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { closeLead } from '../../services/lead.service.js';
import {
  brandPayloadId,
  cardDigitsOnly,
  detectCardBrand,
  formatCardNumber,
  maxCardDigits,
} from '../../utils/cardBrand.util.js';

const fieldClass =
  'w-full rounded-md border border-white/15 bg-obsidian px-3 py-2 text-sm text-ink outline-none focus:border-flash-secondary';

const METHOD_OPTIONS = [
  { value: 'via_link', label: 'Via link' },
  { value: 'via_card', label: 'Via card' },
  { value: 'other', label: 'Other' },
];

/** Format expiry as MM/YY while typing. */
const formatExpiry = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const BRAND_BADGE = {
  visa: 'bg-[#1A1F71]/text-white',
  mastercard: 'bg-[#EB001B]/text-white',
  amex: 'bg-[#2E77BC] text-white',
  discover: 'bg-[#FF6000] text-white',
  jcb: 'bg-[#0E4C96] text-white',
  diners: 'bg-[#0079BE] text-white',
  unionpay: 'bg-[#E21836] text-white',
  maestro: 'bg-[#009CDE] text-white',
  elo: 'bg-[#00A4E0] text-white',
  other: 'bg-zinc-700 text-zinc-200',
};

function CardBrandBadge({ brand }) {
  if (!brand?.id) {
    return (
      <span
        className="inline-flex h-7 w-10 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-500"
        title="Card brand"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      </span>
    );
  }

  const tone = BRAND_BADGE[brand.id] || BRAND_BADGE.other;
  return (
    <span
      className={`inline-flex h-7 max-w-[5.5rem] items-center truncate rounded-md px-1.5 text-[10px] font-bold uppercase tracking-wide ${tone}`}
      title={brand.label}
    >
      {brand.label}
    </span>
  );
}

/**
 * Instantly drop a closed lead from mine / assigned-to-me caches (Vanishing Rule).
 */
function vanishLeadFromCaches(queryClient, leadId) {
  const removeFromList = (old) => {
    if (!Array.isArray(old)) return old;
    return old.filter((l) => l._id !== leadId);
  };

  queryClient.setQueryData(['myLeads'], removeFromList);
  queryClient.setQueryData(['assignedLeads'], removeFromList);
  queryClient.removeQueries({ queryKey: ['lead', leadId] });
  queryClient.invalidateQueries({ queryKey: ['myLeads'] });
  queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
  queryClient.invalidateQueries({ queryKey: ['closerPool'] });
  queryClient.invalidateQueries({ queryKey: ['allLeads'] });
  queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
  queryClient.invalidateQueries({ queryKey: ['myClosedCount'] });
  queryClient.invalidateQueries({ queryKey: ['closerClosedSales'] });
  queryClient.setQueryData(['myClosedCount'], (old) =>
    typeof old === 'number' ? old + 1 : old
  );
}

/**
 * Payment capture modal for closing a sale.
 * Via card UI collects full card fields for the agent, but only last4 + brand
 * + an opaque reference token are sent to the API (no raw PAN / CVV stored).
 */
export default function CloseSaleModal({ open, lead, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState('via_link');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [otherDetails, setOtherDetails] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(false);

  const detectedBrand = useMemo(
    () => detectCardBrand(cardNumber),
    [cardNumber]
  );
  const cardBrand = brandPayloadId(detectedBrand);
  const cvvMax = detectedBrand.cvvLength || 3;

  useEffect(() => {
    if (!open) return;
    setMethod('via_link');
    setCardNumber('');
    setCardExpiry('');
    setCardCvv('');
    setOtherDetails('');
    setError('');
  }, [open, lead?._id]);

  useEffect(() => {
    if (!toast) return undefined;
    const timerId = window.setTimeout(() => setToast(false), 2800);
    return () => window.clearTimeout(timerId);
  }, [toast]);

  // Trim CVV if brand switches Amex (4) ↔ standard (3)
  useEffect(() => {
    setCardCvv((prev) => prev.slice(0, cvvMax));
  }, [cvvMax]);

  const mutation = useMutation({
    mutationFn: ({ id, payment }) => closeLead(id, payment),
    onSuccess: (_data, variables) => {
      setError('');
      vanishLeadFromCaches(queryClient, variables.id);
      setToast(true);
      onSuccess?.();
      onClose?.();
    },
    onError: (err) => {
      setError(err?.response?.data?.message || 'Failed to close sale.');
    },
  });

  const handleCardNumberChange = (raw) => {
    const brand = detectCardBrand(raw);
    setCardNumber(formatCardNumber(raw, brand));
  };

  const buildPayment = () => {
    if (method === 'via_link') {
      return { payment: { method: 'via_link' } };
    }

    if (method === 'other') {
      const details = otherDetails.trim();
      if (details.length < 2) {
        return {
          error:
            'Enter the payment method / details (e.g. Bank Transfer, Cash).',
        };
      }
      return {
        payment: { method: 'other', otherDetails: details },
      };
    }

    // via_card
    const digits = cardDigitsOnly(cardNumber);
    const brand = detectCardBrand(digits);
    const brandId = brandPayloadId(brand);
    const maxLen = maxCardDigits(brand);
    const minLen = brand.id === 'amex' ? 15 : brand.id === 'diners' ? 14 : 13;

    if (digits.length < minLen || digits.length > maxLen) {
      return {
        error: `Enter a valid ${brand.label || 'card'} number (${minLen}–${maxLen} digits).`,
      };
    }
    if (!/^\d{2}\/\d{2}$/.test(cardExpiry.trim())) {
      return { error: 'Enter expiry as MM/YY.' };
    }
    const [mm] = cardExpiry.split('/').map(Number);
    if (mm < 1 || mm > 12) {
      return { error: 'Expiry month must be between 01 and 12.' };
    }
    const cvvRe = new RegExp(`^\\d{${brand.cvvLength}}$`);
    if (!cvvRe.test(cardCvv.trim())) {
      return {
        error: `Enter a valid ${brand.cvvLength}-digit CVC / CVV.`,
      };
    }

    const cardLast4 = digits.slice(-4);
    const cardReferenceToken = `local_${brandId}_${cardLast4}_${Date.now()}`;

    return {
      payment: {
        method: 'via_card',
        cardLast4,
        cardBrand: brandId,
        cardReferenceToken,
      },
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const built = buildPayment();
    if (built.error) {
      setError(built.error);
      return;
    }
    mutation.mutate({ id: lead._id, payment: built.payment });
  };

  return (
    <>
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 right-6 z-[70] rounded-md border border-emerald-400/30 bg-emerald-950/95 px-4 py-2.5 text-sm font-semibold text-emerald-200 shadow-lg"
        >
          +1 Closed Sale
        </div>
      ) : null}

      {open && lead ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-sale-modal-title"
        >
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-obsidian-surface p-5 shadow-xl"
            autoComplete="off"
          >
            <div>
              <h3
                id="close-sale-modal-title"
                className="font-display text-lg font-semibold text-ink"
              >
                Move to Closed Sale
              </h3>
              <p className="mt-1 text-sm text-ink/70">
                {lead.businessName || 'Lead'}
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm text-ink/80">Payment method</legend>
              <div className="flex flex-wrap gap-2">
                {METHOD_OPTIONS.map((opt) => {
                  const active = method === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMethod(opt.value)}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                        active
                          ? 'bg-orange-600 text-white shadow-lg shadow-orange-950/30'
                          : 'border border-white/15 text-ink/80 hover:bg-white/5'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {method === 'via_link' ? (
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-ink/70">
                No extra details needed — confirm to close this sale as paid via
                link.
              </p>
            ) : null}

            {method === 'via_card' ? (
              <div className="space-y-3">
                <label className="block space-y-1.5 text-sm text-ink/80">
                  <span>Card Number</span>
                  <div className="relative">
                    <input
                      required
                      inputMode="numeric"
                      value={cardNumber}
                      onChange={(e) => handleCardNumberChange(e.target.value)}
                      placeholder="Card number"
                      className={`${fieldClass} pr-24`}
                      autoComplete="off"
                      aria-describedby="detected-card-brand"
                    />
                    <span
                      id="detected-card-brand"
                      className="pointer-events-none absolute inset-y-0 right-2 flex items-center"
                    >
                      <CardBrandBadge brand={detectedBrand} />
                    </span>
                  </div>
                  {detectedBrand.id ? (
                    <span className="text-[11px] text-ink/50">
                      Detected: {detectedBrand.label}
                      {cardBrand ? ` · saved as “${cardBrand}”` : ''}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink/45">
                      Brand is detected automatically as you type
                    </span>
                  )}
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1.5 text-sm text-ink/80">
                    <span>Expiry (MM/YY)</span>
                    <input
                      required
                      inputMode="numeric"
                      value={cardExpiry}
                      onChange={(e) =>
                        setCardExpiry(formatExpiry(e.target.value))
                      }
                      placeholder="09/28"
                      className={fieldClass}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-ink/80">
                    <span>CVC / CVV</span>
                    <input
                      required
                      inputMode="numeric"
                      maxLength={cvvMax}
                      value={cardCvv}
                      onChange={(e) =>
                        setCardCvv(
                          e.target.value.replace(/\D/g, '').slice(0, cvvMax)
                        )
                      }
                      placeholder={cvvMax === 4 ? '1234' : '123'}
                      className={fieldClass}
                      autoComplete="off"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {method === 'other' ? (
              <label className="block space-y-1.5 text-sm text-ink/80">
                <span>Payment Method / Details</span>
                <input
                  required
                  value={otherDetails}
                  onChange={(e) => setOtherDetails(e.target.value)}
                  placeholder="Bank Transfer, Cash, PayPal, etc."
                  maxLength={200}
                  className={fieldClass}
                />
              </label>
            ) : null}

            {error ? (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={mutation.isPending}
                className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-ink/80 hover:bg-white/5 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {mutation.isPending ? 'Closing…' : 'Confirm Close'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
