import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import ProjectNumberBadge from '../../components/tech/ProjectNumberBadge.jsx';
import TechProjectsFilterBar from '../../components/tech/TechProjectsFilterBar.jsx';
import TechHeadShell from '../../components/tech-head/TechHeadShell.jsx';
import { getTeamComments } from '../../services/techHead.service.js';
import { matchesTechSearch } from '../../utils/techProjectFilters.util.js';

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

export default function TechHeadTeamCommentsPage() {
  const [search, setSearch] = useState('');

  const {
    data: items = [],
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ['techHeadTeamComments'],
    queryFn: getTeamComments,
    refetchInterval: 20_000,
  });

  const rows = useMemo(
    () => items.filter((item) => matchesTechSearch(item, search)),
    [items, search]
  );

  return (
    <TechHeadShell title="Team Comments">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            Team Comments
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            All comments from Tech Team specialists — open the thread to reply
            or mention CST / specialists.
          </p>
        </div>

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
            {loadError?.response?.data?.message ||
              'Failed to load team comments.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            {items.length === 0
              ? 'No Tech Team comments yet.'
              : 'No comments match the current filters.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {rows.map((item) => {
              const key = `${item.leadId}:${item.commentId}`;
              return (
                <li
                  key={key}
                  className={`rounded-xl border p-4 ${
                    item.unread
                      ? 'border-[#F25E26]/40 bg-[#F25E26]/5'
                      : 'border-zinc-800/60 bg-zinc-900/40'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ProjectNumberBadge lead={item} />
                        <Link
                          to={`/dashboard/tech-head/client/${item.leadId}?tab=comments&from=team-comments`}
                          className="font-display font-semibold text-white hover:text-orange-300"
                        >
                          {item.businessName}
                        </Link>
                        {item.unread ? (
                          <span className="rounded-full bg-[#F25E26]/15 px-2 py-0.5 text-[10px] font-bold text-[#F25E26] ring-1 ring-[#F25E26]/35">
                            Unread
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        From {item.authorName}
                        {item.authorJd ? ` · ${item.authorJd}` : ''} ·{' '}
                        {formatPkt(item.createdAt)} PKT
                      </p>
                    </div>
                    <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300 ring-1 ring-sky-500/35">
                      Tech Team
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-200">
                    {item.body}
                  </p>
                  <div className="mt-4">
                    <Link
                      to={`/dashboard/tech-head/client/${item.leadId}?tab=comments&from=team-comments`}
                      className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500"
                    >
                      <MessageSquare className="h-4 w-4" aria-hidden />
                      Open Comments & Reply
                    </Link>
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
