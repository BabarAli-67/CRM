import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import CallbackTable from '../../components/callbacks/CallbackTable.jsx';
import SalesAgentShell from '../../components/sales-agent/SalesAgentShell.jsx';
import { getMyCallbacks } from '../../services/callback.service.js';

export default function MyCallbacksPage() {
  const {
    data: callbacks = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['myCallbacks'],
    queryFn: () => getMyCallbacks(false),
    refetchInterval: 30_000,
  });

  return (
    <SalesAgentShell title="My Callbacks">
      <section className="w-full bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold text-white">
            Scheduled callbacks
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Your callback agenda · 5-min + due-now alerts chime on any tab ·
            schedule from{' '}
            <Link
              to="/dashboard/sales-agent/leads"
              className="font-medium text-orange-400 hover:text-orange-300 hover:underline"
            >
              My Leads
            </Link>
          </p>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-400">
            {error?.response?.data?.message || 'Failed to load callbacks.'}
          </p>
        ) : (
          <CallbackTable callbacks={callbacks} />
        )}
      </section>
    </SalesAgentShell>
  );
}
