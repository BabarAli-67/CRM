import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../../config/api.config.js';
import {
  clientSignedDocumentUrl,
  updateClientSignedDocument,
} from '../../services/handover.service.js';
import {
  formatCardBrandLabel,
  resolveCardBrandId,
} from '../../utils/cardBrand.util.js';
import {
  formatMoneyAmount,
  formatPaymentSummary,
} from '../../utils/formatPayment.util.js';

const UPSELL_PAY_LABEL = {
  old_card: 'Old Card',
  new_card: 'New Card',
  other: 'Others',
  others: 'Others',
};

const formatUpsellCardPayment = (lead, upscale) => {
  const method = upscale?.paymentMethod;
  const base =
    UPSELL_PAY_LABEL[method] ||
    (method === 'via_link' || method === 'link' ? 'Others' : method) ||
    '';
  if (method !== 'old_card' && method !== 'new_card') {
    return base || '—';
  }

  const cards = Array.isArray(lead?.savedCards) ? lead.savedCards : [];
  const selected =
    cards.find((c) => String(c.cardId) === String(upscale?.selectedCardId)) ||
    null;
  const payment = lead?.payment;
  const brandId =
    resolveCardBrandId(selected) ||
    resolveCardBrandId(payment) ||
    selected?.cardBrand ||
    payment?.cardBrand ||
    '';
  const brand = formatCardBrandLabel(brandId);
  const last4 = String(
    selected?.cardLast4 || payment?.cardLast4 || ''
  )
    .replace(/\D/g, '')
    .slice(-4);

  if (brand && last4) return `${base} (${brand} •••• ${last4})`;
  if (brand) return `${base} (${brand})`;
  if (last4) return `${base} (•••• ${last4})`;
  return base || '—';
};

/**
 * Client Context — locked Sales Agent + Closer fields (read-only, deduplicated).
 * No CST-tier editable fields.
 */

const labelClass =
  'mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500';

const valueClass =
  'rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200 break-words';

const sectionTitleClass =
  'text-[11px] font-semibold uppercase tracking-wider text-[#F25E26]/90';

const gridClass = 'grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

const personLabel = (ref) => {
  if (!ref || typeof ref !== 'object') return '';
  return ref.fullName || ref.username || '';
};

const displayOrDash = (value) => {
  const s = String(value ?? '').trim();
  return s || '—';
};

/** Kept for callers that still map profile state — returns a flat view object. */
export function mapProfileFromLead(lead) {
  const payment = lead?.payment || {};
  return {
    businessName: lead?.businessName || '',
    clientName: lead?.clientName || '',
    personalPhone: lead?.personalPhone || '',
    businessPhone: lead?.businessPhone || '',
    businessEmail: lead?.businessEmail || '',
    personalEmail: lead?.personalEmail || '',
    websiteLink: lead?.websiteLink || '',
    gmbLink: lead?.gmbLink || '',
    serviceAreas: lead?.serviceAreas || '',
    servicesOffered: lead?.servicesOffered || '',
    notes: lead?.notes || '',
    paymentOffered:
      lead?.paymentOffered === 0 || lead?.paymentOffered
        ? String(lead.paymentOffered)
        : lead?.salesAmount === 0 || lead?.salesAmount
          ? String(lead.salesAmount)
          : '',
    paymentReceived:
      lead?.paymentReceived === 0 || lead?.paymentReceived
        ? String(lead.paymentReceived)
        : '0',
    paymentPending:
      lead?.paymentPending === 0 || lead?.paymentPending
        ? String(lead.paymentPending)
        : '',
    paymentMethod: payment.method || '',
    cardLast4: payment.cardLast4 || '',
    cardBrand: payment.cardBrand || '',
    otherDetails: payment.otherDetails || '',
    documentSigned:
      lead?.handover?.documentSigned === true
        ? 'yes'
        : lead?.handover?.documentSigned === false
          ? 'no'
          : '',
    upscaleNotes: lead?.handover?.upscaleNotes || '',
    handoverNotes: lead?.handover?.handoverNotes || '',
  };
}

function Field({ label, children }) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <div className={valueClass}>{children}</div>
    </div>
  );
}

/**
 * @param {{ lead: object, formatPktFull?: (iso: string) => string, onLeadUpdated?: (lead: object) => void }} props
 */
export default function ClientContextRecord({
  lead,
  formatPktFull,
  onLeadUpdated,
}) {
  const payment = lead?.payment || {};
  const offered = Number(lead?.paymentOffered ?? lead?.salesAmount) || 0;
  const received = Number(lead?.paymentReceived) || 0;
  const pending =
    lead?.paymentPending != null && lead?.paymentPending !== ''
      ? Number(lead.paymentPending) || 0
      : Math.max(0, offered - received);

  const docSigned = lead?.handover?.documentSigned;
  const signedDoc = lead?.handover?.signedDocument;

  const [signYes, setSignYes] = useState(docSigned === true);
  const [file, setFile] = useState(null);
  const [docError, setDocError] = useState('');
  const [docMessage, setDocMessage] = useState('');

  useEffect(() => {
    setSignYes(docSigned === true);
    setFile(null);
    setDocError('');
    setDocMessage('');
  }, [lead?._id, docSigned, signedDoc?.storedFilename]);

  const docMutation = useMutation({
    mutationFn: () =>
      updateClientSignedDocument(lead._id, {
        documentSigned: signYes,
        file: signYes ? file : null,
      }),
    onSuccess: (updated) => {
      setDocError('');
      setDocMessage('Document Sign saved.');
      setFile(null);
      onLeadUpdated?.(updated);
    },
    onError: (err) => {
      setDocMessage('');
      setDocError(
        err?.response?.data?.message || 'Failed to save Document Sign.'
      );
    },
  });

  const openSignedDocument = async () => {
    try {
      const response = await api.get(clientSignedDocumentUrl(lead._id), {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(response.data);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      setDocError('Failed to open signed document.');
    }
  };

  const handoverNotes = lead?.handover?.handoverNotes || '';
  const upscale = lead?.handover?.upscale;
  const upsellEnabled = Boolean(upscale?.enabled);
  const upsellOffered = Math.max(
    0,
    Number(upscale?.offered ?? upscale?.price) || 0
  );
  const upsellReceived = Math.max(0, Number(upscale?.received) || 0);
  const upsellPending =
    upscale?.pending != null && upscale?.pending !== ''
      ? Math.max(0, Number(upscale.pending) || 0)
      : Math.max(0, upsellOffered - upsellReceived);
  const upsellPayLabel = upsellEnabled
    ? formatUpsellCardPayment(lead, upscale)
    : '—';
  const upsellNotes = lead?.handover?.upscaleNotes || '';

  const agentName = personLabel(lead?.agentId);
  const closerName =
    personLabel(lead?.closedBy) || personLabel(lead?.closerId);

  const canSaveSign =
    !docMutation.isPending &&
    (signYes
      ? Boolean(file) || Boolean(signedDoc?.storedFilename)
      : true);

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-[#111111] p-5 shadow-xl sm:p-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-white">
          Client Context
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Sales Agent and Closer identity fields stay locked. Document Sign is
          editable for CST.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <p className={sectionTitleClass}>Business &amp; Contact</p>
        <div className={gridClass}>
          <Field label="Business Name">
            {displayOrDash(lead?.businessName)}
          </Field>
          <Field label="Client Name">{displayOrDash(lead?.clientName)}</Field>
          <Field label="Personal Phone">
            {displayOrDash(lead?.personalPhone)}
          </Field>
          <Field label="Business Phone">
            {displayOrDash(lead?.businessPhone)}
          </Field>
          <Field label="Personal Email">
            {displayOrDash(lead?.personalEmail)}
          </Field>
          <Field label="Business Email">
            {displayOrDash(lead?.businessEmail)}
          </Field>
          <Field label="Website Link">
            {lead?.websiteLink?.trim() ? (
              <a
                href={lead.websiteLink}
                target="_blank"
                rel="noreferrer"
                className="text-[#F25E26] hover:underline"
              >
                {lead.websiteLink}
              </a>
            ) : (
              '—'
            )}
          </Field>
          <Field label="GMB Link">
            {lead?.gmbLink?.trim() ? (
              <a
                href={lead.gmbLink}
                target="_blank"
                rel="noreferrer"
                className="text-[#F25E26] hover:underline"
              >
                {lead.gmbLink}
              </a>
            ) : (
              '—'
            )}
          </Field>
          <Field label="Service Areas">
            {displayOrDash(lead?.serviceAreas)}
          </Field>
          <Field label="Services Offered">
            {displayOrDash(lead?.servicesOffered)}
          </Field>
        </div>
      </div>

      <div className="mt-6 space-y-3 border-t border-zinc-800/80 pt-5">
        <p className={sectionTitleClass}>Payment &amp; Closing</p>
        <div className={gridClass}>
          <Field label="Payment Offered">
            {offered
              ? offered.toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'USD',
                })
              : '—'}
          </Field>
          <Field label="Payment Received">
            {received.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
            })}
          </Field>
          <Field label="Payment Pending">
            {pending.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
            })}
          </Field>
          <Field label="Payment Method &amp; Card">
            {formatPaymentSummary(payment)}
            {payment.method === 'via_card' && payment.cardExpiry
              ? ` · Exp ${payment.cardExpiry}`
              : ''}
            {payment.method === 'other' && payment.otherDetails
              ? ` · ${payment.otherDetails}`
              : ''}
          </Field>
          <div className="md:col-span-2 lg:col-span-3">
            <p className={labelClass}>Document Sign</p>
            <div className="rounded-xl border border-[#F25E26]/30 bg-[#F25E26]/5 p-3 space-y-3">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Document Sign">
                {[
                  { v: true, label: 'Yes' },
                  { v: false, label: 'No' },
                ].map((opt) => {
                  const active = signYes === opt.v;
                  return (
                    <button
                      key={String(opt.v)}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setSignYes(opt.v);
                        setDocError('');
                        setDocMessage('');
                        if (!opt.v) setFile(null);
                      }}
                      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                        active
                          ? 'bg-[#F25E26] text-white'
                          : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {signYes ? (
                <div className="space-y-2">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] || null);
                      setDocError('');
                      setDocMessage('');
                    }}
                    className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                  />
                  {file ? (
                    <p className="text-xs text-zinc-400">
                      Selected: {file.name}
                    </p>
                  ) : signedDoc?.originalName || signedDoc?.storedFilename ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                      <span>
                        On file: {signedDoc.originalName || signedDoc.storedFilename}
                      </span>
                      <button
                        type="button"
                        onClick={openSignedDocument}
                        className="rounded-lg border border-zinc-700 px-2.5 py-1 font-semibold text-[#F25E26] hover:bg-[#F25E26]/10"
                      >
                        View / Download
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-400">
                      Upload a signed .pdf, .docx, .jpg, or .png.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  Marking No clears the signed document on save.
                </p>
              )}

              <button
                type="button"
                disabled={!canSaveSign}
                onClick={() => docMutation.mutate()}
                className="rounded-xl bg-[#F25E26] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ff6a36] disabled:opacity-60"
              >
                {docMutation.isPending ? 'Saving…' : 'Save Document Sign'}
              </button>
              {docError ? (
                <p className="text-sm text-red-400" role="alert">
                  {docError}
                </p>
              ) : null}
              {docMessage ? (
                <p className="text-sm text-emerald-400" role="status">
                  {docMessage}
                </p>
              ) : null}
            </div>
          </div>
          <Field label="Created By Agent">{displayOrDash(agentName)}</Field>
          <Field label="Closed By Closer">{displayOrDash(closerName)}</Field>
          {lead?.closedAt && formatPktFull ? (
            <Field label="Closed At (PKT)">
              {formatPktFull(lead.closedAt)} PKT
            </Field>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-3 border-t border-zinc-800/80 pt-5">
        <p className={sectionTitleClass}>Handover Upsell Details</p>
        <div className={gridClass}>
          <Field label="Upsell Status">
            {upsellEnabled ? 'Yes' : 'No'}
          </Field>
          {upsellEnabled ? (
            <>
              <Field label="Service Name">
                {displayOrDash(upscale?.itemName)}
              </Field>
              <Field label="Upsell Offered">
                {formatMoneyAmount(upsellOffered)}
              </Field>
              <Field label="Upsell Received">
                {formatMoneyAmount(upsellReceived)}
              </Field>
              <Field label="Upsell Pending">
                {formatMoneyAmount(upsellPending)}
              </Field>
              <Field label="Payment Method">
                {displayOrDash(upsellPayLabel)}
              </Field>
              <div className="md:col-span-2 lg:col-span-3">
                <Field label="Upsell Notes">
                  {displayOrDash(upsellNotes)}
                </Field>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-3 border-t border-zinc-800/80 pt-5">
        <p className={sectionTitleClass}>Notes</p>
        <div className="grid gap-3">
          <Field label="Notes">{displayOrDash(lead?.notes)}</Field>
          <Field label="Handover CST Notes">
            {displayOrDash(handoverNotes)}
          </Field>
        </div>
      </div>
    </div>
  );
}
