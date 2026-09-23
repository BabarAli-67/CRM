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
  workEmail: '',
  personalEmail: '',
  salesAmount: '',
  serviceOffered: '',
  servicesArea: '',
  gmbLink: '',
  yelpLink: '',
  techId: '',
  onboardingNotes: '',
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
    setForm({
      clientName: lead.clientName || '',
      workEmail: lead.workEmail || '',
      personalEmail: lead.personalEmail || '',
      salesAmount:
        lead.salesAmount != null && lead.salesAmount !== ''
          ? String(lead.salesAmount)
          : '',
      serviceOffered: lead.serviceOffered || '',
      servicesArea: lead.servicesArea || '',
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
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.techId) {
      setError('Select a tech team member.');
      return;
    }

    mutation.mutate({
      id: lead._id,
      payload: {
        techId: form.techId,
        clientName: form.clientName.trim() || null,
        workEmail: form.workEmail.trim() || null,
        personalEmail: form.personalEmail.trim() || null,
        salesAmount: form.salesAmount.trim() || null,
        serviceOffered: form.serviceOffered.trim() || null,
        servicesArea: form.servicesArea.trim() || null,
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
            {lead.phone ? ` · ${lead.phone}` : ''}
          </p>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>Client full name</span>
              <input
                value={form.clientName}
                onChange={setField('clientName')}
                className={fieldClass}
                autoComplete="name"
              />
            </label>
            <label className={labelClass}>
              <span>Sales amount / package</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.salesAmount}
                onChange={setField('salesAmount')}
                className={fieldClass}
                placeholder="0.00"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>Business / work email</span>
              <input
                type="email"
                value={form.workEmail}
                onChange={setField('workEmail')}
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
              value={form.serviceOffered}
              onChange={setField('serviceOffered')}
              className={fieldClass}
              placeholder="e.g. GMB optimization, website"
            />
          </label>

          <label className={labelClass}>
            <span>Service area / location</span>
            <input
              value={form.servicesArea}
              onChange={setField('servicesArea')}
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
