import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateLead } from '../../services/lead.service.js';
import { formatUserRef } from '../../utils/formatUserRef.util.js';
import {
  brandPayloadId,
  cardDigitsOnly,
  detectCardBrand,
  formatCardNumber,
  maxCardDigits,
} from '../../utils/cardBrand.util.js';
import {
  formatCstStatus,
  formatLeadPipeline,
  formatLeadStage,
  formatPaymentSummary,
} from '../../utils/formatPayment.util.js';

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatMoney = (value) => {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const Row = ({ label, children }) => (
  <div className="grid grid-cols-[7.5rem_1fr] gap-2 border-b border-zinc-800/80 py-2.5 last:border-0 sm:grid-cols-[9rem_1fr]">
    <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
      {label}
    </dt>
    <dd className="text-sm text-zinc-200">{children || '—'}</dd>
  </div>
);

const Section = ({ title, children }) => (
  <section className="space-y-1 pb-3">
    <h3 className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
      {title}
    </h3>
    <dl>{children}</dl>
  </section>
);

const fieldClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/20';

const labelClass = 'block space-y-1 text-sm';

const METHOD_OPTIONS = [
  { value: 'via_card', label: 'Card' },
  { value: 'via_link', label: 'Payment Link' },
  { value: 'other', label: 'Others' },
];

const formatExpiry = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const emptyFormFromLead = (lead) => ({
  clientName: lead?.clientName || '',
  businessName: lead?.businessName || '',
  phone: lead?.phone || '',
  workEmail: lead?.workEmail || '',
  personalEmail: lead?.personalEmail || '',
  websiteLink: lead?.websiteLink || '',
  gmbLink: lead?.gmbLink || '',
  servicesArea: lead?.servicesArea || '',
  serviceOffered: lead?.serviceOffered || '',
  salesAmount:
    lead?.salesAmount != null && lead?.salesAmount !== ''
      ? String(lead.salesAmount)
      : '',
  notes: lead?.notes || '',
  paymentMethod: lead?.payment?.method || 'via_link',
  otherDetails: lead?.payment?.otherDetails || '',
  cardNumber: '',
  cardExpiry: '',
  cardCvv: '',
});

const normalizeUrl = (raw) => {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
};

/**
 * Full lead / closed-sale details for Closers, Admin, Auditor, CST.
 * Never renders cardReferenceToken.
 *
 * @param {boolean} [canEdit] — closer may tweak details before Move to CST
 * @param {(lead: object) => void} [onLeadUpdated]
 */
export default function LeadDetailModal({
  open,
  lead,
  onClose,
  footer = null,
  headerActions = null,
  canEdit = false,
  onLeadUpdated = null,
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => emptyFormFromLead(null));
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!lead) return;
    setEditing(false);
    setEditError('');
    setForm(emptyFormFromLead(lead));
  }, [lead]);

  const detectedBrand = useMemo(
    () => detectCardBrand(form.cardNumber),
    [form.cardNumber]
  );
  const cvvMax = detectedBrand.cvvLength || 3;

  const saveMutation = useMutation({
    mutationFn: (payload) => updateLead(lead._id, payload),
    onSuccess: (updated) => {
      setEditError('');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['closerClosedSales'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
      queryClient.invalidateQueries({ queryKey: ['lead', lead._id] });
      onLeadUpdated?.(updated);
    },
    onError: (err) => {
      setEditError(
        err?.response?.data?.message || 'Failed to save lead details.'
      );
    },
  });

  if (!open || !lead) return null;

  const payment = lead.payment;
  const followAt = lead.followUp?.callbackAt;
  const isClosed = lead.stage === 'closed_sale';

  const setField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const buildPaymentPayload = () => {
    if (form.paymentMethod === 'via_link') {
      return { method: 'via_link' };
    }
    if (form.paymentMethod === 'other') {
      const details = form.otherDetails.trim();
      if (details.length < 2) {
        return {
          error: 'Enter payment notes / mode (e.g. Bank Transfer, Cash).',
        };
      }
      return { method: 'other', otherDetails: details };
    }

    // Card — if no new number entered, keep existing card payment as-is
    const digits = cardDigitsOnly(form.cardNumber);
    if (!digits) {
      if (payment?.method === 'via_card' && payment.cardLast4) {
        return {
          method: 'via_card',
          cardLast4: payment.cardLast4,
          cardBrand: payment.cardBrand || 'other',
          cardReferenceToken:
            payment.cardReferenceToken ||
            `local_${payment.cardBrand || 'other'}_${payment.cardLast4}_${Date.now()}`,
        };
      }
      return { error: 'Enter a card number, or choose another payment method.' };
    }

    const brand = detectCardBrand(digits);
    const brandId = brandPayloadId(brand);
    const maxLen = maxCardDigits(brand);
    const minLen = brand.id === 'amex' ? 15 : brand.id === 'diners' ? 14 : 13;

    if (digits.length < minLen || digits.length > maxLen) {
      return {
        error: `Enter a valid ${brand.label || 'card'} number (${minLen}–${maxLen} digits).`,
      };
    }
    if (!/^\d{2}\/\d{2}$/.test(form.cardExpiry.trim())) {
      return { error: 'Enter expiry as MM/YY.' };
    }
    const [mm] = form.cardExpiry.split('/').map(Number);
    if (mm < 1 || mm > 12) {
      return { error: 'Expiry month must be between 01 and 12.' };
    }
    const cvvRe = new RegExp(`^\\d{${brand.cvvLength}}$`);
    if (!cvvRe.test(form.cardCvv.trim())) {
      return {
        error: `Enter a valid ${brand.cvvLength}-digit CVC / CVV.`,
      };
    }

    const cardLast4 = digits.slice(-4);
    return {
      method: 'via_card',
      cardLast4,
      cardBrand: brandId,
      cardReferenceToken: `local_${brandId}_${cardLast4}_${Date.now()}`,
    };
  };

  const handleSave = (e) => {
    e.preventDefault();
    setEditError('');

    if (!form.businessName.trim() || !form.phone.trim()) {
      setEditError('Business name and phone are required.');
      return;
    }

    const salesRaw = form.salesAmount.trim();
    let salesAmount = null;
    if (isClosed) {
      if (salesRaw === '') {
        setEditError('Sales Amount is required.');
        return;
      }
      const n = Number(salesRaw);
      if (Number.isNaN(n) || n < 0) {
        setEditError('Sales amount must be a valid non-negative number.');
        return;
      }
      salesAmount = n;
    } else if (salesRaw !== '') {
      const n = Number(salesRaw);
      if (Number.isNaN(n) || n < 0) {
        setEditError('Sales amount must be a valid non-negative number.');
        return;
      }
      salesAmount = n;
    }

    const payload = {
      clientName: form.clientName.trim() || null,
      businessName: form.businessName.trim(),
      phone: form.phone.trim(),
      workEmail: form.workEmail.trim() || null,
      personalEmail: form.personalEmail.trim() || null,
      websiteLink: normalizeUrl(form.websiteLink),
      gmbLink: normalizeUrl(form.gmbLink),
      servicesArea: form.servicesArea.trim() || null,
      serviceOffered: form.serviceOffered.trim() || null,
      salesAmount,
      notes: form.notes.trim() || null,
    };

    if (isClosed) {
      const built = buildPaymentPayload();
      if (built.error) {
        setEditError(built.error);
        return;
      }
      payload.payment = built;
    }

    saveMutation.mutate(payload);
  };

  const LinkValue = ({ href }) =>
    href ? (
      <a
        href={/^https?:\/\//i.test(href) ? href : `https://${href}`}
        target="_blank"
        rel="noreferrer"
        className="break-all text-orange-400 hover:underline"
      >
        {href}
      </a>
    ) : (
      '—'
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-detail-title"
    >
      <button
        type="button"
        aria-label="Close backdrop"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="lead-detail-title"
              className="font-display text-lg font-semibold text-white"
            >
              {editing ? 'Edit closed sale' : lead.businessName || 'Lead details'}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              {editing
                ? 'Update intake, payment, and notes before CST handoff'
                : lead.phone || '—'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!editing ? headerActions : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {editing ? (
            <form
              id="lead-detail-edit"
              onSubmit={handleSave}
              className="space-y-4 pb-2"
              autoComplete="off"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  <span className="text-zinc-400">Client Name</span>
                  <input
                    value={form.clientName}
                    onChange={setField('clientName')}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  <span className="text-zinc-400">Business Name *</span>
                  <input
                    required
                    value={form.businessName}
                    onChange={setField('businessName')}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  <span className="text-zinc-400">Phone *</span>
                  <input
                    required
                    value={form.phone}
                    onChange={setField('phone')}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  <span className="text-zinc-400">Business Email</span>
                  <input
                    type="email"
                    value={form.workEmail}
                    onChange={setField('workEmail')}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  <span className="text-zinc-400">Personal Email</span>
                  <input
                    type="email"
                    value={form.personalEmail}
                    onChange={setField('personalEmail')}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  <span className="text-zinc-400">Service Area</span>
                  <input
                    value={form.servicesArea}
                    onChange={setField('servicesArea')}
                    className={fieldClass}
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  <span className="text-zinc-400">Services Offered</span>
                  <input
                    value={form.serviceOffered}
                    onChange={setField('serviceOffered')}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  <span className="text-zinc-400">Website URL</span>
                  <input
                    type="url"
                    value={form.websiteLink}
                    onChange={setField('websiteLink')}
                    className={fieldClass}
                    placeholder="https://"
                  />
                </label>
                <label className={labelClass}>
                  <span className="text-zinc-400">GMB URL</span>
                  <input
                    type="url"
                    value={form.gmbLink}
                    onChange={setField('gmbLink')}
                    className={fieldClass}
                    placeholder="https://"
                  />
                </label>
                <label className={labelClass}>
                  <span className="text-zinc-400">
                    Sales Amount {isClosed ? '*' : ''}
                  </span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required={isClosed}
                      value={form.salesAmount}
                      onChange={setField('salesAmount')}
                      className={`${fieldClass} pl-7`}
                    />
                  </div>
                </label>
              </div>

              {isClosed ? (
                <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Payment
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {METHOD_OPTIONS.map((opt) => {
                      const active = form.paymentMethod === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              paymentMethod: opt.value,
                            }))
                          }
                          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                            active
                              ? 'bg-orange-600 text-white'
                              : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {form.paymentMethod === 'via_card' ? (
                    <div className="space-y-3">
                      {payment?.method === 'via_card' && payment.cardLast4 ? (
                        <p className="text-xs text-zinc-500">
                          Current card: {payment.cardBrand || 'Card'} · ••••{' '}
                          {payment.cardLast4}. Leave blank to keep, or enter a
                          new card below.
                        </p>
                      ) : null}
                      <label className={labelClass}>
                        <span className="text-zinc-400">Card Number</span>
                        <input
                          inputMode="numeric"
                          value={form.cardNumber}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              cardNumber: formatCardNumber(
                                e.target.value,
                                detectCardBrand(e.target.value)
                              ),
                            }))
                          }
                          placeholder="#### #### #### ####"
                          className={fieldClass}
                          autoComplete="off"
                        />
                        {detectedBrand.id ? (
                          <span className="text-[11px] text-zinc-500">
                            Detected: {detectedBrand.label}
                          </span>
                        ) : null}
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className={labelClass}>
                          <span className="text-zinc-400">Expiry (MM/YY)</span>
                          <input
                            inputMode="numeric"
                            value={form.cardExpiry}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                cardExpiry: formatExpiry(e.target.value),
                              }))
                            }
                            placeholder="09/28"
                            className={fieldClass}
                            autoComplete="off"
                          />
                        </label>
                        <label className={labelClass}>
                          <span className="text-zinc-400">CVC / CVV</span>
                          <input
                            inputMode="numeric"
                            maxLength={cvvMax}
                            value={form.cardCvv}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                cardCvv: e.target.value
                                  .replace(/\D/g, '')
                                  .slice(0, cvvMax),
                              }))
                            }
                            placeholder={cvvMax === 4 ? '1234' : '123'}
                            className={fieldClass}
                            autoComplete="off"
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {form.paymentMethod === 'other' ? (
                    <label className={labelClass}>
                      <span className="text-zinc-400">Payment notes / mode</span>
                      <textarea
                        rows={2}
                        value={form.otherDetails}
                        onChange={setField('otherDetails')}
                        placeholder="Bank Transfer, Cash, PayPal…"
                        maxLength={200}
                        className={`${fieldClass} resize-y`}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              <label className={labelClass}>
                <span className="text-zinc-400">Notes / Call Summary</span>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={setField('notes')}
                  className={`${fieldClass} resize-y`}
                />
              </label>

              {editError ? (
                <p role="alert" className="text-sm text-red-400">
                  {editError}
                </p>
              ) : null}
            </form>
          ) : (
            <>
              <Section title="Pipeline">
                <Row label="Stage">{formatLeadStage(lead)}</Row>
                <Row label="Pipeline">{formatLeadPipeline(lead)}</Row>
                <Row label="Created By">
                  {formatUserRef(lead.agentId) || '—'}
                </Row>
                <Row label="Closer">
                  {formatUserRef(lead.closerId) || '—'}
                </Row>
              </Section>

              <Section title="Business & contact">
                <Row label="Client">{lead.clientName}</Row>
                <Row label="Business">{lead.businessName}</Row>
                <Row label="Phone">{lead.phone}</Row>
                <Row label="Business email">{lead.workEmail}</Row>
                <Row label="Personal email">{lead.personalEmail}</Row>
                <Row label="Service area">{lead.servicesArea}</Row>
                <Row label="Services">{lead.serviceOffered}</Row>
              </Section>

              <Section title="Web presence">
                <Row label="Website">
                  <LinkValue href={lead.websiteLink} />
                </Row>
                <Row label="GMB">
                  <LinkValue href={lead.gmbLink} />
                </Row>
                {lead.yelpLink ? (
                  <Row label="Yelp">
                    <LinkValue href={lead.yelpLink} />
                  </Row>
                ) : null}
              </Section>

              <Section title="Sales & payment">
                <Row label="Sales amount">{formatMoney(lead.salesAmount)}</Row>
                <Row label="Payment">{formatPaymentSummary(payment)}</Row>
                {payment?.method === 'via_link' ? (
                  <Row label="Method">Payment Link</Row>
                ) : null}
                {payment?.method === 'via_link' && payment.linkUrl ? (
                  <Row label="Payment link">
                    <LinkValue href={payment.linkUrl} />
                  </Row>
                ) : null}
                {payment?.method === 'via_card' ? (
                  <>
                    <Row label="Card brand">{payment.cardBrand || '—'}</Row>
                    <Row label="Card last 4">
                      {payment.cardLast4 ? `•••• ${payment.cardLast4}` : '—'}
                    </Row>
                  </>
                ) : null}
                {payment?.method === 'other' ? (
                  <Row label="Other details">
                    {payment.otherDetails || '—'}
                  </Row>
                ) : null}
                <Row label="Closed">{formatPkt(lead.closedAt)}</Row>
                <Row label="Closed by">
                  {formatUserRef(lead.closedBy) || '—'}
                </Row>
              </Section>

              <Section title="Notes & activity">
                <Row label="Notes">
                  <span className="whitespace-pre-wrap">
                    {lead.notes || '—'}
                  </span>
                </Row>
                {lead.handover?.onboardingNotes ? (
                  <Row label="Onboarding">
                    <span className="whitespace-pre-wrap">
                      {lead.handover.onboardingNotes}
                    </span>
                  </Row>
                ) : null}
                <Row label="Callback">{formatPkt(followAt)}</Row>
                {lead.followUp?.notes ? (
                  <Row label="Callback note">
                    <span className="whitespace-pre-wrap">
                      {lead.followUp.notes}
                    </span>
                  </Row>
                ) : null}
                <Row label="CST status">
                  {formatCstStatus(lead.handover?.cstStatus)}
                </Row>
                {lead.handover?.handedOverAt ? (
                  <Row label="Handed to CST">
                    {formatPkt(lead.handover.handedOverAt)}
                  </Row>
                ) : null}
                {lead.disqualifiedReason ? (
                  <Row label="DQ reason">{lead.disqualifiedReason}</Row>
                ) : null}
              </Section>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          {canEdit && !editing ? (
            <button
              type="button"
              onClick={() => {
                setEditError('');
                setForm(emptyFormFromLead(lead));
                setEditing(true);
              }}
              className="rounded-xl border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            >
              Edit
            </button>
          ) : null}
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditError('');
                  setForm(emptyFormFromLead(lead));
                }}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="lead-detail-edit"
                disabled={saveMutation.isPending}
                className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-60"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : (
            footer
          )}
          {!editing ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
