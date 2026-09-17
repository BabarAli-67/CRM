import { useNavigate } from 'react-router-dom';
import LeadForm from '../../components/leads/LeadForm.jsx';
import SalesAgentShell from '../../components/sales-agent/SalesAgentShell.jsx';

export default function LeadCreatePage() {
  const navigate = useNavigate();

  return (
    <SalesAgentShell title="New Lead">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <LeadForm
          title="Create Lead"
          onCancel={() => navigate('/dashboard/sales-agent')}
          onSaved={(lead) => {
            if (lead?._id) {
              navigate(`/dashboard/sales-agent/leads/${lead._id}/edit`, {
                replace: true,
              });
            }
          }}
        />
      </div>
    </SalesAgentShell>
  );
}
