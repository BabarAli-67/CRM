import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import LeadForm from '../../components/leads/LeadForm.jsx';
import SalesAgentShell from '../../components/sales-agent/SalesAgentShell.jsx';
import { leadPrefillFromCallback } from '../../utils/leadPrefillFromCallback.js';

export default function LeadCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const fromCallback = location.state?.fromCallback || null;
  const initialValues = useMemo(
    () => leadPrefillFromCallback(fromCallback),
    [fromCallback]
  );
  const isPromote = Boolean(fromCallback?._id);

  return (
    <SalesAgentShell title={isPromote ? 'Promote to Lead' : 'New Lead'}>
      <div className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl">
        <LeadForm
          title={isPromote ? 'Promote to Lead' : 'Create Lead'}
          initialValues={initialValues}
          onCancel={() =>
            navigate(
              isPromote
                ? '/dashboard/sales-agent/callbacks'
                : '/dashboard/sales-agent/leads'
            )
          }
          onSaved={(_lead, meta) => {
            queryClient.invalidateQueries({ queryKey: ['myCallbacks'] });
            queryClient.invalidateQueries({ queryKey: ['myLeads'] });
            navigate('/dashboard/sales-agent/leads', {
              replace: true,
              state: {
                toast:
                  meta?.toastMessage ||
                  (isPromote
                    ? 'Lead created from callback.'
                    : 'Lead created.'),
              },
            });
          }}
        />
      </div>
    </SalesAgentShell>
  );
}
