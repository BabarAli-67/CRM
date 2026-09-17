import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { disqualifyLead } from '../../services/lead.service.js';

const fieldClass =
  'w-full rounded-md border border-white/15 bg-obsidian px-3 py-2 text-sm text-ink outline-none focus:border-flash-secondary';

/**
 * Modal that requires a disqualifiedReason before confirm is enabled,
 * then PATCHes /api/leads/:id/disqualify.
 *
 * @param {boolean} open
 * @param {object|null} lead
 * @param {() => void} onClose
 * @param {(lead: object) => void} [onSuccess]
 */
export default function DisqualifyModal({
  open,
  lead,
  onClose,
  onSuccess,
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError('');
  }, [open, lead?._id]);

  const mutation = useMutation({
    mutationFn: ({ id, disqualifiedReason }) =>
      disqualifyLead(id, disqualifiedReason),
    onSuccess: (updatedLead) => {
      setError('');
      onSuccess?.(updatedLead);
      onClose?.();
    },
    onError: (err) => {
      setError(
        err?.response?.data?.message || 'Failed to disqualify lead.'
      );
    },
  });

  if (!open || !lead) return null;

  const canConfirm = reason.trim().length > 0 && !mutation.isPending;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A disqualification reason is required.');
      return;
    }
    mutation.mutate({
      id: lead._id,
      disqualifiedReason: reason.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disqualify-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-obsidian-surface p-5 shadow-xl"
      >
        <div>
          <h3
            id="disqualify-modal-title"
            className="font-display text-lg font-semibold text-ink"
          >
            Mark Disqualified
          </h3>
          <p className="mt-1 text-sm text-ink/70">
            {lead.businessName || 'Lead'}
          </p>
        </div>

        <label className="block space-y-1.5 text-sm text-ink/80">
          <span>Reason *</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this lead being disqualified?"
            autoFocus
            className={fieldClass}
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
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-ink/80 hover:bg-white/5 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canConfirm}
            className="rounded-md bg-red-600/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? 'Saving…' : 'Confirm Disqualify'}
          </button>
        </div>
      </form>
    </div>
  );
}
