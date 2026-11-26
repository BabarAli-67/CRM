import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import ProjectNumberBadge from '../../components/tech/ProjectNumberBadge.jsx';
import PriorityToggleButton, {
  PriorityPill,
} from '../../components/tech/PriorityToggleButton.component.jsx';
import TechProjectsFilterBar from '../../components/tech/TechProjectsFilterBar.jsx';
import TechHeadShell from '../../components/tech-head/TechHeadShell.jsx';
import {
  assignTeamToClient,
  getTechHeadQueue,
  listTechTeam,
  TECH_JD_OPTIONS,
} from '../../services/techHead.service.js';
import { techHeadClientPath } from '../../utils/techDetailNav.util.js';
import {
  TECH_SERVICE_FILTER_OPTIONS,
  matchesOnboardedDate,
  matchesTechSearch,
  matchesTechService,
} from '../../utils/techProjectFilters.util.js';

const leadNeedsSeoExpert = (lead) =>
  matchesTechService(lead, 'GMB') ||
  matchesTechService(lead, 'SEO Web') ||
  matchesTechService(lead, 'SEO');

const formatPkt = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function TechHeadQueuePage() {
  const queryClient = useQueryClient();
  const [assignTarget, setAssignTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [search, setSearch] = useState('');
  const [service, setService] = useState('');
  const [onboardedDate, setOnboardedDate] = useState('');

  const {
    data: queue = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['techHeadQueue'],
    queryFn: getTechHeadQueue,
    refetchInterval: 20_000,
  });

  const { data: team = [] } = useQuery({
    queryKey: ['techHeadTeam'],
    queryFn: listTechTeam,
  });

  const specialists = useMemo(
    () => team.filter((m) => m.status === 'approved' && m.role !== 'tech_head'),
    [team]
  );

  const specialistsByJd = useMemo(() => {
    const map = {};
    for (const jd of TECH_JD_OPTIONS) map[jd] = [];
    for (const member of specialists) {
      const jd = member.jd || 'Other';
      if (!map[jd]) map[jd] = [];
      map[jd].push(member);
    }
    return map;
  }, [specialists]);

  const hasActiveFilters = Boolean(
    search.trim() || service || onboardedDate
  );

  const filteredQueue = useMemo(
    () =>
      queue.filter(
        (lead) =>
          matchesTechSearch(lead, search) &&
          matchesTechService(lead, service) &&
          matchesOnboardedDate(lead, onboardedDate)
      ),
    [queue, search, service, onboardedDate]
  );

  const resetFilters = () => {
    setSearch('');
    setService('');
    setOnboardedDate('');
  };

  const assignMutation = useMutation({
    mutationFn: ({ leadId, techIds }) => assignTeamToClient(leadId, techIds),
    onSuccess: () => {
      setActionError('');
      setActionMessage('Client moved to Tech specialists.');
      setAssignTarget(null);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['techHeadQueue'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadAssigned'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadPriority'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myPriorityProjects'] });
    },
    onError: (err) => {
      setActionMessage('');
      setActionError(
        err?.response?.data?.message || 'Failed to assign Tech team.'
      );
    },
  });

  const toggleId = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const openAssign = (lead) => {
    setActionError('');
    setActionMessage('');
    setAssignTarget(lead);
    // GMB / SEO work: pre-select SEO Experts for direct routing
    if (leadNeedsSeoExpert(lead)) {
      const seoIds = specialists
        .filter((m) => m.jd === 'SEO Expert')
        .map((m) => String(m._id));
      setSelectedIds(seoIds);
    } else {
      setSelectedIds([]);
    }
  };

  return (
    <TechHeadShell title="Incoming Queue">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            Unassigned / Incoming Queue
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Clients onboarded by CST · assign to specialists before they appear
            on Tech desks (work fields only — no billing)
          </p>
        </div>

        {actionMessage ? (
          <p className="mb-4 text-sm text-emerald-300">{actionMessage}</p>
        ) : null}
        {actionError && !assignTarget ? (
          <p className="mb-4 text-sm text-red-400" role="alert">
            {actionError}
          </p>
        ) : null}

        <TechProjectsFilterBar
          search={search}
          onSearchChange={setSearch}
          service={service}
          onServiceChange={setService}
          serviceOptions={TECH_SERVICE_FILTER_OPTIONS}
          date={onboardedDate}
          onDateChange={setOnboardedDate}
          dateLabel="Onboarded Date"
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load queue.'}
          </p>
        ) : queue.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No unassigned clients in the Tech Head queue.
          </p>
        ) : filteredQueue.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No clients match the current filters.
          </p>
        ) : (
          <ul className="space-y-4">
            {filteredQueue.map((lead) => {
              const upsellLabels = (lead.upsells || [])
                .map((u) => u.title || u.serviceOther || u.service)
                .filter(Boolean);
              return (
                <li
                  key={lead._id}
                  className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ProjectNumberBadge lead={lead} size="lg" />
                        <Link
                          to={techHeadClientPath(lead._id, { from: 'queue' })}
                          className="cursor-pointer font-display text-lg font-semibold text-white underline-offset-2 transition hover:text-orange-300 hover:underline"
                        >
                          {lead.businessName || '—'}
                        </Link>
                        <PriorityPill lead={lead} />
                      </div>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        Onboarded {formatPkt(lead.handover?.onboardedAt)}
                      </p>
                      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                        <div>
                          <dt className="text-[11px] uppercase text-zinc-500">
                            Services Offered
                          </dt>
                          <dd className="text-zinc-300">
                            {lead.servicesOffered || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase text-zinc-500">
                            Service Areas
                          </dt>
                          <dd className="text-zinc-300">
                            {lead.serviceAreas || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase text-zinc-500">
                            Upsell Services
                          </dt>
                          <dd className="text-zinc-300">
                            {upsellLabels.length
                              ? upsellLabels.join(', ')
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] uppercase text-zinc-500">
                            Social Links
                          </dt>
                          <dd className="whitespace-pre-wrap text-zinc-300">
                            {lead.socialLinks?.trim() || '—'}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm">
                        {lead.websiteLink ? (
                          <a
                            href={lead.websiteLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-orange-400 hover:underline"
                          >
                            Website
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <PriorityToggleButton lead={lead} />
                      <button
                        type="button"
                        onClick={() => openAssign(lead)}
                        className="rounded-lg bg-[#F25E26] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                      >
                        Assign Team
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {assignTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-team-title"
            className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-[#111111] p-5 shadow-2xl"
          >
            <h3
              id="assign-team-title"
              className="font-display text-lg font-semibold text-white"
            >
              Assign Team
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              {assignTarget.businessName} · select specialists by department,
              then Confirm / Move to Tech
            </p>
            {leadNeedsSeoExpert(assignTarget) ? (
              <p className="mt-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
                GMB / SEO client — assign at least one SEO Expert (pre-selected
                when available).
              </p>
            ) : null}

            <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">
              {specialists.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No approved Tech specialists yet. Create them in Team
                  Management.
                </p>
              ) : (
                TECH_JD_OPTIONS.map((jd) => {
                  const members = specialistsByJd[jd] || [];
                  if (members.length === 0) return null;
                  return (
                    <div key={jd}>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        {jd}
                      </p>
                      <div className="space-y-1.5">
                        {members.map((member) => {
                          const id = String(member._id);
                          const checked = selectedIds.includes(id);
                          return (
                            <label
                              key={id}
                              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                                checked
                                  ? 'border-[#F25E26]/50 bg-[#F25E26]/10'
                                  : 'border-zinc-800 hover:border-zinc-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleId(id)}
                                className="h-4 w-4 rounded border-zinc-600"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="font-medium text-white">
                                  {member.fullName}
                                </span>
                                <span className="mt-0.5 block text-xs text-zinc-500">
                                  {member.email || member.username}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {actionError ? (
              <p className="mt-3 text-sm text-red-400" role="alert">
                {actionError}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={assignMutation.isPending}
                onClick={() => {
                  setAssignTarget(null);
                  setSelectedIds([]);
                  setActionError('');
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  assignMutation.isPending || selectedIds.length === 0
                }
                onClick={() =>
                  assignMutation.mutate({
                    leadId: assignTarget._id,
                    techIds: selectedIds,
                  })
                }
                className="rounded-lg bg-[#F25E26] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {assignMutation.isPending
                  ? 'Assigning…'
                  : 'Confirm / Move to Tech'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </TechHeadShell>
  );
}
