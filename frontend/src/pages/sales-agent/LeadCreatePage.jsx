import { useNavigate } from 'react-router-dom';
import LeadForm from '../../components/leads/LeadForm.jsx';
import SalesAgentShell from '../../components/sales-agent/SalesAgentShell.jsx';

export default function LeadCreatePage() {
  const navigate = useNavigate();

  return (
    <SalesAgentShell title="New Lead">
      <div className="w-full rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-6 shadow-xl">
        <LeadForm
          title="Create Lead"
          onCancel={() => navigate('/dashboard/sales-agent/leads')}
          onSaved={(_lead, meta) => {
            navigate('/dashboard/sales-agent/leads', {
              replace: true,
              state: {
                toast:
                  meta?.toastMessage ||
                  (meta?.sentToPool
                    ? 'Lead sent to closer pool.'
                    : 'Lead created.'),
              },
            });
          }}
        />
      </div>
    </SalesAgentShell>
  );
}
