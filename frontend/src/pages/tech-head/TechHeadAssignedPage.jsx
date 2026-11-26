import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import TechProjectsFilterBar from '../../components/tech/TechProjectsFilterBar.jsx';
import PriorityToggleButton, {
  PriorityPill,
} from '../../components/tech/PriorityToggleButton.component.jsx';
import TechHeadProjectCard, {
  formatPktForTechHeadCard as formatPkt,
} from '../../components/tech-head/TechHeadProjectCard.jsx';
import TechHeadShell from '../../components/tech-head/TechHeadShell.jsx';
import {
  assignTeamToClient,
  getTechHeadAssigned,
  listTechTeam,
} from '../../services/techHead.service.js';
import {
  CLIENT_OPS_FILTER_OPTIONS,
  TECH_LIVE_STATUS_OPTIONS,
  TECH_SERVICE_CATEGORY_OPTIONS,
  TECH_SERVICE_FILTER_OPTIONS,
  countLeadsByServiceCategory,
  matchesAssignedSpecialist,
  matchesAssignedStatusFilter,
  matchesTechSearch,
  matchesTechService,
} from '../../utils/techProjectFilters.util.js';

const STATUS_LABEL = {
  assigned: 'Pending',
  in_progress: 'In Progress',
  ongoing_seo: 'Ongoing (SEO)',
};

const ASSIGNED_STATUS_OPTIONS = [
  ...TECH_LIVE_STATUS_OPTIONS,
  ...CLIENT_OPS_FILTER_OPTIONS.map((label) => ({
    value: label,
    label: `Client · ${label}`,
  })),
];

export default function TechHeadAssignedPage() {
  const queryClient = useQueryClient();
  const [reassignTarget, setReassignTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [search, setSearch] = useState('');
  const [service, setService] = useState('');
  const [specialistId, setSpecialistId] = useState('');
  const [status, setStatus] = useState('');

  const {
    data: leads = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['techHeadAssigned'],
    queryFn: getTechHeadAssigned,
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

  const hasActiveFilters = Boolean(
    search.trim() || service || specialistId || status
  );

  const categoryCounts = useMemo(
    () => countLeadsByServiceCategory(leads),
    [leads]
  );

  const filteredLeads = useMemo(
    () =>
      leads.filter(
        (lead) =>
          matchesTechSearch(lead, search) &&
          matchesTechService(lead, service) &&
          matchesAssignedSpecialist(lead, specialistId) &&
          matchesAssignedStatusFilter(lead, status)
      ),
    [leads, search, service, specialistId, status]
  );

  const resetFilters = () => {
    setSearch('');
    setService('');
    setSpecialistId('');
    setStatus('');
  };

  const reassignMutation = useMutation({
    mutationFn: ({ leadId, techIds }) => assignTeamToClient(leadId, techIds),
    onSuccess: () => {
      setActionError('');
      setActionMessage('Team updated — specialists share the same project brief.');
      setReassignTarget(null);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['techHeadAssigned'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadCompleted'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadPriority'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadBadges'] });
      queryClient.invalidateQueries({ queryKey: ['techHeadQueue'] });
      queryClient.invalidateQueries({ queryKey: ['myProjects'] });
      queryClient.invalidateQueries({ queryKey: ['myPriorityProjects'] });
    },
    onError: (err) => {
      setActionMessage('');
      setActionError(
        err?.response?.data?.message || 'Failed to update Tech team.'
      );
    },
  });

  const openReassign = (lead) => {
    setActionError('');
    setActionMessage('');
    setReassignTarget(lead);
    const current = Array.isArray(lead.handover?.assignedTechIds)
      ? lead.handover.assignedTechIds
      : lead.handover?.assignedTechId
        ? [lead.handover.assignedTechId]
        : [];
    setSelectedIds(
      current
        .map((t) => String(typeof t === 'object' ? t._id : t))
        .filter(Boolean)
    );
  };

  const toggleId = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <TechHeadShell title="Assigned Projects">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            Assigned Projects
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Live work only (Pending, In Progress, Ongoing SEO). Completed
            projects move to the Completed tab.
          </p>
        </div>

        {actionMessage ? (
          <p className="mb-4 text-sm text-emerald-300">{actionMessage}</p>
        ) : null}
        {actionError && !reassignTarget ? (
          <p className="mb-4 text-sm text-red-400" role="alert">
            {actionError}
          </p>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setService('')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${
              !service
                ? 'bg-[#F25E26]/15 text-[#F25E26] ring-[#F25E26]/40'
                : 'bg-zinc-950 text-zinc-400 ring-zinc-700 hover:text-zinc-200'
            }`}
          >
            All · {leads.length}
          </button>
          {TECH_SERVICE_CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setService(service === cat ? '' : cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                service === cat
                  ? 'bg-[#F25E26]/15 text-[#F25E26] ring-[#F25E26]/40'
                  : 'bg-zinc-950 text-zinc-400 ring-zinc-700 hover:text-zinc-200'
              }`}
            >
              {cat} · {categoryCounts[cat] ?? 0}
            </button>
          ))}
        </div>

        <TechProjectsFilterBar
          search={search}
          onSearchChange={setSearch}
          service={service}
          onServiceChange={setService}
          serviceOptions={TECH_SERVICE_FILTER_OPTIONS}
          specialistId={specialistId}
          onSpecialistChange={setSpecialistId}
          specialists={specialists}
          status={status}
          onStatusChange={setStatus}
          statusOptions={ASSIGNED_STATUS_OPTIONS}
          statusLabel="Project / Client Status"
          onReset={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {error?.response?.data?.message ||
              'Failed to load assigned projects.'}
          </p>
        ) : leads.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No assigned projects yet.
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
                  metaLine={`Assigned ${formatPkt(lead.handover?.assignedAt)} PKT`}
                  headerExtra={<PriorityPill lead={lead} />}
                  detailFrom="assigned"
                  onOpsUpdated={() => {
                    queryClient.invalidateQueries({
                      queryKey: ['techHeadAssigned'],
                    });
                  }}
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <PriorityToggleButton lead={lead} />
                      <button
                        type="button"
                        onClick={() => openReassign(lead)}
                        className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                      >
                        Reassign / Add
                      </button>
                    </div>
                  }
                />
              );
            })}
          </ul>
        )}
      </section>

      {reassignTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-[#111111] p-5 shadow-2xl"
          >
            <h3 className="font-display text-lg font-semibold text-white">
              Reassign team · {reassignTarget.businessName || 'Client'}
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Select one or more specialists. Existing keywords and PDF reports
              are kept.
            </p>
            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {specialists.length === 0 ? (
                <li className="text-sm text-zinc-500">
                  No approved Tech specialists yet.
                </li>
              ) : (
                specialists.map((m) => (
                  <li key={m._id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2 hover:bg-zinc-900/80">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(String(m._id))}
                        onChange={() => toggleId(String(m._id))}
                        className="h-4 w-4 accent-orange-500"
                      />
                      <span className="text-sm text-white">
                        {m.fullName || m.username}
                        {m.jd ? (
                          <span className="ml-2 text-xs text-zinc-500">
                            {m.jd}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))
              )}
            </ul>
            {actionError ? (
              <p className="mt-3 text-sm text-red-400" role="alert">
                {actionError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReassignTarget(null)}
                className="rounded-lg border border-zinc-600 px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  reassignMutation.isPending || selectedIds.length === 0
                }
                onClick={() =>
                  reassignMutation.mutate({
                    leadId: reassignTarget._id,
                    techIds: selectedIds,
                  })
                }
                className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
              >
                {reassignMutation.isPending ? 'Saving…' : 'Confirm Team'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </TechHeadShell>
  );
}
