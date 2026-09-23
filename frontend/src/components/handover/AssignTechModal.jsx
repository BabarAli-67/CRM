import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  assignHandover,
  getTechList,
} from '../../services/handover.service.js';

const fieldClass =
  'w-full rounded-md border border-white/15 bg-obsidian px-3 py-2 text-sm text-ink outline-none focus:border-flash-secondary';

/**
 * Assign a pending_review handover lead to an approved tech_team user.
 *
 * @param {boolean} open
 * @param {object|null} lead
 * @param {() => void} onClose
 * @param {(lead: object) => void} [onSuccess]
 */
export default function AssignTechModal({ open, lead, onClose, onSuccess }) {
  const [techId, setTechId] = useState('');
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
    if (!open) return;
    setTechId('');
    setError('');
  }, [open, lead?._id]);

  const mutation = useMutation({
    mutationFn: ({ id, techId: selectedTechId }) =>
      assignHandover(id, { techId: selectedTechId }),
    onSuccess: (updatedLead) => {
      setError('');
      onSuccess?.(updatedLead);
      onClose?.();
    },
    onError: (err) => {
      setError(
        err?.response?.data?.message || 'Failed to assign tech.'
      );
    },
  });

  if (!open || !lead) return null;

  const canConfirm = Boolean(techId) && !mutation.isPending;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!techId) {
      setError('Select a tech team member.');
      return;
    }
    mutation.mutate({ id: lead._id, techId });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-tech-modal-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-obsidian-surface p-5 shadow-xl"
      >
        <div>
          <h3
            id="assign-tech-modal-title"
            className="font-display text-lg font-semibold text-ink"
          >
            Assign to Tech
          </h3>
          <p className="mt-1 text-sm text-ink/70">
            {lead.businessName || 'Lead'}
          </p>
        </div>

        <label className="block space-y-1.5 text-sm text-ink/80">
          <span>Tech team member *</span>
          <select
            value={techId}
            onChange={(e) => setTechId(e.target.value)}
            disabled={techsLoading || techsError}
            className={fieldClass}
            required
          >
            <option value="">
              {techsLoading ? 'Loading…' : 'Select tech…'}
            </option>
            {[...techs]
              .sort((a, b) =>
                String(a.fullName || '').localeCompare(String(b.fullName || ''))
              )
              .map((t) => (
                <option key={t._id} value={t._id}>
                  {t.fullName} ({t.username})
                </option>
              ))}
          </select>
        </label>

        {techsError ? (
          <p role="alert" className="text-sm text-red-300">
            Failed to load tech list.
          </p>
        ) : null}

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
            className="rounded-md bg-flash-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-flash-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? 'Assigning…' : 'Confirm Assign'}
          </button>
        </div>
      </form>
    </div>
  );
}
