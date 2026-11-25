import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ProjectNumberBadge from '../../components/tech/ProjectNumberBadge.jsx';
import TechProjectsFilterBar from '../../components/tech/TechProjectsFilterBar.jsx';
import TechHeadShell from '../../components/tech-head/TechHeadShell.jsx';
import {
  forwardEscalation,
  getCstEscalations,
} from '../../services/techHead.service.js';
import { matchesTechSearch } from '../../utils/techProjectFilters.util.js';

const fieldClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20';

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export default function TechHeadEscalationsPage() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const {
    data: items = [],
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ['techHeadEscalations'],
    queryFn: getCstEscalations,
    refetchInterval: 20_000,
  });

  const mutation = useMutation({
    mutationFn: ({ leadId, commentId, assignToUserId, guidance }) =>
      forwardEscalation(leadId, { commentId, assignToUserId, guidance }),
    onSuccess: () => {
      setMessage('Forwarded to specialist.');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['techHeadEscalations'] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
    },
    onError: (err) => {
      setMessage('');
      setError(err?.response?.data?.message || 'Failed to forward.');
    },
  });

  const rows = useMemo(
    () => items.filter((item) => matchesTechSearch(item, search)),
    [items, search]
  );

  const setDraft = (key, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...patch },
    }));
  };

  return (
    <TechHeadShell title="CST Escalations">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            CST Escalations / Comments
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Comments where CST mentioned @Tech Head — forward to an assigned
            specialist with optional guidance.
          </p>
        </div>

        {message ? (
          <p className="mb-3 text-sm text-emerald-400" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mb-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <TechProjectsFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Business name or #1…"
          onReset={() => setSearch('')}
          hasActiveFilters={Boolean(search.trim())}
        />

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {loadError?.response?.data?.message || 'Failed to load escalations.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            {items.length === 0
              ? 'No @Tech Head escalations yet.'
              : 'No escalations match the current filters.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {rows.map((item) => {
              const key = `${item.leadId}:${item.commentId}`;
              const draft = drafts[key] || {};
              const assignees = Array.isArray(item.assignees)
                ? item.assignees
                : [];
              return (
                <li
                  key={key}
                  className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ProjectNumberBadge lead={item} />
                        <Link
                          to={`/dashboard/tech-head/client/${item.leadId}`}
                          className="font-display font-semibold text-white hover:text-orange-300"
                        >
                          {item.businessName}
                        </Link>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        From {item.authorName} · {formatPkt(item.createdAt)} PKT
                      </p>
                    </div>
                    <span className="rounded-full bg-[#F25E26]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#F25E26] ring-1 ring-[#F25E26]/35">
                      @Tech Head
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-200">
                    {item.body}
                  </p>

                  {Array.isArray(item.forwards) && item.forwards.length > 0 ? (
                    <div className="mt-3 space-y-1.5">
                      {item.forwards.map((f) => (
                        <p
                          key={f.noteId}
                          className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400"
                        >
                          Forwarded to{' '}
                          <span className="font-semibold text-zinc-200">
                            {f.assignedToName || 'Specialist'}
                          </span>
                          {f.guidance ? ` · “${f.guidance}”` : ''} ·{' '}
                          {formatPkt(f.createdAt)}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <select
                      value={draft.assignToUserId || ''}
                      onChange={(e) =>
                        setDraft(key, { assignToUserId: e.target.value })
                      }
                      className={fieldClass}
                      disabled={assignees.length === 0}
                    >
                      <option value="">
                        {assignees.length
                          ? 'Assign to specialist…'
                          : 'No assignees on this client'}
                      </option>
                      {assignees.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.fullName || a._id}
                          {a.jd ? ` · ${a.jd}` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={draft.guidance || ''}
                      onChange={(e) =>
                        setDraft(key, { guidance: e.target.value })
                      }
                      placeholder="Optional internal guidance…"
                      className={fieldClass}
                    />
                    <button
                      type="button"
                      disabled={
                        mutation.isPending ||
                        !draft.assignToUserId ||
                        assignees.length === 0
                      }
                      onClick={() =>
                        mutation.mutate({
                          leadId: item.leadId,
                          commentId: item.commentId,
                          assignToUserId: draft.assignToUserId,
                          guidance: draft.guidance,
                        })
                      }
                      className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
                    >
                      Forward to Specialist
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </TechHeadShell>
  );
}
