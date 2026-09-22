import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import LeadTable from '../../components/leads/LeadTable.jsx';
import SalesAgentShell from '../../components/sales-agent/SalesAgentShell.jsx';
import { getMyLeads } from '../../services/lead.service.js';

export default function MyLeadsPage() {
  const {
    data: leads = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['myLeads'],
    queryFn: getMyLeads,
    refetchInterval: 30_000,
  });

  return (
    <SalesAgentShell title="My Leads">
      <section className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              Active leads
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Log calls fast · send ready leads to the closer pool · closed sales
              vanish from this list
            </p>
          </div>
          <Link
            to="/dashboard/sales-agent/leads/new"
            className="cursor-pointer rounded-full bg-orange-600 px-4 py-2.5 font-display text-sm font-semibold text-white shadow-lg shadow-orange-600/20 transition hover:bg-orange-500"
          >
            + New Lead
          </Link>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load leads.'}
          </p>
        ) : (
          <LeadTable
            leads={leads}
            listQueryKey={['myLeads']}
            showEdit
            emptyMessage="No active leads. Promote a callback or create a lead."
          />
        )}
      </section>
    </SalesAgentShell>
  );
}
