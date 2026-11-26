import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveDevelopedWebsiteUrl } from '../../services/handover.service.js';

/**
 * Developer-only input to save the built-site URL (separate from client websiteLink).
 */
export default function DevelopedWebsiteUrlField({ leadId, value = '' }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(value || '');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDraft(value || '');
  }, [value, leadId]);

  const mutation = useMutation({
    mutationFn: (url) => saveDevelopedWebsiteUrl(leadId, url),
    onSuccess: () => {
      setMessage('Website URL saved.');
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myCompletedProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myPriorityProjects'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadAssigned'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadPriority'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadCompleted'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      window.setTimeout(() => setMessage(''), 2500);
    },
  });

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
      <label className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Website URL
      </label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input
          type="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://your-built-site.com"
          className="min-w-[12rem] flex-1 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20"
        />
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(draft)}
          className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : 'Save URL'}
        </button>
      </div>
      {message ? (
        <p className="mt-1.5 text-xs text-emerald-400">{message}</p>
      ) : null}
      {mutation.isError ? (
        <p className="mt-1.5 text-xs text-red-400" role="alert">
          {mutation.error?.response?.data?.message || 'Failed to save URL.'}
        </p>
      ) : null}
    </div>
  );
}

/** Clickable “Website Developed By Us” for SEO Expert / Tech Head header. */
export function DevelopedWebsiteLink({ url, className = '' }) {
  const href = String(url || '').trim();
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={[
        'inline-flex items-center rounded-lg border border-sky-500/35 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20 hover:text-sky-200',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      Website Developed By Us
    </a>
  );
}
