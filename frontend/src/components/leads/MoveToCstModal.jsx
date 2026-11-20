import { useEffect, useMemo, useState } from 'react';
import {
  brandPayloadId,
  cardDigitsOnly,
  detectCardBrand,
  formatCardBrandLabel,
  formatCardNumber,
  maxCardDigits,
  resolveCardBrandId,
} from '../../utils/cardBrand.util.js';

const pillActive =
  'bg-[#F25E26] text-white shadow-lg shadow-orange-950/30';
const pillIdle =
  'border border-zinc-700 text-zinc-300 hover:bg-zinc-800';

const fieldClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20';

const PAY_OPTIONS = [
  { value: 'old_card', label: 'Old Card' },
  { value: 'new_card', label: 'New Card' },
  { value: 'other', label: 'Others' },
];

const formatExpiry = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const YesNoToggle = ({ value, onChange, name }) => (
  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
    {[
      { v: true, label: 'Yes' },
      { v: false, label: 'No' },
    ].map((opt) => {
      const active = value === opt.v;
      return (
        <button
          key={String(opt.v)}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => onChange(opt.v)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            active ? pillActive : pillIdle
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

const maskCardNumber = (last4) =>
  last4 ? `•••• •••• •••• ${String(last4).slice(-4)}` : '•••• •••• •••• ••••';

/**
 * Handover CST modal: Document Sign + Upsell (+ payment) + handover note.
 */
export default function MoveToCstModal({
  open,
  lead,
  onClose,
  onSubmit,
  isSubmitting = false,
}) {
  const savedCards = useMemo(
    () => (Array.isArray(lead?.savedCards) ? lead.savedCards : []),
    [lead?.savedCards]
  );

  const [documentSigned, setDocumentSigned] = useState(null);
  const [signedFile, setSignedFile] = useState(null);
  const [upsell, setUpsell] = useState(null);
  const [serviceName, setServiceName] = useState('');
  const [priceOffered, setPriceOffered] = useState('');
  const [priceReceived, setPriceReceived] = useState('');
  const [payMethod, setPayMethod] = useState('old_card');
  const [selectedCardId, setSelectedCardId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardHolderName, setCardHolderName] = useState('');
  const [billingZip, setBillingZip] = useState('');
  const [payReference, setPayReference] = useState('');
  const [upsellNotes, setUpsellNotes] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [error, setError] = useState('');

  const detectedBrand = useMemo(
    () => detectCardBrand(cardNumber),
    [cardNumber]
  );
  const cvvMax = detectedBrand.cvvLength || 3;

  const pendingLeft = useMemo(() => {
    const offered = Number(priceOffered);
    const received = Number(priceReceived) || 0;
    if (Number.isNaN(offered) || Number.isNaN(received)) return 0;
    return Math.max(0, offered - received);
  }, [priceOffered, priceReceived]);

  useEffect(() => {
    if (!open) return;
    setDocumentSigned(null);
    setSignedFile(null);
    setUpsell(null);
    setServiceName('');
    setPriceOffered('');
    setPriceReceived('');
    setPayMethod(savedCards.length ? 'old_card' : 'new_card');
    setSelectedCardId(savedCards[0]?.cardId || '');
    setCardNumber('');
    setCardExpiry('');
    setCardCvv('');
    setCardHolderName('');
    setBillingZip('');
    setPayReference('');
    setUpsellNotes('');
    setHandoverNotes('');
    setError('');
  }, [open, lead?._id, savedCards]);

  const selectedSaved = useMemo(
    () => savedCards.find((c) => String(c.cardId) === String(selectedCardId)),
    [savedCards, selectedCardId]
  );

  const canSubmit = useMemo(() => {
    if (documentSigned === null || upsell === null) return false;
    if (documentSigned === true && !signedFile) return false;
    if (upsell !== true) return true;
    if (!serviceName.trim()) return false;
    if (priceOffered === '' || priceOffered == null) return false;
    const offered = Number(priceOffered);
    const received = Number(priceReceived) || 0;
    if (Number.isNaN(offered) || offered < 0) return false;
    if (Number.isNaN(received) || received < 0) return false;
    if (received > offered) return false;
    if (payMethod === 'old_card') {
      return Boolean(selectedCardId && selectedSaved);
    }
    if (payMethod === 'new_card') {
      return Boolean(
        cardDigitsOnly(cardNumber).length >= 13 &&
          /^\d{2}\/\d{2}$/.test(cardExpiry.trim()) &&
          cardCvv.trim().length >= 3 &&
          cardHolderName.trim() &&
          billingZip.trim()
      );
    }
    return Boolean(payReference.trim());
  }, [
    documentSigned,
    signedFile,
    upsell,
    serviceName,
    priceOffered,
    priceReceived,
    payMethod,
    selectedCardId,
    selectedSaved,
    cardNumber,
    cardExpiry,
    cardCvv,
    cardHolderName,
    billingZip,
    payReference,
  ]);

  if (!open || !lead) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setSignedFile(null);
      return;
    }
    const okType =
      file.type === 'application/pdf' ||
      file.type === 'image/png' ||
      file.type === 'image/jpeg' ||
      file.type === 'image/jpg' ||
      file.type === 'application/msword' ||
      file.type ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      /\.(pdf|png|jpe?g|docx?)$/i.test(file.name);
    if (!okType) {
      setError('Signed document must be PDF, DOC, DOCX, PNG, or JPG.');
      setSignedFile(null);
      e.target.value = '';
      return;
    }
    setError('');
    setSignedFile(file);
  };

  const buildNewCardFields = () => {
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
    if (!cardHolderName.trim()) {
      return { error: 'Name on Card is required.' };
    }
    if (!billingZip.trim()) {
      return { error: 'Billing Zip Code is required.' };
    }
    const cardLast4 = digits.slice(-4);
    return {
      last4: cardLast4,
      brand: brandId,
      token: `local_${brandId}_${cardLast4}_${Date.now()}`,
      expiry: cardExpiry.trim(),
      holder: cardHolderName.trim(),
      zip: billingZip.trim(),
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) {
      setError('Complete Document Sign and Upsell requirements before submitting.');
      return;
    }

    const formData = new FormData();
    formData.append('documentSigned', documentSigned ? 'true' : 'false');
    formData.append('upscale', upsell ? 'true' : 'false');
    formData.append('upsell', upsell ? 'true' : 'false');
    formData.append('upscaleNotes', upsellNotes.trim());
    formData.append('upsellNotes', upsellNotes.trim());
    formData.append('handoverNotes', handoverNotes.trim());
    if (documentSigned && signedFile) {
      formData.append('signedDocument', signedFile);
    }
    if (upsell) {
      const offered = Number(priceOffered);
      const received = Number(priceReceived) || 0;
      if (Number.isNaN(offered) || offered < 0) {
        setError('Price Offered must be a valid non-negative number.');
        return;
      }
      if (Number.isNaN(received) || received < 0) {
        setError('Price Received must be a valid non-negative number.');
        return;
      }
      if (received > offered) {
        setError('Price Received cannot exceed Price Offered.');
        return;
      }
      const pending = Math.max(0, offered - received);

      formData.append('upscaleItemName', serviceName.trim());
      formData.append('upsellServiceName', serviceName.trim());
      formData.append('upsellOffered', String(offered));
      formData.append('upscaleOffered', String(offered));
      formData.append('upsellReceived', String(received));
      formData.append('upscaleReceived', String(received));
      formData.append('upsellPending', String(pending));
      formData.append('upscalePending', String(pending));
      // Legacy single-price aliases (offered)
      formData.append('upscalePrice', String(offered));
      formData.append('upsellPrice', String(offered));
      formData.append('upsellPaymentMethod', payMethod);

      if (payMethod === 'old_card') {
        formData.append('selectedCardId', selectedCardId);
      } else if (payMethod === 'new_card') {
        const built = buildNewCardFields();
        if (built.error) {
          setError(built.error);
          return;
        }
        formData.append('newCardLast4', built.last4);
        formData.append('newCardBrand', built.brand);
        formData.append('newCardReferenceToken', built.token);
        formData.append('newCardExpiry', built.expiry);
        formData.append('newCardHolderName', built.holder);
        formData.append('newCardBillingZip', built.zip);
      } else {
        formData.append('upsellPaymentReference', payReference.trim());
      }
    }

    try {
      await onSubmit(formData);
      onClose?.();
    } catch (err) {
      setError(
        err?.response?.data?.message || 'Failed to hand over to CST.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-4 backdrop-blur-sm sm:items-center">
      <button
        type="button"
        aria-label="Close backdrop"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        disabled={isSubmitting}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-to-cst-title"
        className="relative z-10 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2
              id="move-to-cst-title"
              className="font-display text-lg font-semibold text-white"
            >
              Handover CST
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {lead.businessName}
              {lead.businessPhone || lead.personalPhone
                ? ` · ${lead.businessPhone || lead.personalPhone}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-60"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <h3 className="text-sm font-semibold text-white">
                Document Sign <span className="text-red-400">*</span>
              </h3>
              <YesNoToggle
                name="Document Sign"
                value={documentSigned}
                onChange={(v) => {
                  setDocumentSigned(v);
                  if (!v) setSignedFile(null);
                }}
              />
              {documentSigned === true ? (
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span className="font-medium">
                    Upload Signed Document{' '}
                    <span className="text-red-400">*</span>
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-200 hover:file:bg-zinc-700"
                  />
                  {signedFile ? (
                    <span className="block text-xs text-emerald-400">
                      Selected: {signedFile.name}
                    </span>
                  ) : (
                    <span className="block text-xs text-zinc-500">
                      PDF, DOC, DOCX, PNG, or JPG
                    </span>
                  )}
                </label>
              ) : null}
              {documentSigned === false ? (
                <p className="text-xs text-amber-400/90">
                  CST will see: Document not signed by closer
                </p>
              ) : null}
            </section>

            <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <h3 className="text-sm font-semibold text-white">
                Upsell <span className="text-red-400">*</span>
              </h3>
              <YesNoToggle
                name="Upsell"
                value={upsell}
                onChange={setUpsell}
              />
              {upsell === true ? (
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span className="font-medium">
                    Service Name <span className="text-red-400">*</span>
                  </span>
                  <input
                    value={serviceName}
                    onChange={(e) => setServiceName(e.target.value)}
                    className={fieldClass}
                    placeholder="e.g. SEO package"
                  />
                </label>
              ) : null}
            </section>
          </div>

          {upsell === true ? (
            <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Upsell Pricing
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Offered, Received, and Pending (auto-calculated).
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span className="font-medium">
                    Price Offered <span className="text-red-400">*</span>
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceOffered}
                      onChange={(e) => setPriceOffered(e.target.value)}
                      className={`${fieldClass} pl-7`}
                      placeholder="0.00"
                    />
                  </div>
                </label>
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span className="font-medium">Price Received</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceReceived}
                      onChange={(e) => setPriceReceived(e.target.value)}
                      className={`${fieldClass} pl-7`}
                      placeholder="0"
                    />
                  </div>
                </label>
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span className="font-medium">Pending Amount (Left)</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                      $
                    </span>
                    <input
                      type="text"
                      readOnly
                      tabIndex={-1}
                      value={pendingLeft.toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                      className={`${fieldClass} cursor-default pl-7 opacity-90`}
                      aria-readonly="true"
                    />
                  </div>
                </label>
              </div>

              <h3 className="border-t border-zinc-800 pt-4 text-sm font-semibold text-white">
                Payment Method <span className="text-red-400">*</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {PAY_OPTIONS.map((opt) => {
                  const disabled =
                    opt.value === 'old_card' && savedCards.length === 0;
                  const active = payMethod === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setPayMethod(opt.value)}
                      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        active ? pillActive : pillIdle
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {payMethod === 'old_card' ? (
                savedCards.length === 0 ? (
                  <p className="text-sm text-amber-400">
                    No saved cards on this lead yet — use New Card instead.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {savedCards.length > 1 ? (
                      <label className="block space-y-1.5 text-sm text-zinc-300">
                        <span className="font-medium">Select saved card</span>
                        <select
                          value={selectedCardId}
                          onChange={(e) => setSelectedCardId(e.target.value)}
                          className={`${fieldClass} appearance-none`}
                        >
                          {savedCards.map((c) => {
                            const brand =
                              formatCardBrandLabel(
                                resolveCardBrandId(c) || c.cardBrand
                              ) || 'Card';
                            return (
                              <option key={c.cardId} value={c.cardId}>
                                {brand} · •••• {c.cardLast4}
                                {c.nameOnCard ? ` · ${c.nameOnCard}` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    ) : null}
                    {selectedSaved ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block space-y-1 text-sm text-zinc-300">
                          <span className="text-zinc-500">Card Number</span>
                          <input
                            readOnly
                            value={(() => {
                              const brand =
                                formatCardBrandLabel(
                                  resolveCardBrandId(selectedSaved) ||
                                    selectedSaved.cardBrand
                                ) || '';
                              const masked = maskCardNumber(
                                selectedSaved.cardLast4
                              );
                              return brand ? `${brand} — ${masked}` : masked;
                            })()}
                            className={`${fieldClass} opacity-90`}
                            tabIndex={-1}
                          />
                        </label>
                        <label className="block space-y-1 text-sm text-zinc-300">
                          <span className="text-zinc-500">Expiry</span>
                          <input
                            readOnly
                            value={selectedSaved.expiry || '—'}
                            className={`${fieldClass} opacity-90`}
                            tabIndex={-1}
                          />
                        </label>
                        <label className="block space-y-1 text-sm text-zinc-300">
                          <span className="text-zinc-500">CVC</span>
                          <input
                            readOnly
                            value={
                              selectedSaved.cvcOnFile !== false ? '•••' : '—'
                            }
                            className={`${fieldClass} opacity-90`}
                            tabIndex={-1}
                            title="CVC was collected at save time and is not re-displayed"
                          />
                        </label>
                        <label className="block space-y-1 text-sm text-zinc-300">
                          <span className="text-zinc-500">Name on Card</span>
                          <input
                            readOnly
                            value={selectedSaved.nameOnCard || '—'}
                            className={`${fieldClass} opacity-90`}
                            tabIndex={-1}
                          />
                        </label>
                        <label className="block space-y-1 text-sm text-zinc-300 sm:col-span-2">
                          <span className="text-zinc-500">
                            Billing Zip Code
                          </span>
                          <input
                            readOnly
                            value={selectedSaved.billingZipCode || '—'}
                            className={`${fieldClass} opacity-90`}
                            tabIndex={-1}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                )
              ) : null}

              {payMethod === 'new_card' ? (
                <div className="space-y-3">
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>
                      Card Number <span className="text-red-400">*</span>
                    </span>
                    <input
                      required
                      inputMode="numeric"
                      value={cardNumber}
                      onChange={(e) =>
                        setCardNumber(
                          formatCardNumber(
                            e.target.value,
                            detectCardBrand(e.target.value)
                          )
                        )
                      }
                      placeholder="#### #### #### ####"
                      className={fieldClass}
                      autoComplete="off"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1.5 text-sm text-zinc-300">
                      <span>
                        Expiry <span className="text-red-400">*</span>
                      </span>
                      <input
                        required
                        inputMode="numeric"
                        value={cardExpiry}
                        onChange={(e) =>
                          setCardExpiry(formatExpiry(e.target.value))
                        }
                        placeholder="MM/YY"
                        className={fieldClass}
                        autoComplete="off"
                      />
                    </label>
                    <label className="block space-y-1.5 text-sm text-zinc-300">
                      <span>
                        CVC <span className="text-red-400">*</span>
                      </span>
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
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>
                      Name on Card <span className="text-red-400">*</span>
                    </span>
                    <input
                      required
                      value={cardHolderName}
                      onChange={(e) => setCardHolderName(e.target.value)}
                      className={fieldClass}
                      autoComplete="off"
                    />
                  </label>
                  <label className="block space-y-1.5 text-sm text-zinc-300">
                    <span>
                      Billing Zip Code <span className="text-red-400">*</span>
                    </span>
                    <input
                      required
                      value={billingZip}
                      onChange={(e) => setBillingZip(e.target.value)}
                      className={fieldClass}
                      autoComplete="off"
                    />
                  </label>
                </div>
              ) : null}

              {payMethod === 'other' ? (
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span>
                    Payment Notes / Details{' '}
                    <span className="text-red-400">*</span>
                  </span>
                  <textarea
                    required
                    rows={2}
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    className={`${fieldClass} resize-y`}
                    placeholder="Bank transfer, cash, etc."
                  />
                </label>
              ) : null}

              <label className="block space-y-1.5 text-sm text-zinc-300">
                <span className="font-medium">Upsell Notes</span>
                <textarea
                  rows={2}
                  value={upsellNotes}
                  onChange={(e) => setUpsellNotes(e.target.value)}
                  placeholder="Optional context for this upsell…"
                  className={`${fieldClass} resize-y`}
                />
              </label>
            </section>
          ) : null}

          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span className="font-medium">Handover CST Note</span>
            <textarea
              rows={3}
              value={handoverNotes}
              onChange={(e) => setHandoverNotes(e.target.value)}
              placeholder="Optional handover instructions for the CST Manager…"
              className={`${fieldClass} resize-y`}
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="rounded-xl bg-[#F25E26] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting…' : 'Confirm & Handover to CST'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
