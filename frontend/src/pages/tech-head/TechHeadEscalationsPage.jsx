import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import ProjectNumberBadge from '../../components/tech/ProjectNumberBadge.jsx';
import TechProjectsFilterBar from '../../components/tech/TechProjectsFilterBar.jsx';
import TechHeadShell from '../../components/tech-head/TechHeadShell.jsx';
import {
  forwardEscalation,
  getCstEscalations,
  listTechTeam,
  TECH_JD_OPTIONS,
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

  const { data: team = [] } = useQuery({
    queryKey: ['techHeadTeam'],
    queryFn: listTechTeam,
    staleTime: 60_000,
  });

  const teamByJd = useMemo(() => {
    const map = {};
    for (const jd of TECH_JD_OPTIONS) map[jd] = [];
    for (const member of team) {
      const jd = member.jd || 'Other';
      if (!map[jd]) map[jd] = [];
      map[jd].push(member);
    }
    return map;
  }, [team]);

  const [forwardingKey, setForwardingKey] = useState(null);

  const mutation = useMutation({
    mutationFn: ({ leadId, commentId, assignToUserId, guidance }) =>
      forwardEscalation(leadId, { commentId, assignToUserId, guidance }),
    onSuccess: (_data, vars) => {
      setMessage('Forwarded to specialist Comments thread.');
      setError('');
      setForwardingKey(null);
      if (vars) {
        const key = `${vars.leadId}:${vars.commentId}`;
        setDrafts((prev) => ({
          ...prev,
          [key]: {
            ...(prev[key] || {}),
            assignToUserId: '',
            department: '',
            guidance: '',
          },
        }));
      }
      queryClient.invalidateQueries({ queryKey: ['techHeadEscalations'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadAssigned'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadQueue'] });
      queryClient.invalidateQueries({ queryKey: ['commentNotifications'] });
    },
    onError: (err) => {
      setMessage('');
      setForwardingKey(null);
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
    <TechHeadShell title="CST Comments">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            CST Comments
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            All CST client comments — reply in the thread or forward to a
            department specialist with optional guidance.
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
            {loadError?.response?.data?.message || 'Failed to load CST comments.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            {items.length === 0
              ? 'No CST comments yet.'
              : 'No CST comments match the current filters.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {rows.map((item) => {
              const key = `${item.leadId}:${item.commentId}`;
              const draft = drafts[key] || {};
              const selectedJd = draft.department || '';
              const specialists = selectedJd
                ? teamByJd[selectedJd] || []
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
                          to={`/dashboard/tech-head/client/${item.leadId}?tab=comments&from=cst-comments`}
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
                      CST
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-200">
                    {item.body}
                  </p>

                  <div className="mt-3">
                    <Link
                      to={`/dashboard/tech-head/client/${item.leadId}?tab=comments&from=cst-comments`}
                      className="inline-flex items-center gap-2 rounded-xl bg-orange-600/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500"
                    >
                      <MessageSquare className="h-4 w-4" aria-hidden />
                      Open Comments & Reply
                    </Link>
                  </div>

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

                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
                    <select
                      value={selectedJd}
                      onChange={(e) =>
                        setDraft(key, {
                          department: e.target.value,
                          assignToUserId: '',
                        })
                      }
                      className={fieldClass}
                    >
                      <option value="">Department…</option>
                      {TECH_JD_OPTIONS.map((jd) => (
                        <option key={jd} value={jd}>
                          {jd}
                          {teamByJd[jd]?.length
                            ? ` (${teamByJd[jd].length})`
                            : ''}
                        </option>
                      ))}
                    </select>
                    <select
                      value={draft.assignToUserId || ''}
                      onChange={(e) =>
                        setDraft(key, { assignToUserId: e.target.value })
                      }
                      className={fieldClass}
                      disabled={!selectedJd}
                    >
                      <option value="">
                        {!selectedJd
                          ? 'Select department first…'
                          : specialists.length
                            ? 'Specialist…'
                            : 'No specialists in this department'}
                      </option>
                      {specialists.map((a) => (
                        <option key={a._id} value={a._id}>
                          {a.fullName || a.username || a._id}
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
                        forwardingKey === key ||
                        !draft.assignToUserId ||
                        !selectedJd
                      }
                      onClick={() => {
                        if (mutation.isPending || forwardingKey) return;
                        setForwardingKey(key);
                        mutation.mutate({
                          leadId: item.leadId,
                          commentId: item.commentId,
                          assignToUserId: draft.assignToUserId,
                          guidance: draft.guidance,
                        });
                      }}
                      className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
                    >
                      {forwardingKey === key
                        ? 'Forwarding…'
                        : 'Forward to Specialist'}
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
