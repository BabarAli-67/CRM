import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import LeadForm from '../../components/leads/LeadForm.jsx';
import SalesAgentShell from '../../components/sales-agent/SalesAgentShell.jsx';
import { getLeadById } from '../../services/lead.service.js';

export default function LeadEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    data: lead,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => getLeadById(id),
    enabled: Boolean(id),
  });

  return (
    <SalesAgentShell title="Edit Lead">
      {isLoading ? (
        <p className="text-zinc-400">Loading lead…</p>
      ) : isError ? (
        <p role="alert" className="text-sm text-red-400">
          {error?.response?.data?.message || 'Failed to load lead.'}
        </p>
      ) : (
        <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
          <LeadForm
            leadId={id}
            initialValues={lead}
            title={lead?.businessName ? `Lead — ${lead.businessName}` : 'Edit Lead'}
            onCancel={() => navigate('/dashboard/sales-agent/leads')}
            onSaved={() => {
              // Stay on edit so follow-up section remains available
            }}
          />
        </div>
      )}
    </SalesAgentShell>
  );
}
