import AttendanceHistory from '../components/AttendanceHistory.component.jsx';
import CstManagerShell from '../components/cst-manager/CstManagerShell.jsx';

export default function CstManagerDashboardPage() {
  return (
    <CstManagerShell title="Attendance">
      <AttendanceHistory />
    </CstManagerShell>
  );
}
