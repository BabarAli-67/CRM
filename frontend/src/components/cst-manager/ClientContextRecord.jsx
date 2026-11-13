/**
 * Client Context & Handover Record — every Agent / Closer / CST field,
 * always visible (blank → empty input), editable via unified portfolio Save.
 * Dense 3-column desktop grid; URLs / notes span wider.
 */

const labelClass =
  'mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500';

const fieldClass =
  'w-full rounded-lg border border-zinc-700/80 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/15';

const numInputClass =
  'w-full rounded-lg border border-zinc-700/80 bg-zinc-950/60 py-2 text-center text-sm text-white outline-none transition focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/15 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

const sectionTitleClass =
  'text-[11px] font-semibold uppercase tracking-wider text-[#F25E26]/90';

const gridClass = 'grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

const metaBoxClass =
  'rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-300';

const personLabel = (ref) => {
  if (!ref || typeof ref !== 'object') return '';
  return ref.fullName || ref.username || '';
};

const displayOrDash = (value) => {
  const s = String(value || '').trim();
  return s || '—';
};

/** @param {object} lead @param {(iso: *) => {date,hour,minute,period}} [splitDateTime] */
export function mapProfileFromLead(lead, splitDateTime) {
  const payment = lead?.payment || {};
  const closedParts =
    typeof splitDateTime === 'function'
      ? splitDateTime(lead?.closedAt)
      : { date: '', hour: '', minute: '', period: 'AM' };

  return {
    businessName: lead?.businessName || '',
    clientName: lead?.clientName || '',
    phone: lead?.phone || '',
    workEmail: lead?.workEmail || '',
    personalEmail: lead?.personalEmail || '',
    websiteLink: lead?.websiteLink || '',
    yelpLink: lead?.yelpLink || '',
    gmbLink: lead?.gmbLink || '',
    niche: lead?.niche || '',
    locationAddress: lead?.locationAddress || '',
    servicesArea: lead?.servicesArea || '',
    serviceOffered: lead?.serviceOffered || '',
    leadSource: lead?.leadSource || '',
    notes: lead?.notes || '',
    salesAmount:
      lead?.salesAmount === 0 || lead?.salesAmount
        ? String(lead.salesAmount)
        : '',
    paymentMethod: payment.method || '',
    cardLast4: payment.cardLast4 || '',
    cardBrand: payment.cardBrand || '',
    linkUrl: payment.linkUrl || '',
    otherDetails: payment.otherDetails || '',
    closedDate: closedParts?.date || '',
    closedHour: closedParts?.hour || '',
    closedMinute: closedParts?.minute || '',
    closedPeriod: closedParts?.period || 'AM',
    documentSigned:
      lead?.handover?.documentSigned === true
        ? 'yes'
        : lead?.handover?.documentSigned === false
          ? 'no'
          : '',
    upscaleNotes: lead?.handover?.upscaleNotes || '',
    onboardingNotes: lead?.handover?.onboardingNotes || '',
  };
}

/**
 * @param {object} props
 * @param {object} props.value
 * @param {(patch: object) => void} props.onChange
 * @param {object} props.lead
 * @param {(iso: string|null|undefined) => string} props.formatPktFull
 */
export default function ClientContextRecord({
  value,
  onChange,
  lead,
  formatPktFull,
}) {
  const set = (key, next) => onChange({ [key]: next });

  const closed = {
    date: value.closedDate || '',
    hour: value.closedHour || '',
    minute: value.closedMinute || '',
    period: value.closedPeriod || 'AM',
  };

  const setClosed = (patch) => {
    onChange({
      closedDate: patch.date ?? closed.date,
      closedHour: patch.hour ?? closed.hour,
      closedMinute: patch.minute ?? closed.minute,
      closedPeriod: patch.period ?? closed.period,
    });
  };

  const agentName = personLabel(lead?.agentId);
  const closerName = personLabel(lead?.closerId);
  const techName = personLabel(lead?.handover?.assignedTechId);
  const handoverAt = lead?.handover?.handedOverAt;
  const onboardedAt = lead?.handover?.onboardedAt;

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-[#111111] p-5 shadow-xl sm:p-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-white">
          Client Context &amp; Handover Record
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Full Agent, Closer, and CST history — blank fields stay visible and
          editable. Changes save with the top Save button.
        </p>
      </div>

      {/* Agent Tier */}
      <div className="mt-5 space-y-3">
        <p className={sectionTitleClass}>Lead &amp; Business Info (Agent Tier)</p>
        <div className={gridClass}>
          <div>
            <label className={labelClass} htmlFor="ctx-businessName">
              Business Name
            </label>
            <input
              id="ctx-businessName"
              type="text"
              value={value.businessName}
              onChange={(e) => set('businessName', e.target.value)}
              placeholder="—"
              className={fieldClass}
              autoComplete="organization"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-clientName">
              Client / Contact Name
            </label>
            <input
              id="ctx-clientName"
              type="text"
              value={value.clientName}
              onChange={(e) => set('clientName', e.target.value)}
              placeholder="—"
              className={fieldClass}
              autoComplete="name"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-phone">
              Phone Number
            </label>
            <input
              id="ctx-phone"
              type="tel"
              value={value.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="—"
              className={fieldClass}
              autoComplete="tel"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-workEmail">
              Work Email
            </label>
            <input
              id="ctx-workEmail"
              type="email"
              value={value.workEmail}
              onChange={(e) => set('workEmail', e.target.value)}
              placeholder="—"
              className={fieldClass}
              autoComplete="email"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-personalEmail">
              Personal / Alt Email
            </label>
            <input
              id="ctx-personalEmail"
              type="email"
              value={value.personalEmail}
              onChange={(e) => set('personalEmail', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-niche">
              Niche / Industry
            </label>
            <input
              id="ctx-niche"
              type="text"
              value={value.niche}
              onChange={(e) => set('niche', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-serviceOffered">
              Service Offered
            </label>
            <input
              id="ctx-serviceOffered"
              type="text"
              value={value.serviceOffered}
              onChange={(e) => set('serviceOffered', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-servicesArea">
              Service Area
            </label>
            <input
              id="ctx-servicesArea"
              type="text"
              value={value.servicesArea}
              onChange={(e) => set('servicesArea', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-leadSource">
              Lead Source
            </label>
            <input
              id="ctx-leadSource"
              type="text"
              value={value.leadSource}
              onChange={(e) => set('leadSource', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className={labelClass} htmlFor="ctx-location">
              Location / Address
            </label>
            <input
              id="ctx-location"
              type="text"
              value={value.locationAddress}
              onChange={(e) => set('locationAddress', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className={labelClass} htmlFor="ctx-website">
              Website / Domain URL
            </label>
            <input
              id="ctx-website"
              type="url"
              value={value.websiteLink}
              onChange={(e) => set('websiteLink', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-1 lg:col-span-1">
            <label className={labelClass} htmlFor="ctx-yelp">
              Yelp Link
            </label>
            <input
              id="ctx-yelp"
              type="url"
              value={value.yelpLink}
              onChange={(e) => set('yelpLink', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-1 lg:col-span-2">
            <label className={labelClass} htmlFor="ctx-gmb">
              GMB Link
            </label>
            <input
              id="ctx-gmb"
              type="url"
              value={value.gmbLink}
              onChange={(e) => set('gmbLink', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className={labelClass} htmlFor="ctx-agentNotes">
              Agent Notes
            </label>
            <textarea
              id="ctx-agentNotes"
              rows={2}
              value={value.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="—"
              className={`${fieldClass} resize-y`}
            />
          </div>
        </div>
      </div>

      {/* Closer Tier */}
      <div className="mt-6 space-y-3 border-t border-zinc-800/80 pt-5">
        <p className={sectionTitleClass}>Closing &amp; Deal Info (Closer Tier)</p>
        <div className={gridClass}>
          <div>
            <label className={labelClass} htmlFor="ctx-salesAmount">
              Base Sale Amount
            </label>
            <input
              id="ctx-salesAmount"
              type="number"
              min="0"
              step="0.01"
              value={value.salesAmount}
              onChange={(e) => set('salesAmount', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-payMethod">
              Payment Method
            </label>
            <select
              id="ctx-payMethod"
              value={value.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}
              className={fieldClass}
            >
              <option value="">—</option>
              <option value="via_link">Via link</option>
              <option value="via_card">Via card</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-cardLast4">
              Card Last 4
            </label>
            <input
              id="ctx-cardLast4"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={value.cardLast4}
              onChange={(e) =>
                set('cardLast4', e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-cardBrand">
              Card Brand
            </label>
            <input
              id="ctx-cardBrand"
              type="text"
              value={value.cardBrand}
              onChange={(e) => set('cardBrand', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-docSigned">
              Document Sign / Agreement
            </label>
            <select
              id="ctx-docSigned"
              value={value.documentSigned}
              onChange={(e) => set('documentSigned', e.target.value)}
              className={fieldClass}
            >
              <option value="">—</option>
              <option value="yes">Signed</option>
              <option value="no">Not signed</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="ctx-otherPay">
              Other Payment Details
            </label>
            <input
              id="ctx-otherPay"
              type="text"
              value={value.otherDetails}
              onChange={(e) => set('otherDetails', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <label className={labelClass} htmlFor="ctx-linkUrl">
              Payment Link URL
            </label>
            <input
              id="ctx-linkUrl"
              type="url"
              value={value.linkUrl}
              onChange={(e) => set('linkUrl', e.target.value)}
              placeholder="—"
              className={fieldClass}
            />
          </div>
          <div className="lg:col-span-1">
            <p className={labelClass}>Closed Date / Time (PKT)</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                value={closed.date}
                onChange={(e) => setClosed({ date: e.target.value })}
                className={`${fieldClass} min-w-0 flex-1`}
                aria-label="Closed date"
              />
              <input
                type="number"
                min={1}
                max={12}
                value={closed.hour}
                onChange={(e) => setClosed({ hour: e.target.value })}
                placeholder="HH"
                className={`${numInputClass} w-12 shrink-0`}
                aria-label="Closed hour"
              />
              <span className="text-zinc-500">:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={closed.minute}
                onChange={(e) => setClosed({ minute: e.target.value })}
                placeholder="MM"
                className={`${numInputClass} w-12 shrink-0`}
                aria-label="Closed minute"
              />
              <select
                value={closed.period}
                onChange={(e) => setClosed({ period: e.target.value })}
                className={`${fieldClass} w-[4.25rem] shrink-0`}
                aria-label="Closed AM/PM"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className={labelClass} htmlFor="ctx-closerNotes">
              Closer / Handover Notes
            </label>
            <textarea
              id="ctx-closerNotes"
              rows={2}
              value={value.upscaleNotes}
              onChange={(e) => set('upscaleNotes', e.target.value)}
              placeholder="—"
              className={`${fieldClass} resize-y`}
            />
          </div>
        </div>
      </div>

      {/* CST Tier */}
      <div className="mt-6 space-y-3 border-t border-zinc-800/80 pt-5">
        <p className={sectionTitleClass}>CST Handover Metadata (CST Tier)</p>
        <div className={gridClass}>
          <div>
            <p className={labelClass}>Assigned Agent</p>
            <p className={metaBoxClass}>{displayOrDash(agentName)}</p>
          </div>
          <div>
            <p className={labelClass}>Assigned Closer</p>
            <p className={metaBoxClass}>{displayOrDash(closerName)}</p>
          </div>
          <div>
            <p className={labelClass}>Assigned CST / Tech</p>
            <p className={metaBoxClass}>{displayOrDash(techName)}</p>
          </div>
          <div>
            <p className={labelClass}>Handover Date / Time</p>
            <p className={metaBoxClass}>
              {handoverAt && formatPktFull
                ? `${formatPktFull(handoverAt)} PKT`
                : '—'}
            </p>
          </div>
          <div>
            <p className={labelClass}>Onboarded Date / Time</p>
            <p className={metaBoxClass}>
              {onboardedAt && formatPktFull
                ? `${formatPktFull(onboardedAt)} PKT`
                : '—'}
            </p>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <label className={labelClass} htmlFor="ctx-cstNotes">
              CST Intake Notes
            </label>
            <textarea
              id="ctx-cstNotes"
              rows={2}
              value={value.onboardingNotes}
              onChange={(e) => set('onboardingNotes', e.target.value)}
              placeholder="—"
              className={`${fieldClass} resize-y`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
