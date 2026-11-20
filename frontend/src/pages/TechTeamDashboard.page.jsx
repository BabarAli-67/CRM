import AttendanceHistory from '../components/AttendanceHistory.component.jsx';
import TechTeamShell from '../components/tech-team/TechTeamShell.jsx';

export default function TechTeamDashboardPage() {
  return (
    <TechTeamShell title="Attendance">
      <AttendanceHistory />
    </TechTeamShell>
  );
}
