import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import ProjectNumberBadge from '../../components/tech/ProjectNumberBadge.jsx';
import TechProjectsFilterBar from '../../components/tech/TechProjectsFilterBar.jsx';
import TechHeadShell from '../../components/tech-head/TechHeadShell.jsx';
import { getInternActivity } from '../../services/techHead.service.js';
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

const TYPE_LABEL = {
  status: 'Status',
  keyword: 'Keywords',
  report: 'Report',
  work_log: 'Work log',
};

export default function TechHeadInternActivityPage() {
  const [search, setSearch] = useState('');
  const {
    data: items = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['techHeadInternActivity'],
    queryFn: getInternActivity,
    refetchInterval: 20_000,
  });

  const filtered = useMemo(
    () => items.filter((item) => matchesTechSearch(item, search)),
    [items, search]
  );

  return (
    <TechHeadShell title="Intern Activity">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            Intern Activity / Direct Reports
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Silent copies of Intern work updates. Mentors are never shown that
            these also reach Tech Head.
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
            {error?.response?.data?.message || 'Failed to load intern activity.'}
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            {items.length === 0
              ? 'No intern updates yet.'
              : 'No activity matches the current filters.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((item) => (
              <li
                key={item.activityId}
                className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#F25E26]">
                      {item.tag}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <ProjectNumberBadge lead={item} />
                      <Link
                        to={`/dashboard/tech-head/client/${item.leadId}`}
                        className="inline-block font-display font-semibold text-white hover:text-orange-300"
                      >
                        {item.businessName}
                      </Link>
                    </div>
                    <p className="mt-1 text-sm text-zinc-300">{item.summary}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
                      {TYPE_LABEL[item.type] || item.type}
                    </span>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatPkt(item.createdAt)} PKT
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </TechHeadShell>
  );
}
