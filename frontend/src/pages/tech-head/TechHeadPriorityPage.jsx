import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import TechProjectsFilterBar from '../../components/tech/TechProjectsFilterBar.jsx';
import PriorityToggleButton, {
  PriorityPill,
} from '../../components/tech/PriorityToggleButton.component.jsx';
import TechHeadProjectCard, {
  formatPktForTechHeadCard as formatPkt,
} from '../../components/tech-head/TechHeadProjectCard.jsx';
import TechHeadShell from '../../components/tech-head/TechHeadShell.jsx';
import { getTechHeadPriority } from '../../services/techHead.service.js';
import {
  TECH_LIVE_STATUS_OPTIONS,
  TECH_SERVICE_FILTER_OPTIONS,
  matchesAssignedStatusFilter,
  matchesTechSearch,
  matchesTechService,
} from '../../utils/techProjectFilters.util.js';

const STATUS_LABEL = {
  onboarded: 'Unassigned',
  assigned: 'Pending',
  in_progress: 'In Progress',
  ongoing_seo: 'Ongoing (SEO)',
};

export default function TechHeadPriorityPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [service, setService] = useState('');
  const [status, setStatus] = useState('');

  const {
    data: leads = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['techHeadPriority'],
    queryFn: getTechHeadPriority,
    refetchInterval: 15_000,
  });

  const hasActiveFilters = Boolean(search.trim() || service || status);

  const filteredLeads = useMemo(
    () =>
      leads.filter(
        (lead) =>
          matchesTechSearch(lead, search) &&
          matchesTechService(lead, service) &&
          matchesAssignedStatusFilter(lead, status)
      ),
    [leads, search, service, status]
  );

  const resetFilters = () => {
    setSearch('');
    setService('');
    setStatus('');
  };

  return (
    <TechHeadShell title="Priority Task">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            Priority Task
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Active projects marked Priority · newest priority first · completed
            or unmarked projects leave this board automatically
          </p>
        </div>

        <TechProjectsFilterBar
          search={search}
          onSearchChange={setSearch}
          service={service}
          onServiceChange={setService}
          serviceOptions={TECH_SERVICE_FILTER_OPTIONS}
          status={status}
          onStatusChange={setStatus}
          statusOptions={TECH_LIVE_STATUS_OPTIONS}
          statusLabel="Project Status"
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {error?.response?.data?.message ||
              'Failed to load priority projects.'}
          </p>
        ) : leads.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No priority projects right now.
          </p>
        ) : filteredLeads.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No projects match the current filters.
          </p>
        ) : (
          <ul className="space-y-4">
            {filteredLeads.map((lead) => {
              const statusKey =
                lead.handover?.techStatus || lead.handover?.cstStatus || null;
              const statusText =
                lead.statusLabel ||
                STATUS_LABEL[statusKey] ||
                statusKey ||
                '—';

              return (
                <TechHeadProjectCard
                  key={lead._id}
                  lead={lead}
                  statusText={statusText}
                  metaLine={`Priority since ${formatPkt(
                    lead.handover?.priorityAssignedAt
                  )} PKT`}
                  headerExtra={<PriorityPill lead={lead} />}
                  detailFrom="priority"
                  onOpsUpdated={() => {
                    queryClient.invalidateQueries({
                      queryKey: ['techHeadPriority'],
                    });
                    queryClient.invalidateQueries({
                      queryKey: ['techHeadBadges'],
                    });
                  }}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <PriorityToggleButton lead={lead} />
                    </div>
                  }
                />
              );
            })}
          </ul>
        )}
      </section>
    </TechHeadShell>
  );
}
