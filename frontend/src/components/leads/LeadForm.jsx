import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getUsers,
  setLeadFollowUp,
  updateLead,
  createLead,
} from '../../services/lead.service.js';

const emptyForm = {
  clientName: '',
  businessName: '',
  phone: '',
  workEmail: '',
  personalEmail: '',
  yelpLink: '',
  websiteLink: '',
  gmbLink: '',
  servicesArea: '',
  serviceOffered: '',
  salesAmount: '',
  closerId: '',
  notes: '',
};

const toLocalInputValue = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const mapInitialToForm = (initialValues) => {
  if (!initialValues) return emptyForm;
  const closerId =
    initialValues.closerId?._id || initialValues.closerId || '';
  return {
    clientName: initialValues.clientName || '',
    businessName: initialValues.businessName || '',
    phone: initialValues.phone || '',
    workEmail: initialValues.workEmail || '',
    personalEmail: initialValues.personalEmail || '',
    yelpLink: initialValues.yelpLink || '',
    websiteLink: initialValues.websiteLink || '',
    gmbLink: initialValues.gmbLink || '',
    servicesArea: initialValues.servicesArea || '',
    serviceOffered: initialValues.serviceOffered || '',
    salesAmount:
      initialValues.salesAmount === null ||
      initialValues.salesAmount === undefined
        ? ''
        : String(initialValues.salesAmount),
    closerId: closerId ? String(closerId) : '',
    notes: initialValues.notes || '',
  };
};

const fieldClass =
  'w-full rounded-md border border-white/15 bg-obsidian px-3 py-2 text-ink outline-none focus:border-flash-secondary';

const labelClass = 'block space-y-1.5 text-sm text-ink/80';

/**
 * Lead create/edit form with optional follow-up scheduler.
 *
 * @param {object} [initialValues] Pre-fill from promote or existing lead
 * @param {string} [leadId] Existing lead id (edit mode); follow-up requires this
 * @param {(lead: object) => void} [onSaved] Called after main save
 * @param {() => void} [onCancel]
 * @param {string} [title]
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

  const [form, setForm] = useState(() => mapInitialToForm(initialValues));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [followUpOpen, setFollowUpOpen] = useState(
    Boolean(initialValues?.followUp?.callbackAt)
  );
  const [followUpAt, setFollowUpAt] = useState(
    toLocalInputValue(initialValues?.followUp?.callbackAt)
  );
  const [followUpNotes, setFollowUpNotes] = useState(
    initialValues?.followUp?.notes || ''
  );
  const [followUpError, setFollowUpError] = useState('');
  const [followUpMessage, setFollowUpMessage] = useState('');

  useEffect(() => {
    setForm(mapInitialToForm(initialValues));
    setFollowUpAt(toLocalInputValue(initialValues?.followUp?.callbackAt));
    setFollowUpNotes(initialValues?.followUp?.notes || '');
    setFollowUpOpen(Boolean(initialValues?.followUp?.callbackAt));
    setError('');
    setMessage('');
  }, [initialValues]);

  const { data: closers = [], isLoading: closersLoading } = useQuery({
    queryKey: ['users', 'closer'],
    queryFn: () => getUsers({ role: 'closer', status: 'approved' }),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (leadId) {
        return updateLead(leadId, payload);
      }
      return createLead(payload);
    },
    onSuccess: (lead) => {
      setError('');
      setMessage(leadId ? 'Lead saved.' : 'Lead created.');
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', lead?._id] });
      onSaved?.(lead);
    },
    onError: (err) => {
      setMessage('');
      setError(err?.response?.data?.message || 'Failed to save lead.');
    },
  });

  const followUpMutation = useMutation({
    mutationFn: (payload) => setLeadFollowUp(leadId, payload),
    onSuccess: (lead) => {
      setFollowUpError('');
      setFollowUpMessage(
        lead?.followUp?.callbackAt ? 'Follow-up saved.' : 'Follow-up cleared.'
      );
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
    },
    onError: (err) => {
      setFollowUpMessage('');
      setFollowUpError(
        err?.response?.data?.message || 'Failed to save follow-up.'
      );
    },
  });

  const closerOptions = useMemo(
    () =>
      [...closers].sort((a, b) =>
        String(a.fullName || '').localeCompare(String(b.fullName || ''))
      ),
    [closers]
  );

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const buildPayload = () => {
    const salesAmountRaw = form.salesAmount.trim();
    const salesAmount =
      salesAmountRaw === ''
        ? null
        : Number.isFinite(Number(salesAmountRaw))
          ? Number(salesAmountRaw)
          : null;

    return {
      clientName: form.clientName.trim() || null,
      businessName: form.businessName.trim(),
      phone: form.phone.trim(),
      workEmail: form.workEmail.trim() || null,
      personalEmail: form.personalEmail.trim() || null,
      yelpLink: form.yelpLink.trim() || null,
      websiteLink: form.websiteLink.trim() || null,
      gmbLink: form.gmbLink.trim() || null,
      servicesArea: form.servicesArea.trim() || null,
      serviceOffered: form.serviceOffered.trim() || null,
      salesAmount,
      closerId: form.closerId || null,
      notes: form.notes.trim() || null,
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!form.businessName.trim() || !form.phone.trim()) {
      setError('Business name and phone are required.');
      return;
    }

    const payload = buildPayload();
    if (form.salesAmount.trim() !== '' && payload.salesAmount === null) {
      setError('Sales amount must be a valid number.');
      return;
    }

    saveMutation.mutate(payload);
  };

  const handleSaveFollowUp = (e) => {
    e.preventDefault();
    setFollowUpError('');
    setFollowUpMessage('');

    if (!leadId) {
      setFollowUpError('Save the lead first, then schedule a follow-up.');
      return;
    }

    if (!followUpAt) {
      setFollowUpError('Pick a follow-up date and time, or clear the follow-up.');
      return;
    }

    const callbackAt = new Date(followUpAt);
    if (Number.isNaN(callbackAt.getTime())) {
      setFollowUpError('Invalid follow-up date/time.');
      return;
    }

    followUpMutation.mutate({
      callbackAt: callbackAt.toISOString(),
      notes: followUpNotes.trim() || null,
    });
  };

  const handleClearFollowUp = () => {
    if (!leadId) return;
    setFollowUpError('');
    setFollowUpMessage('');
    followUpMutation.mutate({ callbackAt: null });
    setFollowUpAt('');
    setFollowUpNotes('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span>Client name</span>
            <input
              value={form.clientName}
              onChange={handleChange('clientName')}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            <span>Business name *</span>
            <input
              required
              value={form.businessName}
              onChange={handleChange('businessName')}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            <span>Phone *</span>
            <input
              required
              value={form.phone}
              onChange={handleChange('phone')}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            <span>Work email</span>
            <input
              type="email"
              value={form.workEmail}
              onChange={handleChange('workEmail')}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            <span>Personal email</span>
            <input
              type="email"
              value={form.personalEmail}
              onChange={handleChange('personalEmail')}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            <span>Sales amount</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.salesAmount}
              onChange={handleChange('salesAmount')}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            <span>Yelp link</span>
            <input
              type="url"
              placeholder="https://"
              value={form.yelpLink}
              onChange={handleChange('yelpLink')}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            <span>Website link</span>
            <input
              type="url"
              placeholder="https://"
              value={form.websiteLink}
              onChange={handleChange('websiteLink')}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            <span>GMB link</span>
            <input
              type="url"
              placeholder="https://"
              value={form.gmbLink}
              onChange={handleChange('gmbLink')}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            <span>Services area</span>
            <input
              value={form.servicesArea}
              onChange={handleChange('servicesArea')}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            <span>Service offered</span>
            <input
              value={form.serviceOffered}
              onChange={handleChange('serviceOffered')}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            <span>Closer</span>
            <select
              value={form.closerId}
              onChange={handleChange('closerId')}
              className={fieldClass}
              disabled={closersLoading}
            >
              <option value="">Unassigned</option>
              {closerOptions.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.fullName} ({c.email})
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={labelClass}>
          <span>Notes</span>
          <textarea
            rows={4}
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
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-md bg-flash-primary px-4 py-2 text-sm font-semibold text-white hover:bg-flash-secondary disabled:opacity-60"
          >
            {saveMutation.isPending
              ? 'Saving…'
              : leadId
                ? 'Save Lead'
                : 'Create Lead'}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        <button
          type="button"
          onClick={() => setFollowUpOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left font-display text-sm font-semibold text-ink hover:bg-white/5"
        >
          <span>Add Follow-up / Call Back Date &amp; Time</span>
          <span className="text-ink/60">{followUpOpen ? '▾' : '▸'}</span>
        </button>

        {followUpOpen ? (
          <div className="space-y-3 border-t border-white/10 px-4 py-4">
            {!leadId ? (
              <p className="text-sm text-amber-200/90">
                Save the lead first to schedule a follow-up reminder.
              </p>
            ) : null}

            <label className={labelClass}>
              <span>Follow-up at</span>
              <input
                type="datetime-local"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
                disabled={!leadId}
                className={fieldClass}
              />
            </label>

            <label className={labelClass}>
              <span>Follow-up notes</span>
              <textarea
                rows={2}
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                disabled={!leadId}
                className={fieldClass}
              />
            </label>

            {followUpError ? (
              <p role="alert" className="text-sm text-red-300">
                {followUpError}
              </p>
            ) : null}
            {followUpMessage ? (
              <p className="text-sm text-emerald-300">{followUpMessage}</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!leadId || followUpMutation.isPending}
                onClick={handleSaveFollowUp}
                className="rounded-md bg-flash-tertiary/90 px-3 py-1.5 text-sm font-semibold text-obsidian hover:bg-flash-tertiary disabled:opacity-60"
              >
                {followUpMutation.isPending ? 'Saving…' : 'Save Follow-up'}
              </button>
              <button
                type="button"
                disabled={!leadId || followUpMutation.isPending}
                onClick={handleClearFollowUp}
                className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-ink/80 hover:bg-white/5 disabled:opacity-60"
              >
                Clear Follow-up
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
