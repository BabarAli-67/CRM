import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import LeadTable from '../../components/leads/LeadTable.jsx';
import CloserShell from '../../components/closer/CloserShell.jsx';
import useAuth from '../../hooks/useAuth.hook.js';
import useReminderScheduler from '../../hooks/useReminderScheduler.js';
import {
  getAssignedLeads,
  markLeadFollowUpAlert,
} from '../../services/lead.service.js';
import { buildLeadFollowUpReminders } from '../../utils/leadReminders.js';

export default function AssignedLeadsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: leads = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['assignedLeads'],
    queryFn: getAssignedLeads,
    refetchInterval: 30_000,
  });

  const reminderItems = useMemo(
    () => buildLeadFollowUpReminders(leads, user?._id),
    [leads, user?._id]
  );

  useReminderScheduler(reminderItems, {
    markAlert: async ({ id, fiveMinFired, exactTimeFired }) => {
      await markLeadFollowUpAlert(id, {
        ...(typeof fiveMinFired === 'boolean' ? { fiveMinFired } : {}),
        ...(typeof exactTimeFired === 'boolean' ? { exactTimeFired } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ['assignedLeads'] });
    },
  });

  return (
    <CloserShell title="Assigned Leads">
      <section className="w-full rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="mb-4">
          <h2 className="font-display text-xl font-semibold text-ink">
            Leads assigned to me
          </h2>
          <p className="mt-1 text-sm text-ink/70">
            Close or disqualify deals here · closed sales vanish from this list
            · follow-up reminders chime in this tab
          </p>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-ink/60">Loading…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-red-300">
            {error?.response?.data?.message || 'Failed to load assigned leads.'}
          </p>
        ) : (
          <LeadTable
            leads={leads}
            listQueryKey={['assignedLeads']}
            emptyMessage="No leads assigned to you yet."
          />
        )}
      </section>
    </CloserShell>
  );
}
