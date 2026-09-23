import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateLead } from '../../services/lead.service.js';
import { formatUserRef } from '../../utils/formatUserRef.util.js';
import {
  formatCstStatus,
  formatLeadPipeline,
  formatLeadStage,
  formatPaymentSummary,
} from '../../utils/formatPayment.util.js';

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const Row = ({ label, children }) => (
  <div className="grid grid-cols-[7.5rem_1fr] gap-2 border-b border-zinc-800/80 py-2.5 last:border-0 sm:grid-cols-[9rem_1fr]">
    <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
      {label}
    </dt>
    <dd className="text-sm text-zinc-200">{children}</dd>
  </div>
);

const fieldClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-orange-500/60';

/**
 * Full lead history / payment details for Closers, Admin, Auditor, CST.
 * Never renders cardReferenceToken.
 *
 * @param {boolean} [canEdit] — closer may tweak details before Move to CST
 * @param {(lead: object) => void} [onLeadUpdated]
 */
export default function LeadDetailModal({
  open,
  lead,
  onClose,
  footer = null,
  headerActions = null,
  canEdit = false,
  onLeadUpdated = null,
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    businessName: '',
    phone: '',
    websiteLink: '',
    notes: '',
  });
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!lead) return;
    setEditing(false);
    setEditError('');
    setForm({
      businessName: lead.businessName || '',
      phone: lead.phone || '',
      websiteLink: lead.websiteLink || '',
      notes: lead.notes || '',
    });
  }, [lead]);

  const saveMutation = useMutation({
    mutationFn: (payload) => updateLead(lead._id, payload),
    onSuccess: (updated) => {
      setEditError('');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['closerClosedSales'] });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline', 'leads'] });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
      onLeadUpdated?.(updated);
    },
    onError: (err) => {
      setEditError(
        err?.response?.data?.message || 'Failed to save lead details.'
      );
    },
  });

  if (!open || !lead) return null;

  const payment = lead.payment;
  const followAt = lead.followUp?.callbackAt;
  const display = editing
    ? { ...lead, ...form }
    : lead;

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.businessName.trim() || !form.phone.trim()) {
      setEditError('Business name and phone are required.');
      return;
    }
    saveMutation.mutate({
      businessName: form.businessName.trim(),
      phone: form.phone.trim(),
      websiteLink: form.websiteLink.trim() || null,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-detail-title"
    >
      <button
        type="button"
        aria-label="Close backdrop"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="lead-detail-title"
              className="font-display text-lg font-semibold text-white"
            >
              {display.businessName || 'Lead details'}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              {display.phone || '—'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-3">
          {editing ? (
            <form id="lead-detail-edit" onSubmit={handleSave} className="space-y-3 pb-2">
              <label className="block space-y-1 text-sm">
                <span className="text-zinc-400">Business name</span>
                <input
                  required
                  value={form.businessName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, businessName: e.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-zinc-400">Phone</span>
                <input
                  required
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-zinc-400">Website</span>
                <input
                  type="url"
                  value={form.websiteLink}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, websiteLink: e.target.value }))
                  }
                  className={fieldClass}
                  placeholder="https://"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-zinc-400">Notes</span>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
              {editError ? (
                <p role="alert" className="text-sm text-red-400">
                  {editError}
                </p>
              ) : null}
            </form>
          ) : (
            <dl>
              <Row label="Stage">{formatLeadStage(lead)}</Row>
              <Row label="Pipeline">{formatLeadPipeline(lead)}</Row>
              <Row label="Created By">
                {formatUserRef(lead.agentId) || '—'}
              </Row>
              <Row label="Closer">
                {formatUserRef(lead.closerId) || '—'}
              </Row>
              {lead.clientName ? (
                <Row label="Client">{lead.clientName}</Row>
              ) : null}
              <Row label="Website">
                {lead.websiteLink ? (
                  <a
                    href={lead.websiteLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-400 hover:underline"
                  >
                    {lead.websiteLink}
                  </a>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Notes">
                <span className="whitespace-pre-wrap">{lead.notes || '—'}</span>
              </Row>
              {lead.handover?.onboardingNotes ? (
                <Row label="Onboarding">
                  <span className="whitespace-pre-wrap">
                    {lead.handover.onboardingNotes}
                  </span>
                </Row>
              ) : null}
              <Row label="Callback">{formatPkt(followAt)}</Row>
              {lead.followUp?.notes ? (
                <Row label="Callback note">
                  <span className="whitespace-pre-wrap">
                    {lead.followUp.notes}
                  </span>
                </Row>
              ) : null}
              <Row label="Payment">{formatPaymentSummary(payment)}</Row>
              {payment?.method === 'via_link' ? (
                <Row label="Payment link">
                  {payment.linkUrl ? (
                    <a
                      href={payment.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-orange-400 hover:underline"
                    >
                      {payment.linkUrl}
                    </a>
                  ) : (
                    '—'
                  )}
                </Row>
              ) : null}
              {payment?.method === 'via_card' ? (
                <>
                  <Row label="Card brand">
                    {payment.cardBrand || '—'}
                  </Row>
                  <Row label="Card last 4">
                    {payment.cardLast4 ? `•••• ${payment.cardLast4}` : '—'}
                  </Row>
                </>
              ) : null}
              {payment?.method === 'other' ? (
                <Row label="Other details">
                  {payment.otherDetails || '—'}
                </Row>
              ) : null}
              <Row label="CST status">
                {formatCstStatus(lead.handover?.cstStatus)}
              </Row>
              {lead.handover?.techStatus ||
              ['assigned', 'in_progress', 'completed'].includes(
                lead.handover?.cstStatus
              ) ? (
                <Row label="Tech status">
                  {formatCstStatus(
                    lead.handover?.techStatus || lead.handover?.cstStatus
                  )}
                </Row>
              ) : null}
              <Row label="Closed">{formatPkt(lead.closedAt)}</Row>
              <Row label="Closed by">
                {formatUserRef(lead.closedBy) || '—'}
              </Row>
              {lead.handover?.handedOverAt ? (
                <Row label="Handed to CST">
                  {formatPkt(lead.handover.handedOverAt)}
                </Row>
              ) : null}
            </dl>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          {canEdit && !editing ? (
            <button
              type="button"
              onClick={() => {
                setEditError('');
                setEditing(true);
              }}
              className="rounded-xl border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            >
              Edit details
            </button>
          ) : null}
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditError('');
                  setForm({
                    businessName: lead.businessName || '',
                    phone: lead.phone || '',
                    websiteLink: lead.websiteLink || '',
                    notes: lead.notes || '',
                  });
                }}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="lead-detail-edit"
                disabled={saveMutation.isPending}
                className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-60"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : (
            footer
          )}
          {!editing ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
