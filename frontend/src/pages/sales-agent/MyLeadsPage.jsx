import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import LeadTable from '../../components/leads/LeadTable.jsx';
import SalesAgentShell from '../../components/sales-agent/SalesAgentShell.jsx';
import { getMyLeads } from '../../services/lead.service.js';

export default function MyLeadsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [toast, setToast] = useState('');

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

  useEffect(() => {
    const msg = location.state?.toast;
    if (!msg) return undefined;
    setToast(String(msg));
    navigate(location.pathname, { replace: true, state: {} });
    return undefined;
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  return (
    <SalesAgentShell title="My Leads">
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 right-6 z-[70] rounded-md border border-emerald-400/30 bg-emerald-950/95 px-4 py-2.5 text-sm font-semibold text-emerald-200 shadow-lg"
        >
          {toast}
        </div>
      ) : null}

      <section className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              Active leads
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Full intake · optional callback · send ready leads to the closer
              pool
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
