import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { closeLead } from '../../services/lead.service.js';

const fieldClass =
  'w-full rounded-md border border-white/15 bg-obsidian px-3 py-2 text-sm text-ink outline-none focus:border-flash-secondary';

const CARD_BRANDS = [
  { value: '', label: 'Select brand' },
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'American Express' },
  { value: 'discover', label: 'Discover' },
  { value: 'other', label: 'Other' },
];

const METHOD_OPTIONS = [
  { value: 'via_link', label: 'Via link' },
  { value: 'via_card', label: 'Via card' },
  { value: 'other', label: 'Other' },
];

/** Format PAN digits as #### #### #### #### for display only. */
const formatCardNumber = (digits) => {
  const clean = String(digits || '').replace(/\D/g, '').slice(0, 19);
  return clean.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
};

/** Format expiry as MM/YY while typing. */
const formatExpiry = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

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
  queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
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
  const [cardBrand, setCardBrand] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [otherDetails, setOtherDetails] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMethod('via_link');
    setCardBrand('');
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

  const buildPayment = () => {
    if (method === 'via_link') {
      return { payment: { method: 'via_link' } };
    }

    if (method === 'other') {
      const details = otherDetails.trim();
      if (details.length < 2) {
        return {
          error: 'Enter the payment method / details (e.g. Bank Transfer, Cash).',
        };
      }
      return {
        payment: { method: 'other', otherDetails: details },
      };
    }

    // via_card
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) {
      return { error: 'Enter a valid card number (13–19 digits).' };
    }
    if (!cardBrand) {
      return { error: 'Select a card brand.' };
    }
    if (!/^\d{2}\/\d{2}$/.test(cardExpiry.trim())) {
      return { error: 'Enter expiry as MM/YY.' };
    }
    const [mm, yy] = cardExpiry.split('/').map(Number);
    if (mm < 1 || mm > 12) {
      return { error: 'Expiry month must be between 01 and 12.' };
    }
    if (!/^\d{3,4}$/.test(cardCvv.trim())) {
      return { error: 'Enter a valid 3 or 4 digit CVC / CVV.' };
    }

    const cardLast4 = digits.slice(-4);
    // Opaque placeholder — never send raw PAN, expiry, or CVV to the API
    const cardReferenceToken = `local_${cardBrand}_${cardLast4}_${Date.now()}`;

    return {
      payment: {
        method: 'via_card',
        cardLast4,
        cardBrand,
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
                  <span>Card Brand</span>
                  <select
                    required
                    value={cardBrand}
                    onChange={(e) => setCardBrand(e.target.value)}
                    className={fieldClass}
                  >
                    {CARD_BRANDS.map((b) => (
                      <option key={b.value || 'empty'} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1.5 text-sm text-ink/80">
                  <span>Card Number</span>
                  <input
                    required
                    inputMode="numeric"
                    value={cardNumber}
                    onChange={(e) =>
                      setCardNumber(formatCardNumber(e.target.value))
                    }
                    placeholder="ACCT-000035"
                    className={fieldClass}
                    autoComplete="off"
                  />
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
                      maxLength={4}
                      value={cardCvv}
                      onChange={(e) =>
                        setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                      placeholder="123"
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
