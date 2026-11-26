import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CstManagerShell from '../../components/cst-manager/CstManagerShell.jsx';
import CstOnboardClientCard from '../../components/cst-manager/CstOnboardClientCard.jsx';
import CstOnboardFilterBar from '../../components/cst-manager/CstOnboardFilterBar.jsx';
import {
  getCstClients,
  setCstClientState,
} from '../../services/handover.service.js';
import { pktDateKey } from '../../components/closer/CloserTableFilterBar.jsx';
import { getRetentionBadge } from '../../utils/retention.util.js';

const resolveView = (value) =>
  value === 'non-active' ? 'non-active' : 'active';

export default function CstClientsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = resolveView(searchParams.get('view'));

  const [businessFilter, setBusinessFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [retentionDate, setRetentionDate] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');

  const selectView = (next) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'non-active') p.set('view', 'non-active');
        else p.delete('view');
        return p;
      },
      { replace: true }
    );
  };

  const {
    data: activeClients = [],
    isLoading: activeLoading,
    isError: activeError,
    error: activeErr,
  } = useQuery({
    queryKey: ['cstClients', 'active'],
    queryFn: () => getCstClients('active'),
    refetchInterval: 15_000,
  });

  const {
    data: nonActiveClients = [],
    isLoading: nonActiveLoading,
    isError: nonActiveError,
    error: nonActiveErr,
  } = useQuery({
    queryKey: ['cstClients', 'non-active'],
    queryFn: () => getCstClients('non-active'),
    refetchInterval: 15_000,
  });

  const rows = view === 'non-active' ? nonActiveClients : activeClients;
  const isLoading = view === 'non-active' ? nonActiveLoading : activeLoading;
  const isError = view === 'non-active' ? nonActiveError : activeError;
  const error = view === 'non-active' ? nonActiveErr : activeErr;

  const filteredRows = useMemo(() => {
    const bizQ = businessFilter.trim().toLowerCase();
    const clientQ = clientFilter.trim().toLowerCase();
    const dateQ = retentionDate.trim();
    return rows.filter((row) => {
      if (
        bizQ &&
        !String(row.businessName || '')
          .toLowerCase()
          .includes(bizQ)
      ) {
        return false;
      }
      if (
        clientQ &&
        !String(row.clientName || '')
          .toLowerCase()
          .includes(clientQ)
      ) {
        return false;
      }
      if (dateQ) {
        const badge = getRetentionBadge(row);
        const key = badge?.at ? pktDateKey(badge.at) : '';
        if (key !== dateQ) return false;
      }
      return true;
    });
  }, [rows, businessFilter, clientFilter, retentionDate]);

  const stateMutation = useMutation({
    mutationFn: ({ leadId, cstClientState }) =>
      setCstClientState(leadId, cstClientState),
    onSuccess: (_lead, vars) => {
      setActionError('');
      setMessage(
        vars.cstClientState === 'Non-Active'
          ? 'Client moved to Non-Active.'
          : 'Client restored to Active.'
      );
      queryClient.invalidateQueries({ queryKey: ['cstClients'] });
      queryClient.invalidateQueries({ queryKey: ['cstTechPipeline'] });
      queryClient.invalidateQueries({ queryKey: ['handoverQueue'] });
    },
    onError: (err) => {
      setMessage('');
      setActionError(
        err?.response?.data?.message || 'Failed to update client state.'
      );
    },
  });

  return (
    <CstManagerShell title="Client">
      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold text-white">
            Client
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Active and Non-Active clients · same card layout as Onboard
          </p>
        </div>

        {message ? (
          <p className="mb-4 text-sm text-emerald-300" role="status">
            {message}
          </p>
        ) : null}
        {actionError ? (
          <p className="mb-4 text-sm text-red-400" role="alert">
            {actionError}
          </p>
        ) : null}

        <div
          role="tablist"
          aria-label="Client views"
          className="mb-5 flex flex-wrap gap-1 rounded-xl border border-zinc-800/80 bg-[#111111] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === 'active'}
            onClick={() => selectView('active')}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              view === 'active'
                ? 'bg-[#F25E26]/15 text-[#F25E26] ring-1 ring-[#F25E26]/40'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
            }`}
          >
            Active
            <span className="ml-1.5 text-xs opacity-80">
              ({activeClients.length})
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'non-active'}
            onClick={() => selectView('non-active')}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              view === 'non-active'
                ? 'bg-[#F25E26]/15 text-[#F25E26] ring-1 ring-[#F25E26]/40'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
            }`}
          >
            Non-Active
            <span className="ml-1.5 text-xs opacity-80">
              ({nonActiveClients.length})
            </span>
          </button>
        </div>

        <CstOnboardFilterBar
          businessName={businessFilter}
          onBusinessNameChange={setBusinessFilter}
          clientName={clientFilter}
          onClientNameChange={setClientFilter}
          retentionDate={retentionDate}
          onRetentionDateChange={setRetentionDate}
          onClear={() => {
            setBusinessFilter('');
            setClientFilter('');
            setRetentionDate('');
          }}
        />

        {isLoading ? (
          <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load clients.'}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            {view === 'non-active'
              ? 'No Non-Active clients yet.'
              : 'No Active clients yet.'}
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-zinc-500">
            No clients match these filters.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRows.map((lead) => (
              <CstOnboardClientCard
                key={lead._id}
                lead={lead}
                from={
                  view === 'non-active' ? 'clients-non-active' : 'clients'
                }
                footer={
                  view === 'non-active' ? (
                    <button
                      type="button"
                      disabled={stateMutation.isPending}
                      onClick={() =>
                        stateMutation.mutate({
                          leadId: lead._id,
                          cstClientState: 'Active',
                        })
                      }
                      className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      {stateMutation.isPending &&
                      stateMutation.variables?.leadId === lead._id
                        ? 'Restoring…'
                        : 'Restore to Active'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={stateMutation.isPending}
                      onClick={() =>
                        stateMutation.mutate({
                          leadId: lead._id,
                          cstClientState: 'Non-Active',
                        })
                      }
                      className="w-full rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {stateMutation.isPending &&
                      stateMutation.variables?.leadId === lead._id
                        ? 'Updating…'
                        : 'Mark Non-Active'}
                    </button>
                  )
                }
              />
            ))}
          </div>
        )}
      </section>
    </CstManagerShell>
  );
}
