import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import TechProjectsFilterBar from '../../components/tech/TechProjectsFilterBar.jsx';
import TechHeadProjectCard, {
  formatPktForTechHeadCard as formatPkt,
} from '../../components/tech-head/TechHeadProjectCard.jsx';
import TechHeadShell from '../../components/tech-head/TechHeadShell.jsx';
import {
  getTechHeadCompleted,
  listTechTeam,
} from '../../services/techHead.service.js';
import {
  TECH_SERVICE_FILTER_OPTIONS,
  matchesAssignedSpecialist,
  matchesTechSearch,
  matchesTechService,
} from '../../utils/techProjectFilters.util.js';

export default function TechHeadCompletedPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [service, setService] = useState('');
  const [specialistId, setSpecialistId] = useState('');

  const {
    data: leads = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['techHeadCompleted'],
    queryFn: getTechHeadCompleted,
    refetchInterval: 30_000,
  });

  const { data: team = [] } = useQuery({
    queryKey: ['techHeadTeam'],
    queryFn: listTechTeam,
  });

  const specialists = useMemo(
    () => team.filter((m) => m.status === 'approved'),
    [team]
  );

  const hasActiveFilters = Boolean(search.trim() || service || specialistId);

  const filteredLeads = useMemo(
    () =>
      leads.filter(
        (lead) =>
          matchesTechSearch(lead, search) &&
          matchesTechService(lead, service) &&
          matchesAssignedSpecialist(lead, specialistId)
      ),
    [leads, search, service, specialistId]
  );

  const resetFilters = () => {
    setSearch('');
    setService('');
    setSpecialistId('');
  };

  return (
    <TechHeadShell title="Completed Projects">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            Completed Projects
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Finished Tech work — project numbers, specialists, ops statuses, and
            work fields preserved. Billing and contact fields stay hidden.
          </p>
        </div>

        <TechProjectsFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Business name, #1, service area…"
          service={service}
          onServiceChange={setService}
          serviceOptions={TECH_SERVICE_FILTER_OPTIONS}
          specialistId={specialistId}
          onSpecialistChange={setSpecialistId}
          specialists={specialists}
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {error?.response?.data?.message ||
              'Failed to load completed projects.'}
          </p>
        ) : leads.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No completed projects yet.
          </p>
        ) : filteredLeads.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No projects match the current filters.
          </p>
        ) : (
          <ul className="space-y-4">
            {filteredLeads.map((lead) => (
              <TechHeadProjectCard
                key={lead._id}
                lead={lead}
                statusText="Completed"
                metaLine={`Completed ${formatPkt(lead.handover?.completedAt)} · Assigned ${formatPkt(lead.handover?.assignedAt)}`}
                detailFrom="completed"
                onOpsUpdated={() => {
                  queryClient.invalidateQueries({
                    queryKey: ['techHeadCompleted'],
                  });
                }}
                actions={
                  <Link
                    to={`/dashboard/tech-head/client/${lead._id}?from=completed`}
                    className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                  >
                    Work & Reports
                  </Link>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </TechHeadShell>
  );
}
