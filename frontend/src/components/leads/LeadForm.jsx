import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useAuth from '../../hooks/useAuth.hook.js';
import {
  createCallback,
  moveCloserCallbackToLead,
} from '../../services/callback.service.js';
import {
  createLead,
  getUsers,
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
  personalPhone: '',
  businessPhone: '',
  businessEmail: '',
  personalEmail: '',
  websiteLink: '',
  gmbLink: '',
  serviceAreas: '',
  servicesOffered: '',
  paymentOffered: '',
  paymentReceived: '',
  paymentPending: '',
  notes: '',
  closerId: '',
  sourceCallbackId: null,
};

const paymentFieldToString = (value, fallback = '') => {
  if (value != null && value !== '') return String(value);
  return fallback;
};

const computePendingDisplay = (offeredRaw, receivedRaw) => {
  const offered = Number(String(offeredRaw ?? '').trim());
  const received = Number(receivedRaw) || 0;
  if (Number.isNaN(offered)) return '';
  return String(Math.max(0, offered - received));
};

const mapInitialToForm = (initialValues) => {
  if (!initialValues) return emptyForm;
  // Promote-from-callback uses closerId already resolved; edits use lead.closerId
  const closerRef = initialValues.closerId ?? initialValues.assignedCloserId;
  const paymentOffered = paymentFieldToString(
    initialValues.paymentOffered != null && initialValues.paymentOffered !== ''
      ? initialValues.paymentOffered
      : initialValues.salesAmount
  );
  // Empty when nothing received yet so placeholder="0" stays visible
  const receivedRaw = initialValues.paymentReceived;
  const receivedNum = Number(receivedRaw);
  const paymentReceived =
    receivedRaw != null &&
    receivedRaw !== '' &&
    !Number.isNaN(receivedNum) &&
    receivedNum > 0
      ? String(receivedRaw)
      : '';
  return {
    clientName: initialValues.clientName || '',
    businessName: initialValues.businessName || '',
    personalPhone: initialValues.personalPhone || '',
    businessPhone: initialValues.businessPhone || '',
    businessEmail: initialValues.businessEmail || '',
    personalEmail: initialValues.personalEmail || '',
    websiteLink:
      initialValues.websiteLink || initialValues.businessLink || '',
    gmbLink: initialValues.gmbLink || '',
    serviceAreas: initialValues.serviceAreas || '',
    servicesOffered: initialValues.servicesOffered || '',
    paymentOffered,
    paymentReceived,
    paymentPending: computePendingDisplay(paymentOffered, paymentReceived),
    notes: initialValues.notes || '',
    closerId: closerRef?._id
      ? String(closerRef._id)
      : closerRef
        ? String(closerRef)
        : '',
    sourceCallbackId: initialValues.sourceCallbackId || null,
  };
};

const STATUS_LABEL = {
  with_agent: 'In Progress',
  with_closer: 'With Closer',
  pending_closer_claim: 'With Closer',
  in_progress: 'With Closer',
};

const normalizeUrl = (raw) => {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
};

/**
 * Comprehensive lead intake.
 * mode:
 *  - 'agent' (default) — sales-agent create/edit + optional callback scheduler
 *  - 'closerPromote' — closer Direct Contact → Lead (no Assign Closer / scheduler)
 */
export default function LeadForm({
  initialValues = null,
  leadId: leadIdProp = null,
  onSaved,
  onCancel,
  title = 'Lead',
  mode = 'agent',
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isCloserPromote = mode === 'closerPromote';
  const leadId = leadIdProp || initialValues?._id || null;
  const pipelineStatus = initialValues?.status || 'with_agent';
  const agentDisplayName = isCloserPromote
    ? 'Closer-sourced'
    : user?.fullName?.trim() ||
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

  const { data: closers = [], isLoading: closersLoading } = useQuery({
    queryKey: ['users', 'closer', 'approved'],
    queryFn: () => getUsers({ role: 'closer', status: 'approved' }),
    enabled: !isCloserPromote,
  });

  // Closer promote: lock closerId to the logged-in closer
  useEffect(() => {
    if (!isCloserPromote || !user?._id) return;
    setForm((prev) =>
      String(prev.closerId) === String(user._id)
        ? prev
        : { ...prev, closerId: String(user._id) }
    );
  }, [isCloserPromote, user?._id]);

  const patchMyLeadsCache = (lead) => {
    queryClient.setQueryData(['myLeads'], (old) => {
      const list = Array.isArray(old) ? old : [];
      if (!lead?._id) return list;
      if (lead.status && lead.status !== 'with_agent') {
        return list.filter((l) => String(l._id) !== String(lead._id));
      }
      const idx = list.findIndex((l) => String(l._id) === String(lead._id));
      const patched = {
        ...lead,
        // Explicitly clear nested follow-up when backend unsets it
        followUp: lead.followUp ?? null,
      };
      if (idx >= 0) {
        const next = [...list];
        next[idx] = { ...list[idx], ...patched, followUp: patched.followUp };
        return next;
      }
      return [patched, ...list];
    });
  };

  const invalidate = (lead) => {
    queryClient.invalidateQueries({ queryKey: ['myLeads'] });
    queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
    queryClient.invalidateQueries({ queryKey: ['allLeads'] });
    queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
    queryClient.invalidateQueries({ queryKey: ['closerCallbacks'] });
    if (lead?._id) {
      queryClient.invalidateQueries({ queryKey: ['lead', lead._id] });
    }
  };

  const saveMutation = useMutation({
    mutationFn: async ({ payload, callback, clearCallback }) => {
      if (isCloserPromote) {
        const sourceId = payload.sourceCallbackId || form.sourceCallbackId;
        if (!sourceId) {
          throw new Error('Missing source callback for Move to Leads.');
        }
        const { lead } = await moveCloserCallbackToLead(sourceId, payload);
        return lead;
      }

      let lead;
      if (leadId) {
        lead = await updateLead(leadId, payload);
      } else {
        lead = await createLead(payload);
      }

      // Linked callback stays on the agent agenda until the 24h window expires
      if (callback?.callbackAt && lead?._id && !clearCallback) {
        await createCallback({
          leadId: lead._id,
          businessName: payload.businessName,
          personalPhone: payload.personalPhone,
          businessPhone: payload.businessPhone,
          businessLink: payload.websiteLink,
          callbackAt: callback.callbackAt,
          notes: callback.notes || payload.notes || undefined,
          assignedCloserId:
            payload.closerId ||
            lead.closerId?._id ||
            lead.closerId ||
            undefined,
        });
      }

      // Normalize cleared follow-up on the returned lead for optimistic UI
      if (clearCallback && lead) {
        lead = { ...lead, followUp: undefined };
      }

      return lead;
    },
    onSuccess: (lead, variables) => {
      setError('');
      const cleared = Boolean(variables.clearCallback);
      const scheduled = Boolean(variables.callback?.callbackAt) && !cleared;
      const base = isCloserPromote
        ? 'Lead created from callback.'
        : leadId
          ? 'Lead saved.'
          : 'Lead created.';
      const toastMessage = cleared
        ? `${base} Callback cleared.`
        : scheduled
          ? `${base} Callback scheduled.`
          : base;
      setToast(toastMessage);
      patchMyLeadsCache(lead);
      invalidate(lead);
      onSaved?.(lead, {
        scheduledCallback: scheduled,
        clearedCallback: cleared,
        toastMessage,
      });
    },
    onError: (err) => {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Failed to save lead.'
      );
    },
  });

  const handleChange = (field) => (e) => {
    const nextValue = e.target.value;
    setForm((prev) => {
      const next = { ...prev, [field]: nextValue };
      if (field === 'paymentOffered' || field === 'paymentReceived') {
        next.paymentPending = computePendingDisplay(
          field === 'paymentOffered' ? nextValue : next.paymentOffered,
          field === 'paymentReceived' ? nextValue : next.paymentReceived
        );
      }
      return next;
    });
  };

  const buildPayload = () => {
    const offeredRaw = form.paymentOffered.trim();
    if (offeredRaw === '') {
      throw new Error('Please enter the payment offered.');
    }
    const paymentOffered = Number(offeredRaw);
    if (Number.isNaN(paymentOffered) || paymentOffered < 0) {
      throw new Error('Payment offered must be a valid non-negative number.');
    }

    const paymentReceived = Number(form.paymentReceived) || 0;
    if (Number.isNaN(paymentReceived) || paymentReceived < 0) {
      throw new Error('Payment received must be a valid non-negative number.');
    }

    const resolvedCloserId = isCloserPromote
      ? String(user?._id || form.closerId || '')
      : form.closerId;
    if (!resolvedCloserId) {
      throw new Error(
        isCloserPromote
          ? 'Unable to assign the current closer.'
          : 'Assign Closer is required.'
      );
    }

    const personalPhone = form.personalPhone.trim() || null;
    const businessPhone = form.businessPhone.trim() || null;
    const websiteLink = normalizeUrl(form.websiteLink);
    const servicesOffered = form.servicesOffered.trim();
    if (!websiteLink) {
      throw new Error('Website Link is required.');
    }
    if (!servicesOffered) {
      throw new Error('Services Offered is required.');
    }

    const payload = {
      clientName: form.clientName.trim() || null,
      businessName: form.businessName.trim(),
      personalPhone,
      businessPhone,
      businessEmail: form.businessEmail.trim() || null,
      personalEmail: form.personalEmail.trim() || null,
      websiteLink,
      gmbLink: normalizeUrl(form.gmbLink),
      serviceAreas: form.serviceAreas.trim() || null,
      servicesOffered,
      paymentOffered,
      paymentReceived,
      notes: form.notes.trim() || null,
      closerId: resolvedCloserId,
    };

    if (form.sourceCallbackId) {
      payload.sourceCallbackId = form.sourceCallbackId;
    }

    return payload;
  };

  const submit = () => {
    setError('');

    if (!form.businessName.trim()) {
      setError('Business Name is required.');
      return;
    }

    if (!form.websiteLink.trim()) {
      setError('Website Link is required.');
      return;
    }

    if (!form.servicesOffered.trim()) {
      setError('Services Offered is required.');
      return;
    }

    if (!form.paymentOffered.trim()) {
      setError('Payment Offered is required.');
      return;
    }

    if (!isCloserPromote && !form.closerId) {
      setError('Assign Closer is required.');
      return;
    }

    if (isCloserPromote && !user?._id && !form.closerId) {
      setError('Unable to assign the current closer.');
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
    let clearCallback = false;

    if (!isCloserPromote && scheduleCallback) {
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
        // Empty notes fall back to main Lead Notes on save
        notes: cbNotes.trim() || form.notes.trim() || undefined,
      };
    } else if (!isCloserPromote && leadId) {
      // Unchecked — clear lead follow-up + cancel linked pending/attended callbacks
      clearCallback = true;
      payload.followUp = null;
    }

    saveMutation.mutate({
      payload,
      callback,
      clearCallback,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit();
  };

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
                {isCloserPromote
                  ? 'Move Direct Contact into your Leads tab'
                  : 'Full intake · optional follow-up callback'}
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
              <span>
                Business Name <span className="text-[#F25E26]">*</span>
              </span>
              <input
                required
                value={form.businessName}
                onChange={handleChange('businessName')}
                className={fieldClass}
                autoComplete="organization"
              />
            </label>

            <label className={labelClass}>
              <span>Personal Phone No</span>
              <input
                value={form.personalPhone}
                onChange={handleChange('personalPhone')}
                className={fieldClass}
                autoComplete="tel"
                placeholder="+92 …"
              />
            </label>

            <label className={labelClass}>
              <span>Business Phone No</span>
              <input
                value={form.businessPhone}
                onChange={handleChange('businessPhone')}
                className={fieldClass}
                autoComplete="tel"
                placeholder="+92 …"
              />
            </label>

            <label className={labelClass}>
              <span>
                Website Link <span className="text-[#F25E26]">*</span>
              </span>
              <input
                required
                type="url"
                placeholder="https://"
                value={form.websiteLink}
                onChange={handleChange('websiteLink')}
                className={fieldClass}
                aria-required="true"
              />
            </label>

            <label className={labelClass}>
              <span>Business Email</span>
              <input
                type="email"
                value={form.businessEmail}
                onChange={handleChange('businessEmail')}
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
              <span>Service Areas</span>
              <input
                value={form.serviceAreas}
                onChange={handleChange('serviceAreas')}
                className={fieldClass}
                placeholder="City, State, or Region"
              />
            </label>

            <label className={labelClass}>
              <span>
                Services Offered <span className="text-[#F25E26]">*</span>
              </span>
              <input
                required
                value={form.servicesOffered}
                onChange={handleChange('servicesOffered')}
                className={fieldClass}
                placeholder="Website, SEO, Yelp"
                aria-required="true"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
              <label className={labelClass}>
                <span>
                  Payment Offered <span className="text-[#F25E26]">*</span>
                </span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                    $
                  </span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.paymentOffered}
                    onChange={handleChange('paymentOffered')}
                    className={`${fieldClass} pl-7`}
                    placeholder="0.00"
                    aria-required="true"
                  />
                </div>
              </label>
              <label className={labelClass}>
                <span>Payment Received</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.paymentReceived}
                    onChange={handleChange('paymentReceived')}
                    className={`${fieldClass} pl-7`}
                    placeholder="0"
                  />
                </div>
              </label>
              <label className={labelClass}>
                <span>Payment Pending</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                    $
                  </span>
                  <input
                    readOnly
                    type="number"
                    value={form.paymentPending}
                    className={`${fieldClass} pl-7`}
                    tabIndex={-1}
                    aria-readonly="true"
                  />
                </div>
              </label>
            </div>

            <label className={labelClass}>
              <span>{isCloserPromote ? 'Source' : 'Agent Name'}</span>
              <input
                readOnly
                value={agentDisplayName}
                className={fieldClass}
                tabIndex={-1}
                aria-readonly="true"
              />
            </label>

            {isCloserPromote ? (
              <label className={labelClass}>
                <span>Assigned Closer</span>
                <input
                  readOnly
                  value={
                    user?.fullName?.trim() ||
                    user?.username ||
                    'Current closer'
                  }
                  className={fieldClass}
                  tabIndex={-1}
                  aria-readonly="true"
                />
              </label>
            ) : (
              <label className={labelClass}>
                <span>
                  Assign Closer <span className="text-[#F25E26]">*</span>
                </span>
                <select
                  required
                  value={form.closerId}
                  onChange={handleChange('closerId')}
                  disabled={
                    busy || closersLoading || pipelineStatus !== 'with_agent'
                  }
                  className="bg-zinc-900 border border-zinc-700 text-white rounded-lg p-2.5 w-full focus:ring-orange-500 focus:outline-none focus:ring-2 appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <option value="">
                    {closersLoading ? 'Loading closers…' : 'Select a closer'}
                  </option>
                  {closers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.fullName || c.username}
                      {c.fullName && c.username ? ` (@${c.username})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

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

          {/* Optional callback scheduler — agent intake only */}
          {!isCloserPromote ? (
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
                  className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-[#F25E26] focus:ring-[#F25E26]/40"
                />
                <span>
                  <span className="block text-sm font-semibold text-zinc-100">
                    Schedule a Callback
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    Syncs to My Callbacks, My Leads Follow-up, and the assigned
                    Closer&apos;s agenda
                  </span>
                </span>
              </label>

              {scheduleCallback ? (
                <div className="space-y-4 border-t border-zinc-800 px-4 py-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className={labelClass}>
                      <span>
                        Callback Date{' '}
                        <span className="text-[#F25E26]">*</span>
                      </span>
                      <input
                        required={scheduleCallback}
                        type="date"
                        value={cbDate}
                        onChange={(e) => setCbDate(e.target.value)}
                        className={fieldClass}
                        aria-required="true"
                      />
                    </label>

                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-zinc-300">
                        Callback Time (PKT){' '}
                        <span className="text-[#F25E26]">*</span>
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
                            required={scheduleCallback}
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
                            required={scheduleCallback}
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
                                      ? 'bg-[#F25E26] text-white shadow-sm'
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
                          </span>{' '}
                          (PKT)
                        </p>
                      ) : null}
                    </div>

                    <label className={`${labelClass} sm:col-span-2`}>
                      <span>Callback Notes</span>
                      <textarea
                        rows={2}
                        value={cbNotes}
                        onChange={(e) => setCbNotes(e.target.value)}
                        placeholder="Optional — defaults to the Lead Notes above"
                        className={`${fieldClass} resize-y`}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-flash-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-flash-primary/25 transition hover:brightness-110 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save Lead'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
