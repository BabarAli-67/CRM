import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  addClientUpsell,
  updateClientBalances,
} from '../../services/handover.service.js';
import {
  brandPayloadId,
  cardDigitsOnly,
  detectCardBrand,
  formatCardBrandLabel,
  formatCardNumber,
  resolveCardBrandId,
} from '../../utils/cardBrand.util.js';
import {
  formatMoneyAmount,
  getUnifiedUpsellLedger,
} from '../../utils/formatPayment.util.js';
import { getAggregatedSavedCards } from '../../utils/savedCards.util.js';

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
  { value: 'others', label: 'Others' },
];

const formatExpiry = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const maskCardNumber = (last4) =>
  last4 ? `•••• •••• •••• ${String(last4).slice(-4)}` : '—';

const cardBrandLabel = (card) =>
  formatCardBrandLabel(resolveCardBrandId(card) || card?.cardBrand);

const formatMaskedCardWithBrand = (card) => {
  const brand = cardBrandLabel(card);
  const masked = maskCardNumber(card?.cardLast4);
  if (brand && masked !== '—') return `${brand} — ${masked}`;
  if (brand) return brand;
  return masked;
};

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
    () => getAggregatedSavedCards(lead),
    [lead]
  );

  const [form, setForm] = useState(() => emptyForm(savedCards.length > 0));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setForm((prev) => {
      const stillValid = savedCards.some(
        (c) => String(c.cardId) === String(prev.selectedCardId)
      );
      return {
        ...prev,
        selectedCardId: stillValid
          ? prev.selectedCardId
          : savedCards[0]?.cardId || '',
        paymentOption:
          prev.paymentOption === 'old_card' && savedCards.length === 0
            ? 'new_card'
            : prev.paymentOption ||
              (savedCards.length ? 'old_card' : 'new_card'),
      };
    });
  }, [lead?._id, savedCards]);

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

  const ledger = getUnifiedUpsellLedger(lead);

  const [rowPendingDrafts, setRowPendingDrafts] = useState({});
  const [balanceError, setBalanceError] = useState('');
  const [balanceMessage, setBalanceMessage] = useState('');

  useEffect(() => {
    const next = {};
    for (const row of ledger) {
      const rowPending = Math.max(
        0,
        (Number(row.totalAmount) || 0) - (Number(row.paidAmount) || 0)
      );
      next[row.entryId] =
        rowPending === 0 ? '' : String(Number(rowPending.toFixed(2)));
    }
    setRowPendingDrafts(next);
    setBalanceError('');
    setBalanceMessage('');
    // Sync drafts when lead balances change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lead?._id,
    lead?.handover?.upsellLedger,
    lead?.handover?.upscale,
    lead?.paymentReceived,
  ]);

  const setField = (key, value) => {
    setError('');
    setMessage('');
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const mutation = useMutation({
    mutationFn: (payload) => addClientUpsell(lead._id, payload),
    onSuccess: (updated) => {
      const cards = getAggregatedSavedCards(updated);
      setMessage('Upsell added.');
      setForm({
        ...emptyForm(cards.length > 0),
        selectedCardId: cards[cards.length - 1]?.cardId || cards[0]?.cardId || '',
      });
      onLeadUpdated?.(updated);
    },
    onError: (err) => {
      setMessage('');
      setError(err?.response?.data?.message || 'Failed to add upsell.');
    },
  });

  const balanceMutation = useMutation({
    mutationFn: (payload) => updateClientBalances(lead._id, payload),
    onSuccess: (updated) => {
      setBalanceError('');
      setBalanceMessage('Balances updated.');
      onLeadUpdated?.(updated);
    },
    onError: (err) => {
      setBalanceMessage('');
      setBalanceError(
        err?.response?.data?.message || 'Failed to update balances.'
      );
    },
  });

  const saveRowPending = (entryId, raw) => {
    const value = raw === '' || raw == null ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      setBalanceError('Upsell Pending must be a valid non-negative number.');
      return;
    }
    balanceMutation.mutate({
      upsells: [{ entryId, pending: value }],
    });
  };

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
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Select saved card
                </p>
                <div
                  className="flex flex-wrap gap-2"
                  role="tablist"
                  aria-label="Saved cards"
                >
                  {savedCards.map((card, index) => {
                    const active =
                      String(form.selectedCardId) === String(card.cardId);
                    const brand = cardBrandLabel(card);
                    return (
                      <button
                        key={card.cardId || `card-${index}`}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setField('selectedCardId', card.cardId)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                          active
                            ? 'bg-[#F25E26] text-white shadow-lg shadow-[#F25E26]/25'
                            : 'border border-white/15 bg-[#0A0A0A] text-white hover:border-[#F25E26]/50 hover:text-[#F25E26]'
                        }`}
                      >
                        Old Card {index + 1}
                        {brand ? ` · ${brand}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
              {selectedSaved ? (
                <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-black/30 p-3 sm:grid-cols-2">
                  <ReadonlyField
                    label="Card Number"
                    value={formatMaskedCardWithBrand(selectedSaved)}
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

        {form.paymentOption === 'others' ? (
          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span>
              Payment reference / details{' '}
              <span className="text-red-400">*</span>
            </span>
            <input
              required
              value={form.paymentReference}
              onChange={(e) => setField('paymentReference', e.target.value)}
              placeholder="Cash / bank / other details"
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
        {balanceError ? (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {balanceError}
          </p>
        ) : null}
        {balanceMessage ? (
          <p className="mt-2 text-sm text-emerald-400" role="status">
            {balanceMessage}
          </p>
        ) : null}
        {ledger.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No upsells yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {ledger.map((row) => {
              const rowPending = Math.max(
                0,
                (Number(row.totalAmount) || 0) - (Number(row.paidAmount) || 0)
              );
              const draft =
                rowPendingDrafts[row.entryId] ??
                (rowPending === 0
                  ? ''
                  : String(Number(rowPending.toFixed(2))));
              return (
                <div
                  key={row.entryId}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white">
                          {row.title ||
                            SERVICE_OPTIONS.find((s) => s.id === row.service)
                              ?.label ||
                            'Upsell'}
                        </p>
                        {row.source === 'handover' ? (
                          <span className="rounded-full bg-[#F25E26]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F25E26] ring-1 ring-[#F25E26]/35">
                            Closer handover
                          </span>
                        ) : null}
                      </div>
                      {row.notes ? (
                        <p className="mt-1 text-xs text-zinc-500 whitespace-pre-wrap">
                          {row.notes}
                        </p>
                      ) : null}
                      <div className="mt-2 text-xs text-zinc-400">
                        Total{' '}
                        <span className="font-semibold text-white">
                          {formatMoneyAmount(row.totalAmount)}
                        </span>
                        {' · '}
                        Paid{' '}
                        <span className="font-semibold text-emerald-300">
                          {formatMoneyAmount(row.paidAmount)}
                        </span>
                      </div>
                    </div>
                    {rowPending > 0 ? (
                      <PendingEditor
                        label="Upsell Pending"
                        compact
                        value={draft}
                        placeholder="0"
                        disabled={balanceMutation.isPending}
                        onChange={(next) =>
                          setRowPendingDrafts((prev) => ({
                            ...prev,
                            [row.entryId]: next,
                          }))
                        }
                        onSave={() => saveRowPending(row.entryId, draft)}
                        onMarkPaid={() => {
                          setRowPendingDrafts((prev) => ({
                            ...prev,
                            [row.entryId]: '',
                          }));
                          saveRowPending(row.entryId, 0);
                        }}
                      />
                    ) : (
                      <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                        Paid ✓
                      </span>
                    )}
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

function PendingEditor({
  label,
  hint,
  value,
  placeholder = '0',
  disabled,
  onChange,
  onSave,
  onMarkPaid,
  compact = false,
}) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-black/20 ${
        compact ? 'p-2.5' : 'p-3'
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[7rem] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
            $
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            className={`${fieldClass} pl-7`}
          />
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onSave}
          className="rounded-lg bg-[#F25E26] px-3 py-2 text-xs font-semibold text-white hover:bg-[#ff6a36] disabled:opacity-60"
        >
          Update
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onMarkPaid}
          className="rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60"
        >
          Mark Paid
        </button>
      </div>
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
