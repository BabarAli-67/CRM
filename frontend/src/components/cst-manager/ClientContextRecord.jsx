import {
  formatMoneyAmount,
  formatPaymentSummary,
} from '../../utils/formatPayment.util.js';

const UPSELL_PAY_LABEL = {
  old_card: 'Old Card',
  new_card: 'New Card',
  via_link: 'Link',
  link: 'Link',
  other: 'Others',
  others: 'Others',
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
    linkUrl: payment.linkUrl || '',
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
 * @param {{ lead: object, formatPktFull?: (iso: string) => string }} props
 */
export default function ClientContextRecord({ lead, formatPktFull }) {
  const payment = lead?.payment || {};
  const offered = Number(lead?.paymentOffered ?? lead?.salesAmount) || 0;
  const received = Number(lead?.paymentReceived) || 0;
  const pending =
    lead?.paymentPending != null && lead?.paymentPending !== ''
      ? Number(lead.paymentPending) || 0
      : Math.max(0, offered - received);

  const docSigned = lead?.handover?.documentSigned;
  const signedDoc = lead?.handover?.signedDocument;
  const docLabel =
    docSigned === true
      ? signedDoc?.originalName
        ? `Signed · ${signedDoc.originalName}`
        : 'Signed'
      : docSigned === false
        ? 'Not signed'
        : '—';

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
  const upsellPayLabel =
    UPSELL_PAY_LABEL[upscale?.paymentMethod] ||
    upscale?.paymentMethod ||
    '—';
  const upsellNotes = lead?.handover?.upscaleNotes || '';

  const agentName = personLabel(lead?.agentId);
  const closerName =
    personLabel(lead?.closedBy) || personLabel(lead?.closerId);

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-[#111111] p-5 shadow-xl sm:p-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-white">
          Client Context
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Locked Sales Agent and Closer record — read-only for CST.
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
            {payment.method === 'via_link' && payment.linkUrl
              ? ` · ${payment.linkUrl}`
              : ''}
            {payment.method === 'other' && payment.otherDetails
              ? ` · ${payment.otherDetails}`
              : ''}
          </Field>
          <Field label="Document Sign">{docLabel}</Field>
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
