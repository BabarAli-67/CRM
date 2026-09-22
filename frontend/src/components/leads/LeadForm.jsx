import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createLead,
  sendLeadToCloserPool,
  updateLead,
} from '../../services/lead.service.js';

const emptyForm = {
  businessName: '',
  phone: '',
  websiteLink: '',
  notes: '',
};

const mapInitialToForm = (initialValues) => {
  if (!initialValues) return emptyForm;
  return {
    businessName: initialValues.businessName || '',
    phone: initialValues.phone || '',
    websiteLink: initialValues.websiteLink || '',
    notes: initialValues.notes || '',
  };
};

const fieldClass =
  'w-full rounded-md border border-white/15 bg-obsidian px-3 py-2 text-ink outline-none focus:border-flash-secondary';

const labelClass = 'block space-y-1.5 text-sm text-ink/80';

const STATUS_LABEL = {
  with_agent: 'With Agent',
  pending_closer_claim: 'Pending Closer Claim',
  in_progress: 'In Progress',
};

/**
 * Minimal create/edit lead form — 4 fields + optional send-to-pool.
 */
export default function LeadForm({
  initialValues = null,
  leadId: leadIdProp = null,
  onSaved,
  onCancel,
  title = 'Lead',
}) {
  const queryClient = useQueryClient();
  const leadId = leadIdProp || initialValues?._id || null;
  const pipelineStatus = initialValues?.status || 'with_agent';

  const [form, setForm] = useState(() => mapInitialToForm(initialValues));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setForm(mapInitialToForm(initialValues));
    setError('');
    setMessage('');
  }, [initialValues]);

  const invalidate = (lead) => {
    queryClient.invalidateQueries({ queryKey: ['myLeads'] });
    queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
    queryClient.invalidateQueries({ queryKey: ['closerPool'] });
    queryClient.invalidateQueries({ queryKey: ['allLeads'] });
    queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
    if (lead?._id) {
      queryClient.invalidateQueries({ queryKey: ['lead', lead._id] });
    }
  };

  const saveMutation = useMutation({
    mutationFn: async ({ payload, sendToCloserPool }) => {
      if (leadId) {
        const lead = await updateLead(leadId, payload);
        if (sendToCloserPool) {
          return sendLeadToCloserPool(leadId);
        }
        return lead;
      }
      return createLead({ ...payload, sendToCloserPool: Boolean(sendToCloserPool) });
    },
    onSuccess: (lead, variables) => {
      setError('');
      setMessage(
        variables.sendToCloserPool
          ? 'Lead sent to closer pool.'
          : leadId
            ? 'Lead saved.'
            : 'Lead created.'
      );
      invalidate(lead);
      onSaved?.(lead, { sentToPool: Boolean(variables.sendToCloserPool) });
    },
    onError: (err) => {
      setMessage('');
      setError(err?.response?.data?.message || 'Failed to save lead.');
    },
  });

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const buildPayload = () => ({
    businessName: form.businessName.trim(),
    phone: form.phone.trim(),
    websiteLink: form.websiteLink.trim() || null,
    notes: form.notes.trim() || null,
  });

  const submit = (sendToCloserPool) => {
    setError('');
    setMessage('');

    if (!form.businessName.trim() || !form.phone.trim()) {
      setError('Business name and phone are required.');
      return;
    }

    if (
      sendToCloserPool &&
      leadId &&
      (pipelineStatus === 'pending_closer_claim' ||
        pipelineStatus === 'in_progress')
    ) {
      setError(
        pipelineStatus === 'in_progress'
          ? 'This lead is already claimed by a closer.'
          : 'This lead is already in the closer pool.'
      );
      return;
    }

    saveMutation.mutate({
      payload: buildPayload(),
      sendToCloserPool,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit(false);
  };

  const canSendToPool =
    !leadId ||
    pipelineStatus === 'with_agent' ||
    pipelineStatus === 'pending_closer_claim';

  const busy = saveMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          {leadId ? (
            <p className="mt-1 text-sm text-ink/60">
              Status:{' '}
              <span className="font-medium text-orange-300">
                {STATUS_LABEL[pipelineStatus] || pipelineStatus}
              </span>
            </p>
          ) : null}
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-ink/80 hover:bg-white/5"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className={labelClass}>
          <span>Business Name *</span>
          <input
            required
            value={form.businessName}
            onChange={handleChange('businessName')}
            className={fieldClass}
            autoComplete="organization"
          />
        </label>

        <label className={labelClass}>
          <span>Phone Number *</span>
          <input
            required
            value={form.phone}
            onChange={handleChange('phone')}
            className={fieldClass}
            autoComplete="tel"
          />
        </label>

        <label className={labelClass}>
          <span>Website Link</span>
          <input
            type="url"
            placeholder="https://"
            value={form.websiteLink}
            onChange={handleChange('websiteLink')}
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          <span>Notes</span>
          <textarea
            rows={4}
            placeholder="Call details / summary"
            value={form.notes}
            onChange={handleChange('notes')}
            className={fieldClass}
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm text-emerald-300">{message}</p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {canSendToPool && pipelineStatus !== 'pending_closer_claim' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(true)}
              className="rounded-md border border-orange-500/40 bg-orange-600/20 px-4 py-2 text-sm font-semibold text-orange-200 hover:bg-orange-600/35 disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send to Closer Pool'}
            </button>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-flash-primary px-4 py-2 text-sm font-semibold text-white hover:bg-flash-secondary disabled:opacity-60"
          >
            {busy
              ? 'Saving…'
              : leadId
                ? 'Save Lead'
                : 'Create Lead'}
          </button>
        </div>
      </form>
    </div>
  );
}
