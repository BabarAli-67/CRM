import AttendanceHistory from '../components/AttendanceHistory.component.jsx';
import DockedChatWindowsHost from '../components/DockedChatWindowsHost.component.jsx';
import MessengerIcon from '../components/MessengerIcon.component.jsx';
import CstManagerShell from '../components/cst-manager/CstManagerShell.jsx';

export default function CstManagerDashboardPage() {
  return (
    <>
      <div className="fixed right-4 top-4 z-40 flex flex-col items-end gap-2">
        <MessengerIcon />
        <DockedChatWindowsHost />
      </div>
      <CstManagerShell title="Attendance">
        <AttendanceHistory />
      </CstManagerShell>
    </>
  );
}
