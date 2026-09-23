import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import CloserCallbackTable, {
  summarizeCloserCallbacks,
} from '../../components/callbacks/CloserCallbackTable.jsx';
import CloserScheduleCallbackModal from '../../components/callbacks/CloserScheduleCallbackModal.jsx';
import LeadDetailModal from '../../components/leads/LeadDetailModal.jsx';
import CloserShell from '../../components/closer/CloserShell.jsx';
import { getMyCloserCallbacks } from '../../services/callback.service.js';
import { getAssignedLeads, getLeadById } from '../../services/lead.service.js';

export default function CloserMyCallbacksPage() {
  const [composerOpen, setComposerOpen] = useState(false);
  const [detailLead, setDetailLead] = useState(null);

  const {
    data: callbacks = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['closerCallbacks'],
    queryFn: getMyCloserCallbacks,
    refetchInterval: 30_000,
  });

  const { data: claimedLeads = [] } = useQuery({
    queryKey: ['assignedLeads'],
    queryFn: getAssignedLeads,
  });

  const summary = useMemo(
    () => summarizeCloserCallbacks(callbacks),
    [callbacks]
  );

  const openLead = async (row) => {
    const leadId = row.leadId?._id || row.leadId;
    if (!leadId) {
      setDetailLead({
        businessName: row.businessName,
        phone: row.phone,
        notes: row.notes,
      });
      return;
    }
    try {
      const full = await getLeadById(leadId);
      setDetailLead(full);
    } catch {
      setDetailLead(row.leadId || row);
    }
  };

  return (
    <CloserShell title="My Callbacks">
      <section className="w-full space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Today's Follow-ups"
            value={summary.today}
            accent="text-sky-300"
            ring="ring-sky-500/25"
          />
          <SummaryCard
            label="Overdue"
            value={summary.overdue}
            accent="text-red-300"
            ring="ring-red-500/30"
          />
          <SummaryCard
            label="Upcoming"
            value={summary.upcoming}
            accent="text-emerald-300"
            ring="ring-emerald-500/25"
          />
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl sm:p-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-white">
                Scheduled Callbacks
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Agenda view · link a claimed lead or add a direct contact ·
                5-min + due-now chimes · also from{' '}
                <Link
                  to="/dashboard/closer/leads"
                  className="font-medium text-orange-400 hover:underline"
                >
                  Claimed Leads
                </Link>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-950/30 hover:bg-orange-500"
            >
              + Add Callback
            </button>
          </div>

          {isLoading ? (
            <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
          ) : isError ? (
            <p className="py-12 text-center text-sm text-red-400">
              {error?.response?.data?.message || 'Failed to load callbacks.'}
            </p>
          ) : (
            <CloserCallbackTable callbacks={callbacks} onOpenLead={openLead} />
          )}
        </div>
      </section>

      <CloserScheduleCallbackModal
        open={composerOpen}
        allowStandalone
        claimedLeads={claimedLeads}
        onClose={() => setComposerOpen(false)}
      />

      <LeadDetailModal
        open={Boolean(detailLead)}
        lead={detailLead}
        onClose={() => setDetailLead(null)}
      />
    </CloserShell>
  );
}

function SummaryCard({ label, value, accent, ring }) {
  return (
    <div
      className={`rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-5 py-4 ring-1 ${ring}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className={`mt-1.5 font-display text-3xl font-semibold ${accent}`}>
        {value}
      </p>
    </div>
  );
}
