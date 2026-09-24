import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useAuth from '../../hooks/useAuth.hook.js';
import { createCallback } from '../../services/callback.service.js';
import {
  createLead,
  sendLeadToCloserPool,
  updateLead,
} from '../../services/lead.service.js';

const pad = (n) => String(n).padStart(2, '0');

const todayDateValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Digits only; empty string allowed while typing. */
const digitsOnly = (raw, maxLen) => {
  const d = String(raw || '').replace(/\D/g, '');
  return maxLen ? d.slice(0, maxLen) : d;
};

const clampOnBlur = (raw, min, max, { padTo = 0 } = {}) => {
  if (raw === '' || raw == null) return '';
  const n = Number(raw);
  if (Number.isNaN(n)) return '';
  const clamped = Math.min(max, Math.max(min, Math.trunc(n)));
  return padTo > 0 ? String(clamped).padStart(padTo, '0') : String(clamped);
};

const splitDateTime = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) {
    return {
      date: todayDateValue(),
      hour: '09',
      minute: '00',
      period: 'AM',
    };
  }

  let h24 = d.getHours();
  const period = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;

  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour: pad(h12),
    minute: pad(d.getMinutes()),
    period,
  };
};

const toIsoTimestamp = ({ date, hour, minute, period }) => {
  if (
    !date ||
    hour === '' ||
    minute === '' ||
    hour == null ||
    minute == null ||
    !period
  ) {
    return null;
  }

  let h = Number(hour);
  const mi = Number(minute);
  if (
    Number.isNaN(h) ||
    Number.isNaN(mi) ||
    h < 1 ||
    h > 12 ||
    mi < 0 ||
    mi > 59
  ) {
    return null;
  }

  if (period === 'AM') {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }

  const [y, m, day] = date.split('-').map(Number);
  const local = new Date(y, m - 1, day, h, mi, 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
};

const fieldClass =
  'w-full rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-70';

const numInputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 text-center text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

const labelClass = 'block space-y-1.5 text-sm text-zinc-300';

const emptyForm = {
  clientName: '',
  businessName: '',
  phone: '',
  workEmail: '',
  personalEmail: '',
  websiteLink: '',
  gmbLink: '',
  servicesArea: '',
  serviceOffered: '',
  salesAmount: '',
  notes: '',
};

const mapInitialToForm = (initialValues) => {
  if (!initialValues) return emptyForm;
  return {
    clientName: initialValues.clientName || '',
    businessName: initialValues.businessName || '',
    phone: initialValues.phone || '',
    workEmail: initialValues.workEmail || '',
    personalEmail: initialValues.personalEmail || '',
    websiteLink: initialValues.websiteLink || '',
    gmbLink: initialValues.gmbLink || '',
    servicesArea: initialValues.servicesArea || '',
    serviceOffered: initialValues.serviceOffered || '',
    salesAmount:
      initialValues.salesAmount != null && initialValues.salesAmount !== ''
        ? String(initialValues.salesAmount)
        : '',
    notes: initialValues.notes || '',
  };
};

const STATUS_LABEL = {
  with_agent: 'With Agent',
  pending_closer_claim: 'Pending Closer Claim',
  in_progress: 'In Progress',
};

const normalizeUrl = (raw) => {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
};

/**
 * Comprehensive sales-agent lead intake + optional linked callback scheduler.
 */
export default function LeadForm({
  initialValues = null,
  leadId: leadIdProp = null,
  onSaved,
  onCancel,
  title = 'Lead',
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const leadId = leadIdProp || initialValues?._id || null;
  const pipelineStatus = initialValues?.status || 'with_agent';
  const agentDisplayName =
    user?.fullName?.trim() ||
    user?.username ||
    initialValues?.agentId?.fullName ||
    '—';

  const [form, setForm] = useState(() => mapInitialToForm(initialValues));
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const existingFollowUp = initialValues?.followUp?.callbackAt;
  const followParts = splitDateTime(existingFollowUp);

  const [scheduleCallback, setScheduleCallback] = useState(() =>
    Boolean(existingFollowUp)
  );
  const [cbDate, setCbDate] = useState(followParts.date);
  const [cbHour, setCbHour] = useState(followParts.hour);
  const [cbMinute, setCbMinute] = useState(followParts.minute);
  const [cbPeriod, setCbPeriod] = useState(followParts.period);
  const [cbNotes, setCbNotes] = useState(
    () => initialValues?.followUp?.notes || initialValues?.notes || ''
  );

  useEffect(() => {
    setForm(mapInitialToForm(initialValues));
    setError('');
    const parts = splitDateTime(initialValues?.followUp?.callbackAt);
    setScheduleCallback(Boolean(initialValues?.followUp?.callbackAt));
    setCbDate(parts.date);
    setCbHour(parts.hour);
    setCbMinute(parts.minute);
    setCbPeriod(parts.period);
    setCbNotes(
      initialValues?.followUp?.notes || initialValues?.notes || ''
    );
  }, [initialValues]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  const previewLabel = useMemo(() => {
    if (!scheduleCallback || !cbDate) return '';
    try {
      const iso = toIsoTimestamp({
        date: cbDate,
        hour: cbHour,
        minute: cbMinute,
        period: cbPeriod,
      });
      if (!iso) return '';
      return new Date(iso).toLocaleString('en-PK', {
        timeZone: 'Asia/Karachi',
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }, [scheduleCallback, cbDate, cbHour, cbMinute, cbPeriod]);

  const patchMyLeadsCache = (lead, { sentToPool }) => {
    queryClient.setQueryData(['myLeads'], (old) => {
      const list = Array.isArray(old) ? old : [];
      if (!lead?._id) return list;
      if (sentToPool || lead.status !== 'with_agent') {
        return list.filter((l) => String(l._id) !== String(lead._id));
      }
      const idx = list.findIndex((l) => String(l._id) === String(lead._id));
      if (idx >= 0) {
        const next = [...list];
        next[idx] = { ...list[idx], ...lead };
        return next;
      }
      return [lead, ...list];
    });
  };

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
    mutationFn: async ({ payload, sendToCloserPool, callback, priorFollowUpAt }) => {
      let lead;
      if (leadId) {
        if (sendToCloserPool) {
          await updateLead(leadId, payload);
          lead = await sendLeadToCloserPool(leadId);
        } else {
          lead = await updateLead(leadId, payload);
        }
      } else {
        lead = await createLead({
          ...payload,
          sendToCloserPool: Boolean(sendToCloserPool),
        });
      }

      if (callback?.callbackAt && lead?._id) {
        const prevAt = priorFollowUpAt
          ? new Date(priorFollowUpAt).getTime()
          : null;
        const nextAt = new Date(callback.callbackAt).getTime();
        // Avoid duplicate agenda rows when editing without rescheduling
        if (prevAt === null || nextAt !== prevAt) {
          await createCallback({
            leadId: lead._id,
            callbackAt: callback.callbackAt,
            notes: callback.notes || undefined,
          });
        }
      }

      return lead;
    },
    onSuccess: (lead, variables) => {
      setError('');
      const sentToPool = Boolean(variables.sendToCloserPool);
      const scheduled = Boolean(variables.callback?.callbackAt);
      const base = sentToPool
        ? 'Lead sent to closer pool.'
        : leadId
          ? 'Lead saved.'
          : 'Lead created.';
      const toastMessage = scheduled ? `${base} Callback scheduled.` : base;
      setToast(toastMessage);
      patchMyLeadsCache(lead, { sentToPool });
      invalidate(lead);
      onSaved?.(lead, {
        sentToPool,
        scheduledCallback: scheduled,
        toastMessage,
      });
    },
    onError: (err) => {
      setError(err?.response?.data?.message || 'Failed to save lead.');
    },
  });

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const buildPayload = () => {
    const salesRaw = form.salesAmount.trim();
    let salesAmount = null;
    if (salesRaw !== '') {
      const n = Number(salesRaw);
      if (Number.isNaN(n) || n < 0) {
        throw new Error('Sales amount must be a valid non-negative number.');
      }
      salesAmount = n;
    }

    return {
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
  };

  const submit = (sendToCloserPool) => {
    setError('');

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

    let payload;
    try {
      payload = buildPayload();
    } catch (err) {
      setError(err.message || 'Invalid form values.');
      return;
    }

    let callback = null;
    if (scheduleCallback) {
      if (!cbDate) {
        setError('Please pick a callback date.');
        return;
      }
      const normalizedHour = clampOnBlur(cbHour, 1, 12, { padTo: 2 });
      const normalizedMinute = clampOnBlur(cbMinute, 0, 59, { padTo: 2 });
      setCbHour(normalizedHour);
      setCbMinute(normalizedMinute);

      const iso = toIsoTimestamp({
        date: cbDate,
        hour: normalizedHour,
        minute: normalizedMinute,
        period: cbPeriod,
      });
      if (!iso) {
        setError('Please provide a valid callback date and time.');
        return;
      }
      callback = {
        callbackAt: iso,
        notes: cbNotes.trim() || form.notes.trim() || undefined,
      };
    }

    saveMutation.mutate({
      payload,
      sendToCloserPool,
      callback,
      priorFollowUpAt: initialValues?.followUp?.callbackAt || null,
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
    <>
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 right-6 z-[70] rounded-md border border-emerald-400/30 bg-emerald-950/95 px-4 py-2.5 text-sm font-semibold text-emerald-200 shadow-lg"
        >
          {toast}
        </div>
      ) : null}

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold text-white">
              {title}
            </h2>
            {leadId ? (
              <p className="mt-1 text-sm text-zinc-400">
                Status:{' '}
                <span className="font-medium text-orange-300">
                  {STATUS_LABEL[pipelineStatus] || pipelineStatus}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-zinc-400">
                Full intake · optional follow-up callback
              </p>
            )}
          </div>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span>Client Name</span>
              <input
                value={form.clientName}
                onChange={handleChange('clientName')}
                className={fieldClass}
                autoComplete="name"
                placeholder="Contact person"
              />
            </label>

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
              <span>Business Email</span>
              <input
                type="email"
                value={form.workEmail}
                onChange={handleChange('workEmail')}
                className={fieldClass}
                autoComplete="email"
                placeholder="ops@business.com"
              />
            </label>

            <label className={labelClass}>
              <span>Personal Email</span>
              <input
                type="email"
                value={form.personalEmail}
                onChange={handleChange('personalEmail')}
                className={fieldClass}
                autoComplete="email"
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
              <span>GMB Link</span>
              <input
                type="url"
                placeholder="Google My Business URL"
                value={form.gmbLink}
                onChange={handleChange('gmbLink')}
                className={fieldClass}
              />
            </label>

            <label className={labelClass}>
              <span>Service Area</span>
              <input
                value={form.servicesArea}
                onChange={handleChange('servicesArea')}
                className={fieldClass}
                placeholder="City, State, or Region"
              />
            </label>

            <label className={labelClass}>
              <span>Services Offered</span>
              <input
                value={form.serviceOffered}
                onChange={handleChange('serviceOffered')}
                className={fieldClass}
                placeholder="Website, SEO, Yelp"
              />
            </label>

            <label className={labelClass}>
              <span>Sales Amount</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.salesAmount}
                  onChange={handleChange('salesAmount')}
                  className={`${fieldClass} pl-7`}
                  placeholder="0.00"
                />
              </div>
            </label>

            <label className={labelClass}>
              <span>Agent Name</span>
              <input
                readOnly
                value={agentDisplayName}
                className={fieldClass}
                tabIndex={-1}
              />
            </label>

            <label className={`${labelClass} sm:col-span-2`}>
              <span>Notes</span>
              <textarea
                rows={4}
                placeholder="Call details / summary"
                value={form.notes}
                onChange={handleChange('notes')}
                className={`${fieldClass} resize-y`}
              />
            </label>
          </div>

          {/* Optional callback scheduler */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40">
            <label className="flex cursor-pointer items-start gap-3 px-4 py-3.5">
              <input
                type="checkbox"
                checked={scheduleCallback}
                onChange={(e) => {
                  const on = e.target.checked;
                  setScheduleCallback(on);
                  if (on && !cbNotes.trim() && form.notes.trim()) {
                    setCbNotes(form.notes);
                  }
                }}
                className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-orange-600 focus:ring-orange-500/40"
              />
              <span>
                <span className="block text-sm font-semibold text-zinc-100">
                  Schedule a Callback
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  Set a follow-up callback for this lead — syncs to My Callbacks
                </span>
              </span>
            </label>

            {scheduleCallback ? (
              <div className="space-y-4 border-t border-zinc-800 px-4 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className={labelClass}>
                    <span>Callback Date</span>
                    <input
                      required={scheduleCallback}
                      type="date"
                      value={cbDate}
                      onChange={(e) => setCbDate(e.target.value)}
                      className={fieldClass}
                    />
                  </label>

                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-zinc-300">
                      Callback Time (PKT)
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="block space-y-1">
                        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                          Hour
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={12}
                          placeholder="HH"
                          value={cbHour}
                          onChange={(e) =>
                            setCbHour(digitsOnly(e.target.value, 2))
                          }
                          onBlur={() =>
                            setCbHour(
                              clampOnBlur(cbHour, 1, 12, { padTo: 2 })
                            )
                          }
                          className={numInputClass}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                          Minute
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={59}
                          placeholder="MM"
                          value={cbMinute}
                          onChange={(e) =>
                            setCbMinute(digitsOnly(e.target.value, 2))
                          }
                          onBlur={() =>
                            setCbMinute(
                              clampOnBlur(cbMinute, 0, 59, { padTo: 2 })
                            )
                          }
                          className={numInputClass}
                        />
                      </label>
                      <div className="space-y-1">
                        <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                          Period
                        </span>
                        <div className="flex h-[42px] overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-950 p-0.5">
                          {['AM', 'PM'].map((p) => {
                            const active = cbPeriod === p;
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setCbPeriod(p)}
                                className={`flex-1 rounded-md text-xs font-semibold transition ${
                                  active
                                    ? 'bg-orange-600 text-white shadow-sm'
                                    : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {p}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    {previewLabel ? (
                      <p className="pt-1 text-xs text-zinc-500">
                        Scheduled for{' '}
                        <span className="font-medium text-zinc-300">
                          {previewLabel}
                        </span>
                      </p>
                    ) : null}
                  </div>

                  <label className={`${labelClass} sm:col-span-2`}>
                    <span>Callback Notes</span>
                    <textarea
                      rows={2}
                      value={cbNotes}
                      onChange={(e) => setCbNotes(e.target.value)}
                      placeholder="Follow-up reason (defaults from lead notes)"
                      className={`${fieldClass} resize-y`}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4">
            {canSendToPool && pipelineStatus !== 'pending_closer_claim' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => submit(true)}
                className="rounded-xl border border-orange-500/40 bg-orange-600/20 px-4 py-2 text-sm font-semibold text-orange-200 hover:bg-orange-600/35 disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Send to Closer Pool'}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 hover:bg-orange-500 disabled:opacity-60"
            >
              {busy ? 'Saving…' : leadId ? 'Save Lead' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
