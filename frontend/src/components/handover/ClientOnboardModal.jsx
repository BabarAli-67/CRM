import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  assignHandover,
  getTechList,
} from '../../services/handover.service.js';

const fieldClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-500/60';

const labelClass = 'block space-y-1.5 text-sm text-zinc-400';

const emptyForm = {
  clientName: '',
  businessEmail: '',
  personalEmail: '',
  paymentOffered: '',
  paymentReceived: '0',
  paymentPending: '',
  servicesOffered: '',
  serviceAreas: '',
  gmbLink: '',
  yelpLink: '',
  techId: '',
  onboardingNotes: '',
};

const computePendingDisplay = (offeredRaw, receivedRaw) => {
  const offered = Number(String(offeredRaw ?? '').trim());
  const received = Number(String(receivedRaw ?? '').trim() || '0');
  if (Number.isNaN(offered) || Number.isNaN(received)) return '';
  return String(Math.max(0, offered - received));
};

/**
 * CST Client Intake / Onboarding — capture operational fields + assign tech.
 */
export default function ClientOnboardModal({ open, lead, onClose, onSuccess }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const {
    data: techs = [],
    isLoading: techsLoading,
    isError: techsError,
  } = useQuery({
    queryKey: ['handoverTechList'],
    queryFn: getTechList,
    enabled: open,
  });

  useEffect(() => {
    if (!open || !lead) return;
    setError('');
    const paymentOffered =
      lead.paymentOffered != null && lead.paymentOffered !== ''
        ? String(lead.paymentOffered)
        : lead.salesAmount != null && lead.salesAmount !== ''
          ? String(lead.salesAmount)
          : '';
    const paymentReceived =
      lead.paymentReceived != null && lead.paymentReceived !== ''
        ? String(lead.paymentReceived)
        : '0';
    setForm({
      clientName: lead.clientName || '',
      businessEmail: lead.businessEmail || '',
      personalEmail: lead.personalEmail || '',
      paymentOffered,
      paymentReceived,
      paymentPending: computePendingDisplay(paymentOffered, paymentReceived),
      servicesOffered: lead.servicesOffered || '',
      serviceAreas: lead.serviceAreas || '',
      gmbLink: lead.gmbLink || '',
      yelpLink: lead.yelpLink || '',
      techId: '',
      onboardingNotes: lead.handover?.onboardingNotes || '',
    });
  }, [open, lead]);

  const mutation = useMutation({
    mutationFn: ({ id, payload }) => assignHandover(id, payload),
    onSuccess: (updatedLead) => {
      setError('');
      onSuccess?.(updatedLead);
      onClose?.();
    },
    onError: (err) => {
      setError(
        err?.response?.data?.message || 'Failed to onboard client.'
      );
    },
  });

  if (!open || !lead) return null;

  const setField = (key) => (e) => {
    const nextValue = e.target.value;
    setForm((prev) => {
      const next = { ...prev, [key]: nextValue };
      if (key === 'paymentOffered' || key === 'paymentReceived') {
        next.paymentPending = computePendingDisplay(
          key === 'paymentOffered' ? nextValue : next.paymentOffered,
          key === 'paymentReceived' ? nextValue : next.paymentReceived
        );
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.techId) {
      setError('Select a tech team member.');
      return;
    }

    const offeredRaw = form.paymentOffered.trim();
    const paymentOffered =
      offeredRaw === '' ? null : Number(offeredRaw);
    if (
      paymentOffered != null &&
      (Number.isNaN(paymentOffered) || paymentOffered < 0)
    ) {
      setError('Payment offered must be a valid non-negative number.');
      return;
    }
    const paymentReceived = Number(form.paymentReceived.trim() || '0');
    if (Number.isNaN(paymentReceived) || paymentReceived < 0) {
      setError('Payment received must be a valid non-negative number.');
      return;
    }

    mutation.mutate({
      id: lead._id,
      payload: {
        techId: form.techId,
        clientName: form.clientName.trim() || null,
        businessEmail: form.businessEmail.trim() || null,
        personalEmail: form.personalEmail.trim() || null,
        paymentOffered,
        paymentReceived,
        servicesOffered: form.servicesOffered.trim() || null,
        serviceAreas: form.serviceAreas.trim() || null,
        gmbLink: form.gmbLink.trim() || null,
        yelpLink: form.yelpLink.trim() || null,
        onboardingNotes: form.onboardingNotes.trim() || null,
      },
    });
  };

  const busy = mutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-onboard-title"
    >
      <button
        type="button"
        aria-label="Close backdrop"
        className="absolute inset-0 cursor-default"
        onClick={busy ? undefined : onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
      >
        <div className="border-b border-zinc-800 px-5 py-4">
          <h3
            id="client-onboard-title"
            className="font-display text-lg font-semibold text-white"
          >
            Onboard Client
          </h3>
          <p className="mt-0.5 text-sm text-zinc-400">
            {lead.businessName || 'Lead'}
            {lead.businessPhone || lead.personalPhone
              ? ` · ${lead.businessPhone || lead.personalPhone}`
              : ''}
          </p>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <label className={labelClass}>
            <span>Client full name</span>
            <input
              value={form.clientName}
              onChange={setField('clientName')}
              className={fieldClass}
              autoComplete="name"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelClass}>
              <span>Payment Offered</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.paymentOffered}
                onChange={setField('paymentOffered')}
                className={fieldClass}
                placeholder="0.00"
              />
            </label>
            <label className={labelClass}>
              <span>Payment Received</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.paymentReceived}
                onChange={setField('paymentReceived')}
                className={fieldClass}
                placeholder="0"
              />
            </label>
            <label className={labelClass}>
              <span>Payment Pending</span>
              <input
                readOnly
                type="number"
                value={form.paymentPending}
                className={fieldClass}
                tabIndex={-1}
                aria-readonly="true"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>Business email</span>
              <input
                type="email"
                value={form.businessEmail}
                onChange={setField('businessEmail')}
                className={fieldClass}
                autoComplete="email"
              />
            </label>
            <label className={labelClass}>
              <span>Personal email</span>
              <input
                type="email"
                value={form.personalEmail}
                onChange={setField('personalEmail')}
                className={fieldClass}
              />
            </label>
          </div>

          <label className={labelClass}>
            <span>Services offered</span>
            <input
              value={form.servicesOffered}
              onChange={setField('servicesOffered')}
              className={fieldClass}
              placeholder="e.g. GMB optimization, website"
            />
          </label>

          <label className={labelClass}>
            <span>Service areas / location</span>
            <input
              value={form.serviceAreas}
              onChange={setField('serviceAreas')}
              className={fieldClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>GMB link</span>
              <input
                type="url"
                value={form.gmbLink}
                onChange={setField('gmbLink')}
                className={fieldClass}
                placeholder="https://"
              />
            </label>
            <label className={labelClass}>
              <span>Yelp link</span>
              <input
                type="url"
                value={form.yelpLink}
                onChange={setField('yelpLink')}
                className={fieldClass}
                placeholder="https://"
              />
            </label>
          </div>

          <label className={labelClass}>
            <span>Assign to tech *</span>
            <select
              value={form.techId}
              onChange={setField('techId')}
              disabled={techsLoading || techsError}
              className={fieldClass}
              required
            >
              <option value="">
                {techsLoading ? 'Loading…' : 'Select tech member…'}
              </option>
              {[...techs]
                .sort((a, b) =>
                  String(a.fullName || '').localeCompare(
                    String(b.fullName || '')
                  )
                )
                .map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.fullName} (@{t.username})
                  </option>
                ))}
            </select>
          </label>

          <label className={labelClass}>
            <span>Onboarding &amp; tech execution notes</span>
            <textarea
              rows={4}
              value={form.onboardingNotes}
              onChange={setField('onboardingNotes')}
              className={fieldClass}
              placeholder="Credentials, priorities, special instructions…"
            />
          </label>

          {techsError ? (
            <p role="alert" className="text-sm text-red-400">
              Failed to load tech list.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !form.techId}
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
          >
            {busy ? 'Onboarding…' : 'Onboard & Assign'}
          </button>
        </div>
      </form>
    </div>
  );
}
