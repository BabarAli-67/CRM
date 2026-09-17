import AttendanceHistory from '../components/AttendanceHistory.component.jsx';
import ClosedSaleCounter from '../components/dashboard/ClosedSaleCounter.jsx';
import SalesAgentShell from '../components/sales-agent/SalesAgentShell.jsx';

export default function SalesAgentDashboardPage() {
  return (
    <SalesAgentShell title="Attendance">
      <ClosedSaleCounter />
      <AttendanceHistory />
    </SalesAgentShell>
  );
}
