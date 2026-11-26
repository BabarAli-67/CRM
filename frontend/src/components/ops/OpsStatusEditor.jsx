import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateClientOpsStatus } from '../../services/techHead.service.js';
import {
  CLIENT_OPS_OPTIONS,
  GMB_OPS_OPTIONS,
  WEBSITE_SEO_OPS_OPTIONS,
  resolveClientOpsStatus,
} from '../../utils/opsStatus.util.js';

const selectClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none focus:border-[#F25E26]/50 focus:ring-2 focus:ring-[#F25E26]/20';

/**
 * Tech Head editable Client Ops / GMB / Website SEO operational statuses.
 * (Client Status Active/Expired removed — CST Non-Active owns lifecycle.)
 */
export default function OpsStatusEditor({ leadId, handover, onUpdated }) {
  const queryClient = useQueryClient();
  const [clientOpsStatus, setClientOpsStatus] = useState(
    () => resolveClientOpsStatus(handover) || 'Running'
  );
  const [gmbOpsStatus, setGmbOpsStatus] = useState(
    () => handover?.gmbOpsStatus || ''
  );
  const [websiteSeoOpsStatus, setWebsiteSeoOpsStatus] = useState(
    () => handover?.websiteSeoOpsStatus || ''
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setClientOpsStatus(resolveClientOpsStatus(handover) || 'Running');
    setGmbOpsStatus(handover?.gmbOpsStatus || '');
    setWebsiteSeoOpsStatus(handover?.websiteSeoOpsStatus || '');
  }, [handover]);

  const mutation = useMutation({
    mutationFn: (payload) => updateClientOpsStatus(leadId, payload),
    onSuccess: (updatedLead) => {
      setError('');
      setMessage('Operational statuses saved.');
      queryClient.invalidateQueries({ queryKey: ['techHeadAssigned'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadCompleted'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadClient', leadId] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      queryClient.invalidateQueries({
        queryKey: ['lead', leadId, 'tech-portfolio'],
      });
      onUpdated?.(updatedLead);
    },
    onError: (err) => {
      setMessage('');
      setError(
        err?.response?.data?.message || 'Failed to update operational statuses.'
      );
    },
  });

  const save = (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    const payload = {
      clientOpsStatus,
    };
    if (gmbOpsStatus) payload.gmbOpsStatus = gmbOpsStatus;
    if (websiteSeoOpsStatus) payload.websiteSeoOpsStatus = websiteSeoOpsStatus;
    mutation.mutate(payload);
  };

  return (
    <form
      onSubmit={save}
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 px-5 py-4 shadow-xl"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Operational Status Trackers
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Editable by Tech Head · specialists see these live as read-only
            badges
          </p>
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-[#F25E26] px-3.5 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : 'Save Statuses'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block space-y-1 text-xs font-medium text-zinc-400">
          <span>Client Ops (IN / OUT)</span>
          <select
            required
            value={clientOpsStatus}
            onChange={(e) => setClientOpsStatus(e.target.value)}
            className={selectClass}
          >
            {CLIENT_OPS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-xs font-medium text-zinc-400">
          <span>GMB Status</span>
          <select
            value={gmbOpsStatus}
            onChange={(e) => setGmbOpsStatus(e.target.value)}
            className={selectClass}
          >
            <option value="">Select…</option>
            {GMB_OPS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-xs font-medium text-zinc-400">
          <span>Website SEO Status</span>
          <select
            value={websiteSeoOpsStatus}
            onChange={(e) => setWebsiteSeoOpsStatus(e.target.value)}
            className={selectClass}
          >
            <option value="">Select…</option>
            {WEBSITE_SEO_OPS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message ? (
        <p className="mt-3 text-sm text-emerald-300" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
