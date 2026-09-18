import AttendanceHistory from '../components/AttendanceHistory.component.jsx';
import DockedChatWindowsHost from '../components/DockedChatWindowsHost.component.jsx';
import MessengerIcon from '../components/MessengerIcon.component.jsx';
import TechTeamShell from '../components/tech-team/TechTeamShell.jsx';

export default function TechTeamDashboardPage() {
  return (
    <>
      <div className="fixed right-4 top-4 z-40 flex flex-col items-end gap-2">
        <MessengerIcon />
        <DockedChatWindowsHost />
      </div>
      <TechTeamShell title="Attendance">
        <AttendanceHistory />
      </TechTeamShell>
    </>
  );
}
