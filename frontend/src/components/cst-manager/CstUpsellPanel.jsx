import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { addClientUpsell } from '../../services/handover.service.js';
import {
  brandPayloadId,
  cardDigitsOnly,
  detectCardBrand,
  formatCardNumber,
} from '../../utils/cardBrand.util.js';
import {
  formatMoneyAmount,
  getClientRevenueTotals,
} from '../../utils/formatPayment.util.js';

const fieldClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-sm text-white outline-none transition focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20';

const SERVICE_OPTIONS = [
  { id: 'seo', label: 'SEO' },
  { id: 'web', label: 'Web' },
  { id: 'citation_pages', label: 'Citation Pages' },
  { id: 'other', label: 'Other' },
];

const PAY_OPTIONS = [
  { value: 'new_card', label: 'New Card' },
  { value: 'old_card', label: 'Old Card' },
  { value: 'link', label: 'Link' },
  { value: 'others', label: 'Others' },
];

const formatExpiry = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const maskCardNumber = (last4) =>
  last4 ? `•••• •••• •••• ${String(last4).slice(-4)}` : '—';

const emptyForm = (hasSavedCards) => ({
  service: 'seo',
  serviceOther: '',
  totalAmount: '',
  paidAmount: '',
  paymentOption: hasSavedCards ? 'old_card' : 'new_card',
  selectedCardId: '',
  paymentReference: '',
  notes: '',
  cardNumber: '',
  cardExpiry: '',
  cardCvc: '',
  nameOnCard: '',
  billingZipCode: '',
});

/**
 * Client Detail → Upsell tab (financial summary + Add Upsell form + ledger).
 */
export default function CstUpsellPanel({ lead, onLeadUpdated }) {
  const savedCards = useMemo(
    () => (Array.isArray(lead?.savedCards) ? lead.savedCards : []),
    [lead?.savedCards]
  );

  const [form, setForm] = useState(() => emptyForm(savedCards.length > 0));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setForm((prev) => ({
      ...emptyForm(savedCards.length > 0),
      // Keep draft quiet when lead refreshes mid-edit only if not dirty
      selectedCardId: savedCards[0]?.cardId || prev.selectedCardId || '',
      paymentOption: savedCards.length
        ? prev.paymentOption || 'old_card'
        : prev.paymentOption === 'old_card'
          ? 'new_card'
          : prev.paymentOption || 'new_card',
    }));
  }, [lead?._id]);

  useEffect(() => {
    if (!form.selectedCardId && savedCards[0]?.cardId) {
      setForm((prev) => ({ ...prev, selectedCardId: savedCards[0].cardId }));
    }
  }, [savedCards, form.selectedCardId]);

  const detectedBrand = useMemo(
    () => detectCardBrand(form.cardNumber),
    [form.cardNumber]
  );
  const cvvMax = detectedBrand.cvvLength || 3;

  const selectedSaved = useMemo(
    () =>
      savedCards.find((c) => String(c.cardId) === String(form.selectedCardId)),
    [savedCards, form.selectedCardId]
  );

  const revenue = getClientRevenueTotals(lead);
  const baseAmount = revenue.baseOffered;
  const upsellTotal = revenue.upsellTotal;
  const collected = revenue.totalCollected;
  const pending = Math.max(0, revenue.totalContractValue - collected);

  const ledger = Array.isArray(lead?.handover?.upsellLedger)
    ? lead.handover.upsellLedger
    : [];

  const setField = (key, value) => {
    setError('');
    setMessage('');
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const mutation = useMutation({
    mutationFn: (payload) => addClientUpsell(lead._id, payload),
    onSuccess: (updated) => {
      setMessage('Upsell added.');
      setForm(emptyForm((updated?.savedCards || []).length > 0));
      onLeadUpdated?.(updated);
    },
    onError: (err) => {
      setMessage('');
      setError(err?.response?.data?.message || 'Failed to add upsell.');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!form.service) {
      setError('Services / Product is required.');
      return;
    }
    if (form.service === 'other' && !form.serviceOther.trim()) {
      setError('Specify the Other service / product.');
      return;
    }
    if (form.totalAmount === '' || form.totalAmount == null) {
      setError('Total is required.');
      return;
    }
    if (form.paidAmount === '' || form.paidAmount == null) {
      setError('Paid is required.');
      return;
    }
    const total = Number(form.totalAmount);
    const paid = Number(form.paidAmount);
    if (!Number.isFinite(total) || total < 0) {
      setError('Total must be a valid number.');
      return;
    }
    if (!Number.isFinite(paid) || paid < 0) {
      setError('Paid must be a valid number.');
      return;
    }

    const payload = {
      service: form.service,
      serviceOther:
        form.service === 'other' ? form.serviceOther.trim() : undefined,
      totalAmount: total,
      paidAmount: paid,
      paymentOption: form.paymentOption,
      notes: form.notes.trim() || undefined,
    };

    if (form.paymentOption === 'old_card') {
      if (!form.selectedCardId || !selectedSaved) {
        setError('Select a saved card.');
        return;
      }
      payload.selectedCardId = form.selectedCardId;
    } else if (form.paymentOption === 'new_card') {
      const digits = cardDigitsOnly(form.cardNumber);
      if (digits.length < 13) {
        setError('Enter a valid Card Number.');
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(form.cardExpiry.trim())) {
        setError('Expiry must be MM/YY.');
        return;
      }
      if (form.cardCvc.trim().length < 3) {
        setError('CVC is required.');
        return;
      }
      if (!form.nameOnCard.trim() || !form.billingZipCode.trim()) {
        setError('Name on Card and Billing Zip Code are required.');
        return;
      }
      payload.newCard = {
        cardNumber: digits,
        expiry: form.cardExpiry.trim(),
        cvc: form.cardCvc.trim(),
        nameOnCard: form.nameOnCard.trim(),
        billingZipCode: form.billingZipCode.trim(),
        cardBrand: brandPayloadId(detectedBrand),
      };
    } else if (!form.paymentReference.trim()) {
      setError('Payment reference / details are required.');
      return;
    } else {
      payload.paymentReference = form.paymentReference.trim();
    }

    mutation.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="Base Amount" value={formatMoneyAmount(baseAmount)} />
        <SummaryStat
          label="Upsell Total"
          value={formatMoneyAmount(upsellTotal)}
        />
        <SummaryStat
          label="Collected Amount"
          value={formatMoneyAmount(collected)}
          accent="text-emerald-300"
        />
        <SummaryStat
          label="Pending Amount"
          value={formatMoneyAmount(pending)}
          accent={pending > 0 ? 'text-[#F25E26]' : 'text-zinc-200'}
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 sm:p-5"
        noValidate
      >
        <div>
          <h2 className="font-display text-lg font-semibold text-white">
            Add Upsell
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Required fields marked *. New cards are saved to this client.
          </p>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-white">
            Services / Product <span className="text-red-400">*</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {SERVICE_OPTIONS.map((opt) => {
              const active = form.service === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setField('service', opt.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'bg-[#F25E26] text-white shadow-lg shadow-orange-950/30'
                      : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {form.service === 'other' ? (
            <input
              type="text"
              required
              value={form.serviceOther}
              onChange={(e) => setField('serviceOther', e.target.value)}
              placeholder="Specify service / product *"
              className={`${fieldClass} mt-3`}
            />
          ) : null}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span>
              Total <span className="text-red-400">*</span>
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={form.totalAmount}
              onChange={(e) => setField('totalAmount', e.target.value)}
              className={fieldClass}
              placeholder="0.00"
            />
          </label>
          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span>
              Paid <span className="text-red-400">*</span>
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={form.paidAmount}
              onChange={(e) => setField('paidAmount', e.target.value)}
              className={fieldClass}
              placeholder="0.00"
            />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-white">
            Payment Option <span className="text-red-400">*</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {PAY_OPTIONS.map((opt) => {
              const disabled =
                opt.value === 'old_card' && savedCards.length === 0;
              const active = form.paymentOption === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setField('paymentOption', opt.value)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'bg-[#F25E26] text-white shadow-lg shadow-orange-950/30'
                      : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {form.paymentOption === 'old_card' ? (
          savedCards.length === 0 ? (
            <p className="text-sm text-amber-400">
              No saved cards yet — use New Card instead.
            </p>
          ) : (
            <div className="space-y-3">
              {savedCards.length > 1 ? (
                <label className="block space-y-1.5 text-sm text-zinc-300">
                  <span className="font-medium">Select saved card</span>
                  <select
                    value={form.selectedCardId}
                    onChange={(e) => setField('selectedCardId', e.target.value)}
                    className={fieldClass}
                  >
                    {savedCards.map((c) => (
                      <option key={c.cardId} value={c.cardId}>
                        {(c.cardBrand || 'Card').toUpperCase()} · ••••{' '}
                        {c.cardLast4}
                        {c.nameOnCard ? ` · ${c.nameOnCard}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {selectedSaved ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ReadonlyField
                    label="Card Number"
                    value={maskCardNumber(selectedSaved.cardLast4)}
                  />
                  <ReadonlyField
                    label="Expiry"
                    value={selectedSaved.expiry || '—'}
                  />
                  <ReadonlyField
                    label="CVC"
                    value={selectedSaved.cvcOnFile !== false ? '•••' : '—'}
                  />
                  <ReadonlyField
                    label="Name on Card"
                    value={selectedSaved.nameOnCard || '—'}
                  />
                  <ReadonlyField
                    label="Billing Zip Code"
                    value={selectedSaved.billingZipCode || '—'}
                    className="sm:col-span-2"
                  />
                </div>
              ) : null}
            </div>
          )
        ) : null}

        {form.paymentOption === 'new_card' ? (
          <div className="space-y-3">
            <label className="block space-y-1.5 text-sm text-zinc-300">
              <span>
                Card Number <span className="text-red-400">*</span>
              </span>
              <input
                required
                inputMode="numeric"
                value={form.cardNumber}
                onChange={(e) =>
                  setField(
                    'cardNumber',
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
                  value={form.cardExpiry}
                  onChange={(e) =>
                    setField('cardExpiry', formatExpiry(e.target.value))
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
                  value={form.cardCvc}
                  onChange={(e) =>
                    setField(
                      'cardCvc',
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
                value={form.nameOnCard}
                onChange={(e) => setField('nameOnCard', e.target.value)}
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
                value={form.billingZipCode}
                onChange={(e) => setField('billingZipCode', e.target.value)}
                className={fieldClass}
                autoComplete="off"
              />
            </label>
          </div>
        ) : null}

        {form.paymentOption === 'link' || form.paymentOption === 'others' ? (
          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span>
              Payment reference / details{' '}
              <span className="text-red-400">*</span>
            </span>
            <input
              required
              value={form.paymentReference}
              onChange={(e) => setField('paymentReference', e.target.value)}
              placeholder={
                form.paymentOption === 'link'
                  ? 'Payment link URL or reference'
                  : 'Cash / bank / other details'
              }
              className={fieldClass}
            />
          </label>
        ) : null}

        <label className="block space-y-1.5 text-sm text-zinc-300">
          <span>Upsell Notes</span>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="Optional notes…"
            className={`${fieldClass} resize-y`}
          />
        </label>

        {error ? (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-emerald-400" role="status">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-xl bg-[#F25E26] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#F25E26]/25 transition hover:bg-[#ff6a36] disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : '+ Add Upsell'}
        </button>
      </form>

      <div className="rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 sm:p-5">
        <h3 className="font-display text-base font-semibold text-white">
          Upsell Ledger
        </h3>
        {ledger.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No upsells yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {ledger.map((row) => {
              const rowPending = Math.max(
                0,
                (Number(row.totalAmount) || 0) - (Number(row.paidAmount) || 0)
              );
              return (
                <div
                  key={row.entryId}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {row.title ||
                          SERVICE_OPTIONS.find((s) => s.id === row.service)
                            ?.label ||
                          'Upsell'}
                      </p>
                      {row.notes ? (
                        <p className="mt-1 text-xs text-zinc-500 whitespace-pre-wrap">
                          {row.notes}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-xs text-zinc-400">
                      <p>
                        Total{' '}
                        <span className="font-semibold text-white">
                          {formatMoneyAmount(row.totalAmount)}
                        </span>
                      </p>
                      <p>
                        Paid{' '}
                        <span className="font-semibold text-emerald-300">
                          {formatMoneyAmount(row.paidAmount)}
                        </span>
                      </p>
                      <p>
                        Pending{' '}
                        <span
                          className={`font-semibold ${
                            rowPending > 0 ? 'text-[#F25E26]' : 'text-zinc-300'
                          }`}
                        >
                          {formatMoneyAmount(rowPending)}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, accent = 'text-white' }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 font-display text-lg font-semibold ${accent}`}>
        {value}
      </p>
    </div>
  );
}

function ReadonlyField({ label, value, className = '' }) {
  return (
    <label className={`block space-y-1 text-sm text-zinc-300 ${className}`}>
      <span className="text-zinc-500">{label}</span>
      <input
        readOnly
        value={value}
        className={`${fieldClass} opacity-90`}
        tabIndex={-1}
      />
    </label>
  );
}
