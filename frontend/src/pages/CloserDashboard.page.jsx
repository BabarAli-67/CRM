import AttendanceHistory from '../components/AttendanceHistory.component.jsx';
import ClosedSaleCounter from '../components/dashboard/ClosedSaleCounter.jsx';
import CloserShell from '../components/closer/CloserShell.jsx';

export default function CloserDashboardPage() {
  return (
    <CloserShell title="Attendance">
      <ClosedSaleCounter />
      <AttendanceHistory />
    </CloserShell>
  );
}
