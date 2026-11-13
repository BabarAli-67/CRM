import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CstManagerShell from '../../components/cst-manager/CstManagerShell.jsx';
import {
  saveClientPortfolio,
  setRetention,
  setWelcomeEmail,
} from '../../services/handover.service.js';
import { getLeadById } from '../../services/lead.service.js';
import {
  isEmailJsConfigured,
  sendOnboardingWelcomeEmail,
} from '../../utils/emailjs.util.js';
import LivePortfolioSection, {
  mapChangeRequestsFromLead,
  mapKeywordsFromLead,
} from '../../components/portfolio/LivePortfolioSection.jsx';
import ClientContextRecord, {
  mapProfileFromLead,
} from '../../components/cst-manager/ClientContextRecord.jsx';
import { clearQueuedReminders } from '../../components/alerts/ReminderPopup.jsx';
import { clearReminderFireKeys } from '../../hooks/useReminderScheduler.js';
import {
  formatMoneyAmount,
  formatPaymentSummary,
} from '../../utils/formatPayment.util.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pad = (n) => String(n).padStart(2, '0');

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

/** Today's calendar date in Asia/Karachi (PKT, UTC+5). */
const todayDateValue = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/**
 * Split a stored ISO instant into PKT wall-clock date/time fields
 * (avoids browser-local TZ drift when editing).
 */
const splitDateTime = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) {
    return { date: '', hour: '', minute: '', period: 'AM' };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const hourRaw = Number(get('hour'));
  const period = (get('dayPeriod') || 'AM').toUpperCase().includes('PM')
    ? 'PM'
    : 'AM';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: pad(hourRaw || 12),
    minute: pad(Number(get('minute') || 0)),
    period,
  };
};

/**
 * Interpret date + 12h clock as Asia/Karachi (PKT) wall time → UTC ISO.
 * Prevents UTC/+5 mismatches when saving retention triggers.
 */
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
  const isoWithOffset = `${date}T${pad(h)}:${pad(mi)}:00+05:00`;
  const instant = new Date(isoWithOffset);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toISOString();
};

const fieldClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-2.5 text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

const numInputClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950/60 py-2.5 text-center text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

/** Compact PKT clock, e.g. "11:05 PM". */
const formatPktTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-PK', {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatPktFull = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const defaultRecipient = (lead) => {
  const saved = lead?.handover?.welcomeEmail?.toEmail?.trim();
  if (saved) return saved;
  return (
    lead?.workEmail?.trim() ||
    lead?.personalEmail?.trim() ||
    ''
  );
};

const SERVICE_OPTIONS = [
  { id: 'seo', label: 'SEO' },
  { id: 'web', label: 'Web' },
  { id: 'social_media', label: 'Social Media' },
  { id: 'other', label: 'Other' },
];

const DETAIL_TABS = [
  { id: 'onboarding', label: 'Onboarding & Alerts' },
  { id: 'context', label: 'Client Context (All Tiers)' },
  { id: 'upsell', label: 'Upselling & Ledger' },
  { id: 'portfolio', label: 'Portfolio & Reports' },
];

const cardClass =
  'rounded-2xl border border-zinc-800/80 bg-[#111111] p-4 shadow-xl sm:p-5';

const newUpsellEntry = () => ({
  entryId:
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `upsell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: '',
  totalAmount: '',
  paidAmount: '',
});

const parseMoney = (value) => {
  if (value === '' || value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const formatMoney = formatMoneyAmount;

const pendingFor = (row) =>
  Math.max(0, parseMoney(row.totalAmount) - parseMoney(row.paidAmount));

const mapUpsellFromLead = (lead) => {
  const rows = Array.isArray(lead?.handover?.upsellLedger)
    ? lead.handover.upsellLedger
    : [];
  return rows.map((row, index) => ({
    entryId: row.entryId || `upsell-${index + 1}`,
    title: row.title || '',
    totalAmount:
      row.totalAmount === 0 || row.totalAmount
        ? String(row.totalAmount)
        : '',
    paidAmount:
      row.paidAmount === 0 || row.paidAmount ? String(row.paidAmount) : '',
  }));
};

/**
 * Client Portfolio / Detail —
 * A–D existing sections · E: Upselling & Split Payment Ledger.
 */
export default function ClientDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const [choice, setChoice] = useState('no'); // activation: 'yes' | 'no'

  const [welcomeChoice, setWelcomeChoice] = useState('no'); // 'yes' | 'no'
  const [recipientEmail, setRecipientEmail] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [welcomeError, setWelcomeError] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const [retDate, setRetDate] = useState('');
  const [retHour, setRetHour] = useState('');
  const [retMinute, setRetMinute] = useState('');
  const [retPeriod, setRetPeriod] = useState('AM');
  const [retMessage, setRetMessage] = useState('');
  const [retError, setRetError] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [serviceSelected, setServiceSelected] = useState([]);
  const [otherNote, setOtherNote] = useState('');

  const [upsellRows, setUpsellRows] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [profile, setProfile] = useState(() => mapProfileFromLead(null));
  const [detailTab, setDetailTab] = useState('onboarding');

  const [portfolioMessage, setPortfolioMessage] = useState('');
  const [portfolioError, setPortfolioError] = useState('');

  const patchProfile = (patch) => {
    setPortfolioMessage('');
    setPortfolioError('');
    setProfile((prev) => ({ ...prev, ...patch }));
  };

  const {
    data: lead,
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ['lead', id, 'portfolio'],
    queryFn: () => getLeadById(id),
    enabled: Boolean(id),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!lead) return;
    const done = Boolean(lead.handover?.activationCall?.done);
    setChoice(done ? 'yes' : 'no');

    const sent = Boolean(lead.handover?.welcomeEmail?.sent);
    setWelcomeChoice(sent ? 'yes' : 'no');
    setRecipientEmail(defaultRecipient(lead));
    setWelcomeMessage('');
    setWelcomeError('');

    const parts = splitDateTime(lead.handover?.retention?.at);
    if (parts.date) {
      setRetDate(parts.date);
      setRetHour(parts.hour);
      setRetMinute(parts.minute);
      setRetPeriod(parts.period);
    } else {
      setRetDate(todayDateValue());
      setRetHour('');
      setRetMinute('');
      setRetPeriod('AM');
    }
    setRetMessage('');
    setRetError('');

    const savedServices = Array.isArray(lead.handover?.serviceScope?.selected)
      ? lead.handover.serviceScope.selected
      : [];
    setServiceSelected(savedServices);
    setOtherNote(lead.handover?.serviceScope?.otherNote || '');
    setUpsellRows(mapUpsellFromLead(lead));
    setKeywords(mapKeywordsFromLead(lead));
    setChangeRequests(mapChangeRequestsFromLead(lead));
    setProfile(mapProfileFromLead(lead, splitDateTime));
    setPortfolioMessage('');
    setPortfolioError('');
  }, [lead]);

  // Tick every second so Scheduled → Overdue flips immediately at due time
  useEffect(() => {
    const tickId = window.setInterval(() => setNowTick(Date.now()), 1_000);
    return () => window.clearInterval(tickId);
  }, []);

  const syncLeadCaches = (updated) => {
    if (!updated?._id) return;
    queryClient.setQueryData(['lead', id, 'portfolio'], updated);
    queryClient.setQueryData(['lead', id], updated);
    queryClient.setQueryData(['handoverQueue'], (old) => {
      if (!Array.isArray(old)) return old;
      return old.map((row) =>
        String(row._id) === String(updated._id)
          ? {
              ...row,
              handover: {
                ...(row.handover || {}),
                ...(updated.handover || {}),
              },
            }
          : row
      );
    });

    // Keep CST retention watcher armed immediately (no waiting on refetch)
    const retention = updated?.handover?.retention;
    const prevAt = lead?.handover?.retention?.at;
    const nextAt = retention?.at;
    const prevMs = prevAt ? new Date(prevAt).getTime() : null;
    const nextMs = nextAt ? new Date(nextAt).getTime() : null;
    const retentionRescheduled = prevMs !== nextMs;

    if (retentionRescheduled) {
      // Drop old popup + session fire guard so the new PKT time can ring
      clearQueuedReminders({ kind: 'retention', id: updated._id });
      clearReminderFireKeys({ kind: 'retention', id: updated._id });
    }

    queryClient.setQueryData(['retentionReminders'], (old) => {
      const list = Array.isArray(old) ? old : [];
      const active =
        retention?.status === 'scheduled' &&
        retention?.at &&
        !Boolean(retention?.alerts?.exactTimeFired);
      const without = list.filter(
        (row) => String(row._id) !== String(updated._id)
      );
      if (!active) return without;
      const nextRow = {
        _id: updated._id,
        clientName: updated.clientName,
        businessName: updated.businessName,
        phone: updated.phone,
        handover: { retention },
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
      return [...without, nextRow];
    });

    queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
    queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
    queryClient.invalidateQueries({ queryKey: ['retentionReminders'] });
  };

  const applyPortfolioState = (updated) => {
    if (!updated) return;
    const done = Boolean(updated?.handover?.activationCall?.done);
    setChoice(done ? 'yes' : 'no');

    const parts = splitDateTime(updated?.handover?.retention?.at);
    if (parts.date) {
      setRetDate(parts.date);
      setRetHour(parts.hour);
      setRetMinute(parts.minute);
      setRetPeriod(parts.period);
    }

    const saved = Array.isArray(updated?.handover?.serviceScope?.selected)
      ? updated.handover.serviceScope.selected
      : [];
    setServiceSelected(saved);
    setOtherNote(updated?.handover?.serviceScope?.otherNote || '');
    setUpsellRows(mapUpsellFromLead(updated));
    setKeywords(mapKeywordsFromLead(updated));
    setChangeRequests(mapChangeRequestsFromLead(updated));
    setProfile(mapProfileFromLead(updated, splitDateTime));
  };

  /**
   * Build the unified portfolio payload for the top Save button.
   */
  const buildPortfolioPayload = () => {
    if (!String(profile.businessName || '').trim()) {
      throw new Error('Business Name is required.');
    }
    if (!String(profile.phone || '').trim()) {
      throw new Error('Phone Number is required.');
    }

    const hasClosedPartial =
      Boolean(profile.closedDate) ||
      profile.closedHour !== '' ||
      profile.closedMinute !== '';
    let closedAt = null;
    if (
      profile.closedDate &&
      profile.closedHour !== '' &&
      profile.closedMinute !== ''
    ) {
      closedAt = toIsoTimestamp({
        date: profile.closedDate,
        hour: profile.closedHour,
        minute: profile.closedMinute,
        period: profile.closedPeriod || 'AM',
      });
      if (!closedAt) {
        throw new Error(
          'Enter a valid Closed Date/Time (hour, minute, AM/PM).'
        );
      }
    } else if (hasClosedPartial) {
      throw new Error(
        'Closed Date/Time needs date, hour, and minute — or clear all three.'
      );
    }

    const payload = {
      activationCall: { done: choice === 'yes' },
      serviceScope: {
        selected: serviceSelected,
        otherNote: serviceSelected.includes('other') ? otherNote : null,
      },
      upsellLedger: upsellRows.map((row) => ({
        entryId: row.entryId,
        title: row.title,
        totalAmount: parseMoney(row.totalAmount),
        paidAmount: parseMoney(row.paidAmount),
      })),
      // Keywords are Tech-managed (CST view-only) — never overwrite from CST Save
      changeRequests,
      profileContext: {
        businessName: profile.businessName,
        clientName: profile.clientName,
        phone: profile.phone,
        workEmail: profile.workEmail,
        personalEmail: profile.personalEmail,
        websiteLink: profile.websiteLink,
        yelpLink: profile.yelpLink,
        gmbLink: profile.gmbLink,
        niche: profile.niche,
        locationAddress: profile.locationAddress,
        servicesArea: profile.servicesArea,
        serviceOffered: profile.serviceOffered,
        leadSource: profile.leadSource,
        notes: profile.notes,
        salesAmount:
          profile.salesAmount === '' || profile.salesAmount == null
            ? null
            : profile.salesAmount,
        closedAt,
        payment: {
          method: profile.paymentMethod || null,
          cardLast4: profile.cardLast4,
          cardBrand: profile.cardBrand,
          linkUrl: profile.linkUrl,
          otherDetails: profile.otherDetails,
        },
        documentSigned: profile.documentSigned || 'unknown',
        upscaleNotes: profile.upscaleNotes,
        onboardingNotes: profile.onboardingNotes,
      },
    };

    const hasRetTime =
      Boolean(retDate) &&
      retHour !== '' &&
      retMinute !== '' &&
      Boolean(retPeriod);
    if (hasRetTime) {
      const iso = toIsoTimestamp({
        date: retDate,
        hour: retHour,
        minute: retMinute,
        period: retPeriod,
      });
      if (!iso) {
        throw new Error(
          'Enter a valid retention date and time (hour, minute, AM/PM).'
        );
      }
      payload.retention = { at: iso };
    }

    return payload;
  };

  const portfolioMutation = useMutation({
    mutationFn: (payload) => saveClientPortfolio(id, payload),
    onSuccess: (updated) => {
      setPortfolioError('');
      setPortfolioMessage('Client details saved!');
      setRetError('');
      applyPortfolioState(updated);
      syncLeadCaches(updated);
    },
    onError: (err) => {
      setPortfolioMessage('');
      setPortfolioError(
        err?.response?.data?.message || 'Failed to save client details.'
      );
    },
  });

  const handleUnifiedSave = () => {
    setPortfolioMessage('');
    setPortfolioError('');
    setRetError('');
    try {
      const payload = buildPortfolioPayload();
      portfolioMutation.mutate(payload);
    } catch (err) {
      setPortfolioError(err?.message || 'Failed to save client details.');
    }
  };

  const handleSendWelcomeEmail = async () => {
    setWelcomeMessage('');
    setWelcomeError('');

    const email = recipientEmail.trim();
    if (!EMAIL_RE.test(email)) {
      setWelcomeError('Enter a valid recipient email address.');
      return;
    }

    if (!isEmailJsConfigured()) {
      setWelcomeError(
        'EmailJS is not configured. Add VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, and VITE_EMAILJS_PUBLIC_KEY to frontend/.env'
      );
      return;
    }

    setSendingEmail(true);
    try {
      await sendOnboardingWelcomeEmail({
        to_email: email,
        client_name: lead?.clientName?.trim() || '',
        business_name: lead?.businessName?.trim() || '',
        phone: lead?.phone?.trim() || '',
        work_email: lead?.workEmail?.trim() || '',
        personal_email: lead?.personalEmail?.trim() || '',
      });

      const updated = await setWelcomeEmail(id, {
        sent: true,
        toEmail: email,
      });

      setWelcomeChoice('yes');
      setWelcomeMessage('Onboarding welcome email sent!');
      syncLeadCaches(updated);
    } catch (err) {
      const apiMsg = err?.response?.data?.message;
      const emailJsMsg =
        typeof err?.text === 'string'
          ? err.text
          : typeof err?.message === 'string'
            ? err.message
            : null;
      setWelcomeError(
        apiMsg ||
          emailJsMsg ||
          'Failed to send onboarding welcome email. Please try again.'
      );
    } finally {
      setSendingEmail(false);
    }
  };

  const clearRetentionMutation = useMutation({
    mutationFn: () => setRetention(id, null),
    onSuccess: (updated) => {
      setRetError('');
      setRetMessage('Retention schedule cleared.');
      setRetDate(todayDateValue());
      setRetHour('');
      setRetMinute('');
      setRetPeriod('AM');
      clearQueuedReminders({ kind: 'retention', id });
      clearReminderFireKeys({ kind: 'retention', id });
      syncLeadCaches(updated);
    },
    onError: (err) => {
      setRetMessage('');
      setRetError(
        err?.response?.data?.message || 'Failed to clear retention schedule.'
      );
    },
  });

  const handleClearRetention = () => {
    setRetMessage('');
    setRetError('');
    setPortfolioMessage('');
    clearRetentionMutation.mutate();
  };

  const toggleService = (serviceId) => {
    setPortfolioMessage('');
    setPortfolioError('');
    setServiceSelected((prev) => {
      if (prev.includes(serviceId)) {
        return prev.filter((sid) => sid !== serviceId);
      }
      return [...prev, serviceId];
    });
  };

  const updateUpsellRow = (entryId, patch) => {
    setPortfolioMessage('');
    setPortfolioError('');
    setUpsellRows((prev) =>
      prev.map((row) =>
        row.entryId === entryId ? { ...row, ...patch } : row
      )
    );
  };

  const addUpsellRow = () => {
    setPortfolioMessage('');
    setPortfolioError('');
    setUpsellRows((prev) => [...prev, newUpsellEntry()]);
  };

  const removeUpsellRow = (entryId) => {
    setPortfolioMessage('');
    setPortfolioError('');
    setUpsellRows((prev) => prev.filter((row) => row.entryId !== entryId));
  };

  const savingPortfolio =
    portfolioMutation.isPending || clearRetentionMutation.isPending;

  const upsellTotals = (() => {
    let total = 0;
    let paid = 0;
    let pending = 0;
    for (const row of upsellRows) {
      total += parseMoney(row.totalAmount);
      paid += parseMoney(row.paidAmount);
      pending += pendingFor(row);
    }
    return { total, paid, pending };
  })();

  const baseSalesAmount = Math.max(0, Number(profile.salesAmount) || 0);
  const totalCollectedLive = baseSalesAmount + upsellTotals.paid;
  const totalContractLive = baseSalesAmount + upsellTotals.total;

  const savedDone = Boolean(lead?.handover?.activationCall?.done);
  const savedAt = lead?.handover?.activationCall?.at;
  const welcomeSent = Boolean(lead?.handover?.welcomeEmail?.sent);
  const welcomeAt = lead?.handover?.welcomeEmail?.at;
  const welcomeTo = lead?.handover?.welcomeEmail?.toEmail;
  const retentionAt = lead?.handover?.retention?.at;
  const retentionStatus = lead?.handover?.retention?.status;
  const retentionScheduled =
    Boolean(retentionAt) && retentionStatus === 'scheduled';
  const retentionDone = Boolean(retentionAt) && retentionStatus === 'done';
  const retentionOverdue =
    retentionScheduled &&
    new Date(retentionAt).getTime() <= nowTick;

  return (
    <CstManagerShell title="Client Detail">
      <section className="mx-auto w-full max-w-7xl space-y-4">
        <div>
          <Link
            to="/dashboard/cst-manager/handover?tab=onboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#F25E26] transition hover:text-orange-300"
          >
            ← Back to Handover Queue
          </Link>
        </div>

        {portfolioMessage ? (
          <p
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
            role="status"
          >
            {portfolioMessage}
          </p>
        ) : null}
        {portfolioError ? (
          <p
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            role="alert"
          >
            {portfolioError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {loadError?.response?.data?.message || 'Failed to load client.'}
          </p>
        ) : !lead ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            Client not found.
          </p>
        ) : (
          <>
            {/* Pinned portfolio header + tab bar (tab body scrolls below) */}
            <div className="shrink-0 space-y-3">
              <div className={`${cardClass} !py-4`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Client portfolio
                    </p>
                    <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-white">
                      {profile.businessName?.trim() ||
                        lead.businessName ||
                        '—'}
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
                      <span>
                        {profile.clientName?.trim() ||
                          lead.clientName?.trim() ||
                          'No client name'}
                      </span>
                      {profile.phone || lead.phone ? (
                        <span className="text-zinc-500">
                          {profile.phone || lead.phone}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                      <p className="text-zinc-400">
                        Collected:{' '}
                        <span className="font-semibold text-emerald-300">
                          {formatMoney(totalCollectedLive)}
                        </span>
                      </p>
                      <p className="text-zinc-400">
                        Base sale:{' '}
                        <span className="font-medium text-zinc-200">
                          {formatMoney(baseSalesAmount)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingPortfolio}
                    onClick={handleUnifiedSave}
                    className="shrink-0 rounded-xl bg-[#F25E26] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 transition hover:bg-[#ff6a36] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {portfolioMutation.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              <div
                role="tablist"
                aria-label="Client detail sections"
                className="flex flex-wrap gap-1 rounded-xl border border-zinc-800/80 bg-[#111111] p-1"
              >
                {DETAIL_TABS.map((tab) => {
                  const active = detailTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`client-detail-tab-${tab.id}`}
                      aria-selected={active}
                      aria-controls={`client-detail-panel-${tab.id}`}
                      onClick={() => setDetailTab(tab.id)}
                      className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                        active
                          ? 'bg-[#F25E26]/15 text-[#F25E26] ring-1 ring-[#F25E26]/40'
                          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dedicated scrollable tab panel — desktop only; mobile uses page scroll */}
            <div
              key={detailTab}
              role="tabpanel"
              id={`client-detail-panel-${detailTab}`}
              aria-labelledby={`client-detail-tab-${detailTab}`}
              className="mt-1 space-y-4 md:max-h-[calc(100vh-340px)] md:overflow-y-auto md:overscroll-contain md:pr-2 scrollbar-portfolio"
            >
            {/* Tab: Onboarding & Alerts */}
            {detailTab === 'onboarding' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {/* Activation Call */}
                  <div className={cardClass}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-display text-base font-semibold text-white">
                          Activation Call
                        </h2>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Syncs to Handover Queue badge.
                        </p>
                      </div>
                      {savedDone ? (
                        <span className="inline-flex shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/35">
                          {formatPktTime(savedAt)
                            ? `Yes · ${formatPktTime(savedAt)}`
                            : 'Yes'}
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 rounded-full bg-zinc-500/15 px-2 py-0.5 text-[11px] font-semibold text-zinc-400 ring-1 ring-zinc-600/40">
                          No
                        </span>
                      )}
                    </div>
                    <fieldset className="mt-3">
                      <legend className="sr-only">
                        Activation Call completed?
                      </legend>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: 'yes', label: 'Yes' },
                          { value: 'no', label: 'No' },
                        ].map((opt) => {
                          const active = choice === opt.value;
                          return (
                            <label
                              key={opt.value}
                              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                active
                                  ? opt.value === 'yes'
                                    ? 'border-emerald-500/50 bg-emerald-600/15 text-emerald-200'
                                    : 'border-zinc-500/50 bg-zinc-700/30 text-zinc-200'
                                  : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                              }`}
                            >
                              <input
                                type="radio"
                                name="activationCall"
                                value={opt.value}
                                checked={active}
                                onChange={() => {
                                  setChoice(opt.value);
                                  setPortfolioMessage('');
                                  setPortfolioError('');
                                }}
                                className="h-3.5 w-3.5 border-zinc-600 bg-zinc-900 text-[#F25E26] focus:ring-[#F25E26]/40"
                              />
                              {opt.label}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                    {savedDone && savedAt ? (
                      <p className="mt-2 text-[11px] text-zinc-500">
                        {formatPktFull(savedAt)} PKT
                      </p>
                    ) : null}
                  </div>

                  {/* Welcome Email */}
                  <div className={cardClass}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-display text-base font-semibold text-white">
                          Welcome Email
                        </h2>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Send via EmailJS &amp; record on client.
                        </p>
                      </div>
                      {welcomeSent ? (
                        <span className="inline-flex shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/35">
                          Sent
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 rounded-full bg-zinc-500/15 px-2 py-0.5 text-[11px] font-semibold text-zinc-400 ring-1 ring-zinc-600/40">
                          No
                        </span>
                      )}
                    </div>
                    <fieldset className="mt-3">
                      <legend className="sr-only">
                        Send onboarding welcome email?
                      </legend>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: 'yes', label: 'Yes' },
                          { value: 'no', label: 'No' },
                        ].map((opt) => {
                          const active = welcomeChoice === opt.value;
                          return (
                            <label
                              key={opt.value}
                              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                active
                                  ? opt.value === 'yes'
                                    ? 'border-emerald-500/50 bg-emerald-600/15 text-emerald-200'
                                    : 'border-zinc-500/50 bg-zinc-700/30 text-zinc-200'
                                  : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                              }`}
                            >
                              <input
                                type="radio"
                                name="welcomeEmail"
                                value={opt.value}
                                checked={active}
                                onChange={() => {
                                  setWelcomeChoice(opt.value);
                                  setWelcomeMessage('');
                                  setWelcomeError('');
                                }}
                                className="h-3.5 w-3.5 border-zinc-600 bg-zinc-900 text-[#F25E26] focus:ring-[#F25E26]/40"
                              />
                              {opt.label}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                    {welcomeChoice === 'yes' ? (
                      <div className="mt-3 space-y-2">
                        <input
                          id="welcome-recipient-email"
                          type="email"
                          value={recipientEmail}
                          onChange={(e) => {
                            setRecipientEmail(e.target.value);
                            setWelcomeError('');
                            setWelcomeMessage('');
                          }}
                          placeholder="Recipient email"
                          autoComplete="email"
                          disabled={sendingEmail}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/15 disabled:opacity-60"
                        />
                        <button
                          type="button"
                          disabled={sendingEmail}
                          onClick={handleSendWelcomeEmail}
                          className="w-full rounded-lg bg-[#F25E26] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#ff6a36] disabled:opacity-50"
                        >
                          {sendingEmail ? 'Sending…' : 'Send Email'}
                        </button>
                      </div>
                    ) : null}
                    {welcomeSent && welcomeAt ? (
                      <p className="mt-2 text-[11px] text-zinc-500">
                        {welcomeTo || '—'} · {formatPktFull(welcomeAt)} PKT
                      </p>
                    ) : null}
                    {welcomeMessage ? (
                      <p className="mt-2 text-xs text-emerald-400" role="status">
                        {welcomeMessage}
                      </p>
                    ) : null}
                    {welcomeError ? (
                      <p className="mt-2 text-xs text-red-400" role="alert">
                        {welcomeError}
                      </p>
                    ) : null}
                  </div>

                  {/* Products / Services */}
                  <div className={cardClass}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-display text-base font-semibold text-white">
                          Products / Services
                        </h2>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Select services; Other for custom scope.
                        </p>
                      </div>
                      {serviceSelected.length > 0 ? (
                        <span className="inline-flex shrink-0 rounded-full bg-[#F25E26]/15 px-2 py-0.5 text-[11px] font-semibold text-[#F25E26] ring-1 ring-[#F25E26]/35">
                          {serviceSelected.length}
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 rounded-full bg-zinc-500/15 px-2 py-0.5 text-[11px] font-semibold text-zinc-400 ring-1 ring-zinc-600/40">
                          None
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {SERVICE_OPTIONS.map((opt) => {
                        const active = serviceSelected.includes(opt.id);
                        return (
                          <label
                            key={opt.id}
                            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                              active
                                ? 'border-[#F25E26]/60 bg-[#F25E26]/20 text-orange-200'
                                : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleService(opt.id)}
                              className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-[#F25E26] focus:ring-[#F25E26]/40"
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                    {serviceSelected.includes('other') ? (
                      <textarea
                        value={otherNote}
                        onChange={(e) => {
                          setOtherNote(e.target.value);
                          setPortfolioMessage('');
                          setPortfolioError('');
                        }}
                        rows={2}
                        placeholder="Custom scope…"
                        className="mt-3 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/15"
                      />
                    ) : null}
                  </div>
                </div>

                {/* Retention — compact horizontal bar */}
                <div className={cardClass}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-base font-semibold text-white">
                        Retention &amp; Alert System
                      </h2>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Exact-time audio &amp; visual alert (PKT).
                      </p>
                    </div>
                    {retentionDone ? (
                      <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/35">
                        Done
                      </span>
                    ) : retentionOverdue ? (
                      <span className="inline-flex rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300 ring-1 ring-red-500/40">
                        Overdue
                      </span>
                    ) : retentionScheduled ? (
                      <span className="inline-flex rounded-full bg-[#F25E26]/15 px-2.5 py-1 text-xs font-semibold text-[#F25E26] ring-1 ring-[#F25E26]/35">
                        Scheduled
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-zinc-500/15 px-2.5 py-1 text-xs font-semibold text-zinc-400 ring-1 ring-zinc-600/40">
                        None
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="block min-w-[9.5rem] flex-1 space-y-1 text-xs text-zinc-400 sm:max-w-[12rem]">
                      <span className="font-medium">Date</span>
                      <input
                        type="date"
                        value={retDate}
                        onChange={(e) => {
                          setRetDate(e.target.value);
                          setRetMessage('');
                          setRetError('');
                          setPortfolioMessage('');
                        }}
                        className={fieldClass}
                      />
                    </label>
                    <label className="block w-14 space-y-1 text-xs text-zinc-400">
                      <span className="font-medium">Hour</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="HH"
                        value={retHour}
                        onChange={(e) => {
                          setRetHour(digitsOnly(e.target.value, 2));
                          setRetMessage('');
                          setRetError('');
                        }}
                        onBlur={() =>
                          setRetHour(
                            clampOnBlur(retHour, 1, 12, { padTo: 2 })
                          )
                        }
                        className={numInputClass}
                      />
                    </label>
                    <label className="block w-14 space-y-1 text-xs text-zinc-400">
                      <span className="font-medium">Min</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="MM"
                        value={retMinute}
                        onChange={(e) => {
                          setRetMinute(digitsOnly(e.target.value, 2));
                          setRetMessage('');
                          setRetError('');
                        }}
                        onBlur={() =>
                          setRetMinute(
                            clampOnBlur(retMinute, 0, 59, { padTo: 2 })
                          )
                        }
                        className={numInputClass}
                      />
                    </label>
                    <div className="block space-y-1 text-xs text-zinc-400">
                      <span className="font-medium">AM/PM</span>
                      <div className="flex overflow-hidden rounded-lg border border-zinc-700">
                        {['AM', 'PM'].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setRetPeriod(p);
                              setRetMessage('');
                              setRetError('');
                              setPortfolioMessage('');
                            }}
                            className={`px-3 py-2.5 text-sm font-semibold transition ${
                              retPeriod === p
                                ? 'bg-[#F25E26] text-white'
                                : 'bg-zinc-950/60 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(retentionScheduled || retentionDone) && (
                      <button
                        type="button"
                        disabled={clearRetentionMutation.isPending}
                        onClick={handleClearRetention}
                        className="ml-auto rounded-lg border border-zinc-600 bg-zinc-800/80 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-50"
                      >
                        {clearRetentionMutation.isPending
                          ? 'Clearing…'
                          : 'Clear'}
                      </button>
                    )}
                  </div>

                  {retentionAt && (retentionScheduled || retentionDone) ? (
                    <p className="mt-2 text-xs text-zinc-400">
                      {retentionDone
                        ? 'Last completed · '
                        : retentionOverdue
                          ? 'Overdue since '
                          : 'Scheduled for '}
                      <span className="font-medium text-zinc-200">
                        {formatPktFull(retentionAt)} (PKT)
                      </span>
                    </p>
                  ) : null}
                  {retMessage ? (
                    <p className="mt-2 text-xs text-emerald-400" role="status">
                      {retMessage}
                    </p>
                  ) : null}
                  {retError ? (
                    <p className="mt-2 text-xs text-red-400" role="alert">
                      {retError}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Tab: Client Context */}
            {detailTab === 'context' ? (
              <ClientContextRecord
                value={profile}
                onChange={patchProfile}
                lead={lead}
                formatPktFull={formatPktFull}
              />
            ) : null}

            {/* Tab: Upselling & Ledger */}
            {detailTab === 'upsell' ? (
              <div className={`${cardClass} space-y-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-white">
                      Upselling &amp; Split Payment Ledger
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      Track upsells separately from the base sale payment.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addUpsellRow}
                    className="shrink-0 rounded-xl border border-[#F25E26]/40 bg-[#F25E26]/15 px-4 py-2 text-sm font-semibold text-[#F25E26] transition hover:bg-[#F25E26]/25"
                  >
                    + Add Upsell
                  </button>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Base payment (from Client Context)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <p className="text-zinc-300">
                      <span className="text-zinc-500">Sales amount:</span>{' '}
                      <span className="font-medium text-white">
                        {profile.salesAmount !== '' &&
                        profile.salesAmount != null
                          ? formatMoney(profile.salesAmount)
                          : '—'}
                      </span>
                    </p>
                    <p className="text-zinc-300">
                      <span className="text-zinc-500">Method:</span>{' '}
                      <span className="font-medium text-white">
                        {formatPaymentSummary({
                          method: profile.paymentMethod || null,
                          cardLast4: profile.cardLast4,
                          cardBrand: profile.cardBrand,
                          otherDetails: profile.otherDetails,
                        })}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {upsellRows.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500 sm:col-span-2 xl:col-span-3">
                      No upsells yet. Click + Add Upsell to create the first
                      entry.
                    </p>
                  ) : (
                    upsellRows.map((row, index) => {
                      const pending = pendingFor(row);
                      const fullyPaid =
                        parseMoney(row.totalAmount) > 0 && pending === 0;
                      return (
                        <div
                          key={row.entryId}
                          className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"
                        >
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Upsell #{index + 1}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeUpsellRow(row.entryId)}
                              className="text-xs font-semibold text-zinc-500 transition hover:text-red-400"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="space-y-2.5">
                            <label className="block space-y-1 text-sm text-zinc-300">
                              <span className="font-medium">Title</span>
                              <input
                                type="text"
                                value={row.title}
                                onChange={(e) =>
                                  updateUpsellRow(row.entryId, {
                                    title: e.target.value,
                                  })
                                }
                                placeholder="e.g. Google Ads"
                                className={fieldClass}
                              />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="block space-y-1 text-sm text-zinc-300">
                                <span className="font-medium">Total ($)</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.01"
                                  value={row.totalAmount}
                                  onChange={(e) =>
                                    updateUpsellRow(row.entryId, {
                                      totalAmount: e.target.value,
                                    })
                                  }
                                  placeholder="100"
                                  className={fieldClass}
                                />
                              </label>
                              <label className="block space-y-1 text-sm text-zinc-300">
                                <span className="font-medium">Paid ($)</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.01"
                                  value={row.paidAmount}
                                  onChange={(e) =>
                                    updateUpsellRow(row.entryId, {
                                      paidAmount: e.target.value,
                                    })
                                  }
                                  placeholder="70"
                                  className={fieldClass}
                                />
                              </label>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <span className="text-xs text-zinc-500">
                                Pending:
                              </span>
                              {fullyPaid ? (
                                <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/35">
                                  $0 · Paid
                                </span>
                              ) : pending > 0 ? (
                                <span className="inline-flex rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300 ring-1 ring-red-500/40">
                                  {formatMoney(pending)}
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-zinc-500/15 px-2 py-0.5 text-[11px] font-semibold text-zinc-400 ring-1 ring-zinc-600/40">
                                  {formatMoney(0)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="space-y-3 rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Total Upselling
                      </p>
                      <p className="mt-1 font-display text-lg font-semibold text-white">
                        {formatMoney(upsellTotals.total)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Total Paid (Upsells)
                      </p>
                      <p className="mt-1 font-display text-lg font-semibold text-emerald-300">
                        {formatMoney(upsellTotals.paid)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Total Pending Balance
                      </p>
                      <p
                        className={`mt-1 font-display text-lg font-semibold ${
                          upsellTotals.pending > 0
                            ? 'text-red-400'
                            : 'text-zinc-200'
                        }`}
                      >
                        {formatMoney(upsellTotals.pending)}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-zinc-800 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#F25E26]/80">
                      Total Client Revenue / Collected
                    </p>
                    <p className="mt-1 font-display text-2xl font-bold tracking-tight text-white">
                      {formatMoney(totalCollectedLive)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Base {formatMoney(baseSalesAmount)} + Upsell paid{' '}
                      {formatMoney(upsellTotals.paid)}
                    </p>
                    {upsellTotals.pending > 0 ? (
                      <p className="mt-2 text-sm text-zinc-300">
                        Total Contract Value:{' '}
                        <span className="font-semibold text-white">
                          {formatMoney(totalContractLive)}
                        </span>
                        <span className="text-zinc-500">
                          {' '}
                          (Base + Total Upselling ·{' '}
                          {formatMoney(upsellTotals.pending)} still pending)
                        </span>
                      </p>
                    ) : upsellTotals.total > 0 ? (
                      <p className="mt-2 text-sm text-zinc-400">
                        Total Contract Value:{' '}
                        <span className="font-medium text-zinc-200">
                          {formatMoney(totalContractLive)}
                        </span>
                        <span className="text-emerald-400/80">
                          {' '}
                          · Fully paid
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Tab: Portfolio & Reports */}
            {detailTab === 'portfolio' ? (
              <LivePortfolioSection
                mode="cst"
                leadId={id}
                keywords={keywords}
                setKeywords={(next) => {
                  setKeywords(next);
                  setPortfolioMessage('');
                }}
                changeRequests={changeRequests}
                setChangeRequests={(next) => {
                  setChangeRequests(next);
                  setPortfolioMessage('');
                }}
                reports={
                  Array.isArray(lead.handover?.monthlyReports)
                    ? lead.handover.monthlyReports
                    : []
                }
                onLeadUpdated={(updated) => {
                  syncLeadCaches(updated);
                }}
              />
            ) : null}
            </div>
          </>
        )}
      </section>
    </CstManagerShell>
  );
}
