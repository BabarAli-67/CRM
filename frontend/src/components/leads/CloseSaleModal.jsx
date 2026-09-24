import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useAuth from '../../hooks/useAuth.hook.js';
import {
  closeLead,
  getLeadById,
  getUsers,
} from '../../services/lead.service.js';
import {
  brandPayloadId,
  cardDigitsOnly,
  detectCardBrand,
  formatCardNumber,
  maxCardDigits,
} from '../../utils/cardBrand.util.js';

const fieldClass =
  'w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

const readOnlyClass = `${fieldClass} opacity-90`;

const METHOD_OPTIONS = [
  { value: 'via_card', label: 'Card' },
  { value: 'via_link', label: 'Payment Link' },
  { value: 'other', label: 'Others' },
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
        className="inline-flex h-7 w-10 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-500"
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

const emptyReview = {
  clientName: '',
  businessName: '',
  phone: '',
  workEmail: '',
  personalEmail: '',
  websiteLink: '',
  gmbLink: '',
  servicesArea: '',
  serviceOffered: '',
  salesAmount: '',
  notes: '',
};

const mapLeadToReview = (lead) => {
  if (!lead) return emptyReview;
  return {
    clientName: lead.clientName || '',
    businessName: lead.businessName || '',
    phone: lead.phone || '',
    workEmail: lead.workEmail || '',
    personalEmail: lead.personalEmail || '',
    websiteLink: lead.websiteLink || '',
    gmbLink: lead.gmbLink || '',
    servicesArea: lead.servicesArea || '',
    serviceOffered: lead.serviceOffered || '',
    salesAmount:
      lead.salesAmount != null && lead.salesAmount !== ''
        ? String(lead.salesAmount)
        : '',
    notes: lead.notes || '',
  };
};

const normalizeUrl = (raw) => {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
};

/**
 * Instantly drop a closed lead from active caches and sync closed-sales lists.
 */
function applyCloseCaches(queryClient, leadId, closedLead) {
  const removeFromList = (old) => {
    if (!Array.isArray(old)) return old;
    return old.filter((l) => String(l._id) !== String(leadId));
  };

  queryClient.setQueryData(['myLeads'], removeFromList);
  queryClient.setQueryData(['assignedLeads'], removeFromList);
  queryClient.setQueryData(['closerPool'], removeFromList);

  // Strip linked callbacks from agent agenda so chimes stop immediately
  queryClient.setQueryData(['myCallbacks'], (old) => {
    if (!Array.isArray(old)) return old;
    return old.filter((cb) => {
      const linked = cb.leadId?._id || cb.leadId;
      return String(linked) !== String(leadId);
    });
  });

  if (closedLead?._id) {
    queryClient.setQueryData(['agentClosedSales'], (old) => {
      const list = Array.isArray(old) ? old : [];
      if (list.some((l) => String(l._id) === String(closedLead._id))) {
        return list.map((l) =>
          String(l._id) === String(closedLead._id) ? closedLead : l
        );
      }
      return [closedLead, ...list];
    });
    queryClient.setQueryData(['closerClosedSales'], (old) => {
      const list = Array.isArray(old) ? old : [];
      if (list.some((l) => String(l._id) === String(closedLead._id))) {
        return list.map((l) =>
          String(l._id) === String(closedLead._id) ? closedLead : l
        );
      }
      return [closedLead, ...list];
    });
  }

  queryClient.removeQueries({ queryKey: ['lead', leadId] });
  queryClient.invalidateQueries({ queryKey: ['myLeads'] });
  queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
  queryClient.invalidateQueries({ queryKey: ['closerPool'] });
  queryClient.invalidateQueries({ queryKey: ['allLeads'] });
  queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
  queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
  queryClient.invalidateQueries({ queryKey: ['myClosedCount'] });
  queryClient.invalidateQueries({ queryKey: ['closerClosedSales'] });
  queryClient.invalidateQueries({ queryKey: ['agentClosedSales'] });
  queryClient.setQueryData(['myClosedCount'], (old) =>
    typeof old === 'number' ? old + 1 : old
  );
}

/**
 * Close-sale modal: intake review, required closer (agents), universal BIN payment.
 */
export default function CloseSaleModal({ open, lead, onClose, onSuccess }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAgent = user?.role === 'sales_agent';
  const leadId = lead?._id || null;

  const [review, setReview] = useState(emptyReview);
  const [closerId, setCloserId] = useState('');
  const [method, setMethod] = useState('via_card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [otherDetails, setOtherDetails] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(false);

  // Fresh full intake from API so table row stubs never leave fields blank
  const { data: freshLead } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => getLeadById(leadId),
    enabled: Boolean(open && leadId),
    staleTime: 0,
  });

  const selectedLead = freshLead || lead;

  const agentDisplayName =
    selectedLead?.agentId?.fullName ||
    selectedLead?.agentId?.username ||
    user?.fullName ||
    user?.username ||
    '—';

  const { data: closers = [], isLoading: closersLoading } = useQuery({
    queryKey: ['users', 'closer', 'approved'],
    queryFn: () => getUsers({ role: 'closer', status: 'approved' }),
    enabled: open && isAgent,
  });

  const detectedBrand = useMemo(
    () => detectCardBrand(cardNumber),
    [cardNumber]
  );
  const cardBrand = brandPayloadId(detectedBrand);
  const cvvMax = detectedBrand.cvvLength || 3;

  useEffect(() => {
    if (!open || !selectedLead) return;
    setReview(mapLeadToReview(selectedLead));
    setCloserId(
      selectedLead.closerId?._id
        ? String(selectedLead.closerId._id)
        : selectedLead.closerId
          ? String(selectedLead.closerId)
          : ''
    );
  }, [open, selectedLead]);

  useEffect(() => {
    if (!open) return;
    setMethod('via_card');
    setCardNumber('');
    setCardExpiry('');
    setCardCvv('');
    setLinkUrl('');
    setOtherDetails('');
    setError('');
  }, [open, leadId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timerId = window.setTimeout(() => setToast(false), 2800);
    return () => window.clearTimeout(timerId);
  }, [toast]);

  useEffect(() => {
    setCardCvv((prev) => prev.slice(0, cvvMax));
  }, [cvvMax]);

  const mutation = useMutation({
    mutationFn: ({ id, payload }) => closeLead(id, payload),
    onSuccess: (data, variables) => {
      setError('');
      applyCloseCaches(queryClient, variables.id, data?.lead || null);
      setToast(true);
      onSuccess?.(data?.lead);
      onClose?.();
    },
    onError: (err) => {
      setError(err?.response?.data?.message || 'Failed to close sale.');
    },
  });

  const handleReviewChange = (field) => (e) => {
    setReview((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleCardNumberChange = (raw) => {
    const brand = detectCardBrand(raw);
    setCardNumber(formatCardNumber(raw, brand));
  };

  const buildPayment = () => {
    if (method === 'via_link') {
      const url = linkUrl.trim();
      if (url.length < 2) {
        return {
          error:
            'Enter the payment transaction ID, confirmation link, or receipt reference.',
        };
      }
      return { payment: { method: 'via_link', linkUrl: url } };
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

    if (!review.businessName.trim() || !review.phone.trim()) {
      setError('Business name and phone are required.');
      return;
    }

    if (isAgent && !closerId) {
      setError('Select a closer to hand this sale to.');
      return;
    }

    const built = buildPayment();
    if (built.error) {
      setError(built.error);
      return;
    }

    let salesAmount = null;
    const salesRaw = review.salesAmount.trim();
    if (salesRaw !== '') {
      const n = Number(salesRaw);
      if (Number.isNaN(n) || n < 0) {
        setError('Sales amount must be a valid non-negative number.');
        return;
      }
      salesAmount = n;
    }

    const payload = {
      payment: built.payment,
      clientName: review.clientName.trim() || null,
      businessName: review.businessName.trim(),
      phone: review.phone.trim(),
      workEmail: review.workEmail.trim() || null,
      personalEmail: review.personalEmail.trim() || null,
      websiteLink: normalizeUrl(review.websiteLink),
      gmbLink: normalizeUrl(review.gmbLink),
      servicesArea: review.servicesArea.trim() || null,
      serviceOffered: review.serviceOffered.trim() || null,
      salesAmount,
      notes: review.notes.trim() || null,
    };

    if (isAgent) {
      payload.closerId = closerId;
    }

    mutation.mutate({ id: selectedLead._id, payload });
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

      {open && selectedLead ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-sale-modal-title"
        >
          <button
            type="button"
            aria-label="Close backdrop"
            className="absolute inset-0 cursor-default"
            onClick={onClose}
          />
          <form
            onSubmit={handleSubmit}
            className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
            autoComplete="off"
          >
            <div className="border-b border-zinc-800 px-5 py-4">
              <h3
                id="close-sale-modal-title"
                className="font-display text-lg font-semibold text-white"
              >
                Move to Closed Sale
              </h3>
              <p className="mt-1 text-sm text-zinc-400">
                Review full intake · assign closer · capture payment
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {/* Intake review — full parity with Lead Form */}
              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Lead details
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Client Name</span>
                    <input
                      value={review.clientName}
                      onChange={handleReviewChange('clientName')}
                      className={fieldClass}
                      placeholder="Contact person"
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Business Name *</span>
                    <input
                      required
                      value={review.businessName}
                      onChange={handleReviewChange('businessName')}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Phone Number *</span>
                    <input
                      required
                      value={review.phone}
                      onChange={handleReviewChange('phone')}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Business Email</span>
                    <input
                      type="email"
                      value={review.workEmail}
                      onChange={handleReviewChange('workEmail')}
                      className={fieldClass}
                      placeholder="ops@business.com"
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Personal Email</span>
                    <input
                      type="email"
                      value={review.personalEmail}
                      onChange={handleReviewChange('personalEmail')}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Website Link</span>
                    <input
                      type="url"
                      placeholder="https://"
                      value={review.websiteLink}
                      onChange={handleReviewChange('websiteLink')}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>GMB Link</span>
                    <input
                      type="url"
                      placeholder="Google My Business URL"
                      value={review.gmbLink}
                      onChange={handleReviewChange('gmbLink')}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Service Area</span>
                    <input
                      value={review.servicesArea}
                      onChange={handleReviewChange('servicesArea')}
                      className={fieldClass}
                      placeholder="City, State, or Region"
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Services Offered</span>
                    <input
                      value={review.serviceOffered}
                      onChange={handleReviewChange('serviceOffered')}
                      className={fieldClass}
                      placeholder="Website, SEO, Yelp"
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Sales Amount</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={review.salesAmount}
                        onChange={handleReviewChange('salesAmount')}
                        className={`${fieldClass} pl-7`}
                        placeholder="0.00"
                      />
                    </div>
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Agent Name</span>
                    <input
                      readOnly
                      value={agentDisplayName}
                      className={readOnlyClass}
                      tabIndex={-1}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300 sm:col-span-2">
                    <span>Notes / Call Summary</span>
                    <textarea
                      rows={3}
                      value={review.notes}
                      onChange={handleReviewChange('notes')}
                      className={`${fieldClass} resize-y`}
                      placeholder="Call details / summary"
                    />
                  </label>
                </div>
              </section>

              {isAgent ? (
                <section className="space-y-2">
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span className="font-medium">Select Closer *</span>
                    <select
                      required
                      value={closerId}
                      onChange={(e) => setCloserId(e.target.value)}
                      className={`${fieldClass} appearance-none cursor-pointer`}
                      disabled={closersLoading}
                    >
                      <option value="">
                        {closersLoading
                          ? 'Loading closers…'
                          : 'Choose a closer…'}
                      </option>
                      {closers.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.fullName || c.username}
                          {c.username ? ` (@${c.username})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-zinc-500">
                    This sale appears immediately on the selected closer&apos;s
                    Closed Sales Review for CST handover.
                  </p>
                </section>
              ) : null}

              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Payment method
                </h4>
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
                            : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {method === 'via_link' ? (
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Transaction ID / Confirmation Link / Receipt</span>
                    <input
                      required
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://… or receipt / txn reference"
                      className={fieldClass}
                    />
                  </label>
                ) : null}

                {method === 'via_card' ? (
                  <div className="space-y-3">
                    <label className="block space-y-1.5 text-sm text-zinc-300">
                      <span>Card Number</span>
                      <div className="relative">
                        <input
                          required
                          inputMode="numeric"
                          value={cardNumber}
                          onChange={(e) =>
                            handleCardNumberChange(e.target.value)
                          }
                          placeholder="#### #### #### ####"
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
                        <span className="text-[11px] text-zinc-500">
                          Detected: {detectedBrand.label}
                          {cardBrand ? ` · saved as “${cardBrand}”` : ''}
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-500">
                          Brand is detected automatically as you type
                        </span>
                      )}
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block space-y-1.5 text-sm text-zinc-300">
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
                      <label className="block space-y-1.5 text-sm text-zinc-300">
                        <span>CVC / CVV</span>
                        <input
                          required
                          inputMode="numeric"
                          maxLength={cvvMax}
                          value={cardCvv}
                          onChange={(e) =>
                            setCardCvv(
                              e.target.value
                                .replace(/\D/g, '')
                                .slice(0, cvvMax)
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
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Payment notes / mode</span>
                    <textarea
                      required
                      rows={3}
                      value={otherDetails}
                      onChange={(e) => setOtherDetails(e.target.value)}
                      placeholder="Bank Transfer, Cash, PayPal, etc."
                      maxLength={200}
                      className={`${fieldClass} resize-y`}
                    />
                  </label>
                ) : null}
              </section>

              {error ? (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={mutation.isPending}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
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
