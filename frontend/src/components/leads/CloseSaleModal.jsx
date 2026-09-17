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
  queryClient.invalidateQueries({ queryKey: ['myClosedCount'] });
  queryClient.setQueryData(['myClosedCount'], (old) =>
    typeof old === 'number' ? old + 1 : old
  );
}

/**
 * Payment capture modal for closing a sale.
 * Never collects raw PAN/CVV — token + last4 + brand only for via_card.
 *
 * @param {boolean} open
 * @param {object|null} lead
 * @param {() => void} onClose
 * @param {() => void} [onSuccess]
 */
export default function CloseSaleModal({ open, lead, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState('via_link');
  const [linkUrl, setLinkUrl] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [cardBrand, setCardBrand] = useState('');
  const [cardReferenceToken, setCardReferenceToken] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMethod('via_link');
    setLinkUrl('');
    setCardLast4('');
    setCardBrand('');
    setCardReferenceToken('');
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
      if (!linkUrl.trim()) {
        return { error: 'Payment link URL is required.' };
      }
      return {
        payment: { method: 'via_link', linkUrl: linkUrl.trim() },
      };
    }

    if (!/^\d{4}$/.test(cardLast4.trim())) {
      return { error: 'Enter exactly 4 digits for card last 4.' };
    }
    if (!cardBrand) {
      return { error: 'Select a card brand.' };
    }
    if (!cardReferenceToken.trim()) {
      return { error: 'Card reference token is required.' };
    }

    return {
      payment: {
        method: 'via_card',
        cardLast4: cardLast4.trim(),
        cardBrand,
        cardReferenceToken: cardReferenceToken.trim(),
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
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="payment-method"
                    value="via_link"
                    checked={method === 'via_link'}
                    onChange={() => setMethod('via_link')}
                    className="accent-flash-primary"
                  />
                  Via link
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="payment-method"
                    value="via_card"
                    checked={method === 'via_card'}
                    onChange={() => setMethod('via_card')}
                    className="accent-flash-primary"
                  />
                  Via card
                </label>
              </div>
            </fieldset>

            {method === 'via_link' ? (
              <label className="block space-y-1.5 text-sm text-ink/80">
                <span>Payment link URL</span>
                <input
                  type="url"
                  required
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://"
                  className={fieldClass}
                />
              </label>
            ) : (
              <div className="space-y-3">
                <label className="block space-y-1.5 text-sm text-ink/80">
                  <span>Last 4 digits</span>
                  <input
                    required
                    maxLength={4}
                    inputMode="numeric"
                    pattern="\d{4}"
                    value={cardLast4}
                    onChange={(e) =>
                      setCardLast4(e.target.value.replace(/\D/g, '').slice(0, 4))
                    }
                    placeholder="4242"
                    className={fieldClass}
                    autoComplete="off"
                  />
                </label>

                <label className="block space-y-1.5 text-sm text-ink/80">
                  <span>Card brand</span>
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
                  <span>Card reference token</span>
                  <input
                    required
                    value={cardReferenceToken}
                    onChange={(e) => setCardReferenceToken(e.target.value)}
                    placeholder="tok_…"
                    className={fieldClass}
                    autoComplete="off"
                  />
                  <span className="block text-xs leading-relaxed text-ink/55">
                    Must come from a real payment processor / tokenizer in
                    production. Do not enter a raw card number or CVV — that is a
                    PCI-DSS violation and out of scope for this internal tool.
                  </span>
                </label>
              </div>
            )}

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
