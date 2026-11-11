import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../../services/lead.service.js';

const closerSelectClass =
  'bg-zinc-900 border border-zinc-700 text-white rounded-lg p-2.5 w-full focus:ring-orange-500 focus:outline-none focus:ring-2 appearance-none cursor-pointer';

const resolveCloserId = (ref) => {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'object' && ref._id) return String(ref._id);
  return '';
};

/**
 * Confirm promote-to-lead with a required Assign Closer selection.
 * Pre-fills from the callback's assignedCloserId when present.
 */
export default function PromoteToLeadModal({
  open,
  callback,
  onClose,
  onConfirm,
  isSubmitting = false,
}) {
  const [assignedCloserId, setAssignedCloserId] = useState('');
  const [error, setError] = useState('');

  const { data: closers = [], isLoading: closersLoading } = useQuery({
    queryKey: ['users', 'closer'],
    queryFn: () => getUsers({ role: 'closer', status: 'approved' }),
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    setAssignedCloserId(resolveCloserId(callback?.assignedCloserId));
  }, [open, callback]);

  if (!open || !callback) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!assignedCloserId) {
      setError('Please assign a closer.');
      return;
    }
    try {
      await onConfirm({ assignedCloserId });
      onClose?.();
    } catch (err) {
      setError(
        err?.response?.data?.message || 'Failed to promote callback to lead.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 p-4 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close form backdrop"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promote-lead-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2
            id="promote-lead-title"
            className="font-display text-lg font-semibold text-white"
          >
            Promote to Lead
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5" noValidate>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Callback
            </p>
            <p className="mt-1 font-medium text-white">{callback.businessName}</p>
            <p className="mt-0.5 text-sm text-zinc-400">{callback.phone}</p>
          </div>

          <label className="block space-y-1.5 text-sm text-zinc-300">
            <span className="font-medium">
              Assign Closer <span className="text-red-400">*</span>
            </span>
            <select
              required
              value={assignedCloserId}
              onChange={(e) => setAssignedCloserId(e.target.value)}
              disabled={isSubmitting || closersLoading}
              className={closerSelectClass}
              aria-required="true"
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

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Promoting…' : 'Promote to Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
