import TechHeadShell from '../components/tech-head/TechHeadShell.jsx';
import TechTeamAttendancePanel from '../components/tech-head/TechTeamAttendancePanel.jsx';

export default function TechHeadDashboardPage() {
  return (
    <TechHeadShell title="Tech Team Attendance">
      <TechTeamAttendancePanel />
    </TechHeadShell>
  );
}
