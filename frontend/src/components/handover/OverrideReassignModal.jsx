import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getUsers } from '../../services/lead.service.js';
import { reassignHandover } from '../../services/handover.service.js';
import { ADMIN_BTN_GHOST, ADMIN_BTN_PRIMARY, ADMIN_INPUT } from '../adminBrand.js';

const CST_STATUSES = [
  { value: 'pending_review', label: 'Pending review' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

/**
 * Phase 3.4.3 override modal — super_admin only.
 * Requires overrideReason for audit; can change tech and/or cstStatus.
 */
export default function OverrideReassignModal({
  open,
  lead,
  onClose,
  onSuccess,
}) {
  const [techId, setTechId] = useState('');
  const [cstStatus, setCstStatus] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState('');

  const { data: techs = [], isLoading: techsLoading } = useQuery({
    queryKey: ['users', 'tech_team'],
    queryFn: () => getUsers({ role: 'tech_team', status: 'approved' }),
    enabled: open,
  });

  useEffect(() => {
    if (!open || !lead) return;
    const currentTech =
      lead.handover?.assignedTechId?._id ||
      lead.handover?.assignedTechId ||
      '';
    setTechId(currentTech ? String(currentTech) : '');
    setCstStatus(lead.handover?.cstStatus || 'pending_review');
    setOverrideReason('');
    setError('');
  }, [open, lead]);

  const mutation = useMutation({
    mutationFn: ({ id, payload }) => reassignHandover(id, payload),
    onSuccess: (updated) => {
      onSuccess?.(updated);
      onClose?.();
    },
    onError: (err) => {
      setError(
        err?.response?.data?.message || 'Override failed.'
      );
    },
  });

  if (!open || !lead) return null;

  const canSubmit =
    overrideReason.trim().length > 0 &&
    (techId || cstStatus) &&
    !mutation.isPending;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!overrideReason.trim()) {
      setError('overrideReason is required for audit.');
      return;
    }
    const payload = { overrideReason: overrideReason.trim() };
    if (techId) payload.techId = techId;
    if (cstStatus) payload.cstStatus = cstStatus;
    mutation.mutate({ id: lead._id, payload });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="override-reassign-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#131518] p-5 shadow-2xl"
      >
        <div>
          <h3
            id="override-reassign-title"
            className="font-display text-lg font-semibold text-white"
          >
            Override / Reassign
          </h3>
          <p className="mt-1 text-sm text-zinc-400">
            {lead.businessName || 'Lead'} · audit reason required
          </p>
        </div>

        <label className="block space-y-1.5 text-sm text-zinc-300">
          <span>Assigned tech</span>
          <select
            value={techId}
            onChange={(e) => setTechId(e.target.value)}
            disabled={techsLoading}
            className={`${ADMIN_INPUT} w-full`}
          >
            <option value="">— Unchanged / none —</option>
            {techs.map((t) => (
              <option key={t._id} value={t._id}>
                {t.fullName} ({t.email})
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5 text-sm text-zinc-300">
          <span>CST status</span>
          <select
            value={cstStatus}
            onChange={(e) => setCstStatus(e.target.value)}
            className={`${ADMIN_INPUT} w-full`}
          >
            {CST_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5 text-sm text-zinc-300">
          <span>Override reason *</span>
          <textarea
            rows={3}
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Why is this override needed?"
            className={`${ADMIN_INPUT} w-full`}
            required
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className={ADMIN_BTN_GHOST}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className={ADMIN_BTN_PRIMARY}
          >
            {mutation.isPending ? 'Saving…' : 'Apply Override'}
          </button>
        </div>
      </form>
    </div>
  );
}
