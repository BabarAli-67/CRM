import { useNavigate } from 'react-router-dom';
import LeadForm from '../../components/leads/LeadForm.jsx';
import SalesAgentShell from '../../components/sales-agent/SalesAgentShell.jsx';

export default function LeadCreatePage() {
  const navigate = useNavigate();

  return (
    <SalesAgentShell title="New Lead">
      <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 shadow-xl">
        <LeadForm
          title="Create Lead"
          onCancel={() => navigate('/dashboard/sales-agent/leads')}
          onSaved={(lead, meta) => {
            if (meta?.sentToPool) {
              navigate('/dashboard/sales-agent/leads', { replace: true });
              return;
            }
            if (lead?._id) {
              navigate('/dashboard/sales-agent/leads', { replace: true });
            }
          }}
        />
      </div>
    </SalesAgentShell>
  );
}
