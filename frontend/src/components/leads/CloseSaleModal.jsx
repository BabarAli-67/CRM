import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useAuth from '../../hooks/useAuth.hook.js';
import { createCloserCallback } from '../../services/callback.service.js';
import {
  closeLead,
  getLeadById,
  getUsers,
} from '../../services/lead.service.js';
import {
  brandPayloadId,
  cardDigitsOnly,
  detectCardBrand,
  formatCardBrandLabel,
  formatCardNumber,
  maxCardDigits,
} from '../../utils/cardBrand.util.js';
import ContractOptionFields from './ContractOptionFields.jsx';
import {
  CONTRACT_MONTH_PRESETS,
  formatContractServicesLabel,
  parseContractMonths,
  stripContractLabel,
} from '../../utils/contract.util.js';

const fieldClass =
  'w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

const readOnlyClass = `${fieldClass} opacity-90`;

const numInputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 text-center text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

const METHOD_OPTIONS = [
  { value: 'via_card', label: 'Card' },
  { value: 'other', label: 'Others' },
];

const pad = (n) => String(n).padStart(2, '0');

const digitsOnly = (raw, maxLen) => {
  const d = String(raw || '').replace(/\D/g, '');
  return maxLen ? d.slice(0, maxLen) : d;
};

const clampOnBlur = (raw, min, max, { padTo = 0 } = {}) => {
  if (raw === '' || raw == null) return '';
  const n = Number(raw);
  if (Number.isNaN(n)) return '';
  const clamped = Math.min(max, Math.max(min, Math.trunc(n)));
  return padTo > 0 ? String(clamped).padStart(padTo, '0') : String(clamped);
};

const todayDateValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const splitDateTime = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) {
    return { date: '', hour: '', minute: '', period: 'AM' };
  }
  let h24 = d.getHours();
  const period = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour: pad(h12),
    minute: pad(d.getMinutes()),
    period,
  };
};

const toIsoTimestamp = ({ date, hour, minute, period }) => {
  if (
    !date ||
    hour === '' ||
    minute === '' ||
    hour == null ||
    minute == null ||
    !period
  ) {
    return null;
  }
  let h = Number(hour);
  const mi = Number(minute);
  if (
    Number.isNaN(h) ||
    Number.isNaN(mi) ||
    h < 1 ||
    h > 12 ||
    mi < 0 ||
    mi > 59
  ) {
    return null;
  }
  if (period === 'AM') {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }
  const [y, m, day] = date.split('-').map(Number);
  const local = new Date(y, m - 1, day, h, mi, 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
};

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
  personalPhone: '',
  businessPhone: '',
  businessEmail: '',
  personalEmail: '',
  websiteLink: '',
  gmbLink: '',
  serviceAreas: '',
  servicesOffered: '',
  contractEnabled: false,
  contractMonths: 3,
  contractMonthsCustom: '',
  contractAmount: '',
  paymentOffered: '',
  paymentReceived: '',
  paymentPending: '',
  notes: '',
};

const computePendingDisplay = (offeredRaw, receivedRaw) => {
  const offered = Number(String(offeredRaw ?? '').trim());
  const received = Number(receivedRaw) || 0;
  if (Number.isNaN(offered)) return '';
  return String(Math.max(0, offered - received));
};

const mapLeadToReview = (lead) => {
  if (!lead) return emptyReview;
  const paymentOffered =
    lead.paymentOffered != null && lead.paymentOffered !== ''
      ? String(lead.paymentOffered)
      : lead.salesAmount != null && lead.salesAmount !== ''
        ? String(lead.salesAmount)
        : '';
  // Empty when nothing received yet so placeholder="0" stays visible
  const receivedNum = Number(lead.paymentReceived);
  const paymentReceived =
    lead.paymentReceived != null &&
    lead.paymentReceived !== '' &&
    !Number.isNaN(receivedNum) &&
    receivedNum > 0
      ? String(lead.paymentReceived)
      : '';
  return {
    clientName: lead.clientName || '',
    businessName: lead.businessName || '',
    personalPhone: lead.personalPhone || '',
    businessPhone: lead.businessPhone || '',
    businessEmail: lead.businessEmail || '',
    personalEmail: lead.personalEmail || '',
    websiteLink: lead.websiteLink || '',
    gmbLink: lead.gmbLink || '',
    serviceAreas: lead.serviceAreas || '',
    servicesOffered: stripContractLabel(lead.servicesOffered || ''),
    contractEnabled: Boolean(lead.contractEnabled),
    contractMonths: (() => {
      const m = parseContractMonths(lead.contractMonths);
      if (m && CONTRACT_MONTH_PRESETS.includes(m)) return m;
      return m || 3;
    })(),
    contractMonthsCustom: (() => {
      const m = parseContractMonths(lead.contractMonths);
      return m && !CONTRACT_MONTH_PRESETS.includes(m) ? String(m) : '';
    })(),
    contractAmount:
      lead.contractAmount != null && lead.contractAmount !== ''
        ? String(lead.contractAmount)
        : paymentOffered,
    paymentOffered,
    paymentReceived,
    paymentPending: computePendingDisplay(paymentOffered, paymentReceived),
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
  queryClient.setQueryData(['closerDisqualified'], removeFromList);

  // Strip linked callbacks from agent agenda so chimes stop immediately
  queryClient.setQueryData(['myCallbacks'], (old) => {
    if (!Array.isArray(old)) return old;
    return old.filter((cb) => {
      const linked = cb.leadId?._id || cb.leadId;
      return String(linked) !== String(leadId);
    });
  });

  const prependClosed = (old) => {
    const list = Array.isArray(old) ? old : [];
    if (!closedLead?._id) return list;
    if (list.some((l) => String(l._id) === String(closedLead._id))) {
      return list.map((l) =>
        String(l._id) === String(closedLead._id) ? closedLead : l
      );
    }
    return [closedLead, ...list];
  };

  if (closedLead?._id) {
    // Month-scoped query keys: update every matching cache entry
    queryClient.setQueriesData({ queryKey: ['agentClosedSales'] }, prependClosed);
    queryClient.setQueriesData({ queryKey: ['closerClosedSales'] }, prependClosed);
  }

  queryClient.removeQueries({ queryKey: ['lead', leadId] });
  queryClient.invalidateQueries({ queryKey: ['myLeads'] });
  queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
  queryClient.invalidateQueries({ queryKey: ['closerDisqualified'] });
  queryClient.invalidateQueries({ queryKey: ['allLeads'] });
  queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
  queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
  queryClient.invalidateQueries({ queryKey: ['myClosedCount'] });
  queryClient.invalidateQueries({ queryKey: ['closerClosedSales'] });
  queryClient.invalidateQueries({ queryKey: ['agentClosedSales'] });
  queryClient.setQueriesData({ queryKey: ['myClosedCount'] }, (old) =>
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
  const isCloser = user?.role === 'closer';
  const leadId = lead?._id || null;

  const [review, setReview] = useState(emptyReview);
  const [closerId, setCloserId] = useState('');
  const [method, setMethod] = useState('via_card');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardHolderName, setCardHolderName] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [otherDetails, setOtherDetails] = useState('');
  const [cbDate, setCbDate] = useState('');
  const [cbHour, setCbHour] = useState('');
  const [cbMinute, setCbMinute] = useState('');
  const [cbPeriod, setCbPeriod] = useState('AM');
  const [cbNotes, setCbNotes] = useState('');
  const [originalCallbackAt, setOriginalCallbackAt] = useState(null);
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
    const parts = splitDateTime(selectedLead.followUp?.callbackAt);
    setCbDate(parts.date);
    setCbHour(parts.hour);
    setCbMinute(parts.minute);
    setCbPeriod(parts.period || 'AM');
    setCbNotes(selectedLead.followUp?.notes || '');
    setOriginalCallbackAt(
      selectedLead.followUp?.callbackAt
        ? new Date(selectedLead.followUp.callbackAt).toISOString()
        : null
    );
  }, [open, selectedLead]);

  useEffect(() => {
    if (!open) return;
    setMethod('via_card');
    setCardNumber('');
    setCardExpiry('');
    setCardCvv('');
    setCardHolderName('');
    setBillingZip('');
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
    mutationFn: async ({ id, payload, followUpUpsert }) => {
      // Upsert follow-up while lead is still active (API requires stage: active)
      if (followUpUpsert) {
        await createCloserCallback(followUpUpsert);
      }
      return closeLead(id, payload);
    },
    onSuccess: (data, variables) => {
      setError('');
      applyCloseCaches(queryClient, variables.id, data?.lead || null);
      queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
      setToast(true);
      onSuccess?.(data?.lead);
      onClose?.();
    },
    onError: (err) => {
      setError(err?.response?.data?.message || 'Failed to close sale.');
    },
  });

  const handleReviewChange = (field) => (e) => {
    const nextValue = e.target.value;
    setReview((prev) => {
      const next = { ...prev, [field]: nextValue };
      if (field === 'paymentOffered' || field === 'paymentReceived') {
        next.paymentPending = computePendingDisplay(
          field === 'paymentOffered' ? nextValue : next.paymentOffered,
          field === 'paymentReceived' ? nextValue : next.paymentReceived
        );
        if (field === 'paymentOffered' && prev.contractEnabled) {
          next.contractAmount = nextValue;
        }
      }
      return next;
    });
  };

  const resolvedContractMonths = () => {
    if (!review.contractEnabled) return null;
    if (
      review.contractMonths === 'custom' ||
      !CONTRACT_MONTH_PRESETS.includes(Number(review.contractMonths))
    ) {
      return parseContractMonths(review.contractMonthsCustom);
    }
    return parseContractMonths(review.contractMonths);
  };

  const contractPreview = review.contractEnabled
    ? formatContractServicesLabel(
        review.servicesOffered,
        resolvedContractMonths() ||
          review.contractMonthsCustom ||
          review.contractMonths
      )
    : '';

  const handleCardNumberChange = (raw) => {
    const brand = detectCardBrand(raw);
    setCardNumber(formatCardNumber(raw, brand));
  };

  const buildPayment = () => {
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
    const holder = cardHolderName.trim();
    const zip = billingZip.trim();

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
    if (!holder) {
      return { error: 'Name on Card is required.' };
    }
    if (!zip) {
      return { error: 'Billing Zip Code is required.' };
    }

    const cardLast4 = digits.slice(-4);
    const cardReferenceToken = `local_${brandId}_${cardLast4}_${Date.now()}`;

    return {
      payment: {
        method: 'via_card',
        cardLast4,
        cardBrand: brandId,
        cardReferenceToken,
        cardHolderName: holder,
        billingZip: zip,
        cardExpiry: cardExpiry.trim(),
      },
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const personalPhone = review.personalPhone.trim() || null;
    const businessPhone = review.businessPhone.trim() || null;
    if (!review.businessName.trim() || (!personalPhone && !businessPhone)) {
      setError('Business name and at least one phone are required.');
      return;
    }

    if (isAgent && !closerId) {
      setError('Select a closer to hand this sale to.');
      return;
    }

    const offeredRaw = review.paymentOffered.trim();
    if (offeredRaw === '') {
      setError('Payment Offered is required.');
      return;
    }
    const paymentOffered = Number(offeredRaw);
    if (Number.isNaN(paymentOffered) || paymentOffered < 0) {
      setError('Payment offered must be a valid non-negative number.');
      return;
    }
    const paymentReceived = Number(review.paymentReceived) || 0;
    if (Number.isNaN(paymentReceived) || paymentReceived < 0) {
      setError('Payment received must be a valid non-negative number.');
      return;
    }

    const built = buildPayment();
    if (built.error) {
      setError(built.error);
      return;
    }

    let followUpUpsert = null;
    const hasAnyCbField = Boolean(cbDate || cbHour || cbMinute || cbNotes.trim());
    if (hasAnyCbField) {
      const normalizedHour = clampOnBlur(cbHour, 1, 12, { padTo: 2 });
      const normalizedMinute = clampOnBlur(cbMinute, 0, 59, { padTo: 2 });
      setCbHour(normalizedHour);
      setCbMinute(normalizedMinute);
      const iso = toIsoTimestamp({
        date: cbDate,
        hour: normalizedHour,
        minute: normalizedMinute,
        period: cbPeriod,
      });
      if (!iso) {
        setError('Provide a valid scheduled callback date and time, or clear those fields.');
        return;
      }
      const changed =
        !originalCallbackAt ||
        new Date(iso).getTime() !== new Date(originalCallbackAt).getTime() ||
        String(cbNotes || '').trim() !==
          String(selectedLead.followUp?.notes || '').trim();
      if (changed && isCloser) {
        followUpUpsert = {
          leadId: selectedLead._id,
          callbackAt: iso,
          notes: cbNotes.trim() || null,
        };
      }
    }

    let contractEnabled = false;
    let contractMonths = null;
    let contractAmount = null;
    let finalServices = review.servicesOffered.trim() || null;
    let finalOffered = paymentOffered;

    if (review.contractEnabled) {
      contractEnabled = true;
      contractMonths = resolvedContractMonths();
      if (!contractMonths) {
        setError('Contract Timeframe (months) is required.');
        return;
      }
      const amountRaw = String(
        review.contractAmount || review.paymentOffered
      ).trim();
      contractAmount = Number(amountRaw);
      if (!Number.isFinite(contractAmount) || contractAmount < 0) {
        setError('Contract Amount must be a valid non-negative number.');
        return;
      }
      finalOffered = contractAmount;
      finalServices = formatContractServicesLabel(
        review.servicesOffered,
        contractMonths
      );
    }

    const payload = {
      payment: built.payment,
      clientName: review.clientName.trim() || null,
      businessName: review.businessName.trim(),
      personalPhone,
      businessPhone,
      businessEmail: review.businessEmail.trim() || null,
      personalEmail: review.personalEmail.trim() || null,
      websiteLink: normalizeUrl(review.websiteLink),
      gmbLink: normalizeUrl(review.gmbLink),
      serviceAreas: review.serviceAreas.trim() || null,
      servicesOffered: finalServices,
      paymentOffered: finalOffered,
      paymentReceived,
      contractEnabled,
      contractMonths,
      contractAmount,
      notes: review.notes.trim() || null,
    };

    if (isAgent) {
      payload.closerId = closerId;
    }

    mutation.mutate({ id: selectedLead._id, payload, followUpUpsert });
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
                {isCloser ? 'Confirm & Close' : 'Move to Closed Sale'}
              </h3>
              <p className="mt-1 text-sm text-zinc-400">
                {isCloser
                  ? 'Review intake · payment · optional follow-up schedule'
                  : 'Review full intake · assign closer · capture payment'}
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
                    <span>Personal Phone</span>
                    <input
                      value={review.personalPhone}
                      onChange={handleReviewChange('personalPhone')}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Business Phone *</span>
                    <input
                      value={review.businessPhone}
                      onChange={handleReviewChange('businessPhone')}
                      className={fieldClass}
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Business Email</span>
                    <input
                      type="email"
                      value={review.businessEmail}
                      onChange={handleReviewChange('businessEmail')}
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
                    <span>Service Areas</span>
                    <input
                      value={review.serviceAreas}
                      onChange={handleReviewChange('serviceAreas')}
                      className={fieldClass}
                      placeholder="City, State, or Region"
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Services Offered</span>
                    <input
                      value={review.servicesOffered}
                      onChange={handleReviewChange('servicesOffered')}
                      className={fieldClass}
                      placeholder="SEO, GMB, Web, Citation Pages…"
                    />
                  </label>
                  <ContractOptionFields
                    enabled={review.contractEnabled}
                    onEnabledChange={(yes) =>
                      setReview((prev) => ({
                        ...prev,
                        contractEnabled: yes,
                        contractAmount: yes
                          ? prev.contractAmount || prev.paymentOffered
                          : prev.contractAmount,
                        paymentOffered: yes
                          ? prev.contractAmount || prev.paymentOffered
                          : prev.paymentOffered,
                        paymentPending: computePendingDisplay(
                          yes
                            ? prev.contractAmount || prev.paymentOffered
                            : prev.paymentOffered,
                          prev.paymentReceived
                        ),
                      }))
                    }
                    months={review.contractMonths}
                    onMonthsChange={(m) =>
                      setReview((prev) => ({ ...prev, contractMonths: m }))
                    }
                    customMonths={review.contractMonthsCustom}
                    onCustomMonthsChange={(v) =>
                      setReview((prev) => ({
                        ...prev,
                        contractMonthsCustom: v,
                      }))
                    }
                    amount={review.contractAmount}
                    onAmountChange={(v) =>
                      setReview((prev) => ({
                        ...prev,
                        contractAmount: v,
                        paymentOffered: v,
                        paymentPending: computePendingDisplay(
                          v,
                          prev.paymentReceived
                        ),
                      }))
                    }
                    previewLabel={contractPreview}
                  />
                  <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
                    <label className="block space-y-1.5 text-sm text-zinc-300">
                      <span>
                        Payment Offered <span className="text-red-500">*</span>
                      </span>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                          $
                        </span>
                        <input
                          required
                          type="number"
                          min="0"
                          step="0.01"
                          value={review.paymentOffered}
                          onChange={handleReviewChange('paymentOffered')}
                          className={`${fieldClass} pl-7`}
                          placeholder="0.00"
                          aria-required="true"
                        />
                      </div>
                    </label>
                    <label className="block space-y-1.5 text-sm text-zinc-300">
                      <span>Payment Received</span>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={review.paymentReceived}
                          onChange={handleReviewChange('paymentReceived')}
                          className={`${fieldClass} pl-7`}
                          placeholder="0"
                        />
                      </div>
                    </label>
                    <label className="block space-y-1.5 text-sm text-zinc-300">
                      <span>Payment Pending</span>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                          $
                        </span>
                        <input
                          readOnly
                          type="number"
                          value={review.paymentPending}
                          className={`${fieldClass} pl-7`}
                          tabIndex={-1}
                          aria-readonly="true"
                        />
                      </div>
                    </label>
                  </div>
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
                  Scheduled callback
                </h4>
                <p className="text-xs text-zinc-500">
                  Prefills from the lead follow-up. Edit only if you need to
                  override before closing.
                </p>
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span>Date</span>
                  <input
                    type="date"
                    value={cbDate}
                    onChange={(e) => setCbDate(e.target.value)}
                    className={fieldClass}
                    min={todayDateValue()}
                  />
                </label>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-zinc-300">Time</p>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block space-y-1">
                      <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                        Hour
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={12}
                        placeholder="HH"
                        value={cbHour}
                        onChange={(e) =>
                          setCbHour(digitsOnly(e.target.value, 2))
                        }
                        onBlur={() =>
                          setCbHour(clampOnBlur(cbHour, 1, 12, { padTo: 2 }))
                        }
                        className={numInputClass}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                        Minute
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={59}
                        placeholder="MM"
                        value={cbMinute}
                        onChange={(e) =>
                          setCbMinute(digitsOnly(e.target.value, 2))
                        }
                        onBlur={() =>
                          setCbMinute(
                            clampOnBlur(cbMinute, 0, 59, { padTo: 2 })
                          )
                        }
                        className={numInputClass}
                      />
                    </label>
                    <div className="space-y-1">
                      <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                        Period
                      </span>
                      <div className="flex h-[42px] overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 p-0.5">
                        {['AM', 'PM'].map((p) => {
                          const active = cbPeriod === p;
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setCbPeriod(p)}
                              className={`flex-1 rounded-md text-xs font-semibold transition ${
                                active
                                  ? 'bg-orange-600 text-white shadow-sm'
                                  : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span>Notes</span>
                  <textarea
                    rows={2}
                    value={cbNotes}
                    onChange={(e) => setCbNotes(e.target.value)}
                    placeholder="Follow-up notes"
                    className={`${fieldClass} resize-y`}
                  />
                </label>
              </section>

              <section className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Payment method *
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
                            ? 'bg-flash-primary text-white shadow-lg shadow-orange-950/30'
                            : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {method === 'via_card' ? (
                  <div className="space-y-3">
                    <label className="block space-y-1.5 text-sm text-zinc-300">
                      <span>Card Number *</span>
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
                          {cardBrand
                            ? ` · ${formatCardBrandLabel(cardBrand) || cardBrand}`
                            : ''}
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-500">
                          Only last 4 + brand are stored — never the full card
                        </span>
                      )}
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block space-y-1.5 text-sm text-zinc-300">
                        <span>Expiry (MM/YY) *</span>
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
                        <span>CVC / CVV *</span>
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
                    <label className="block space-y-1.5 text-sm text-zinc-300">
                      <span>Name on Card *</span>
                      <input
                        required
                        value={cardHolderName}
                        onChange={(e) => setCardHolderName(e.target.value)}
                        placeholder="Name as printed on card"
                        className={fieldClass}
                        autoComplete="off"
                      />
                    </label>
                    <label className="block space-y-1.5 text-sm text-zinc-300">
                      <span>Billing Zip Code *</span>
                      <input
                        required
                        value={billingZip}
                        onChange={(e) => setBillingZip(e.target.value)}
                        placeholder="e.g. 90210"
                        className={fieldClass}
                        autoComplete="off"
                      />
                    </label>
                  </div>
                ) : null}

                {method === 'other' ? (
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>Payment details *</span>
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
                className="rounded-xl bg-flash-primary px-4 py-2 text-sm font-semibold text-white hover:bg-[#ff6a36] disabled:opacity-60"
              >
                {mutation.isPending
                  ? 'Closing…'
                  : isCloser
                    ? 'Confirm & Close'
                    : 'Confirm Close'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
