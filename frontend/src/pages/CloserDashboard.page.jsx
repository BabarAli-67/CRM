import AttendanceHistory from '../components/AttendanceHistory.component.jsx';
import ClosedSaleCounter from '../components/dashboard/ClosedSaleCounter.jsx';
import DockedChatWindowsHost from '../components/DockedChatWindowsHost.component.jsx';
import MessengerIcon from '../components/MessengerIcon.component.jsx';
import CloserShell from '../components/closer/CloserShell.jsx';

export default function CloserDashboardPage() {
  return (
    <>
      <div className="fixed right-4 top-4 z-40 flex flex-col items-end gap-2">
        <MessengerIcon />
        <DockedChatWindowsHost />
      </div>
      <CloserShell title="Attendance">
        <ClosedSaleCounter />
        <AttendanceHistory />
      </CloserShell>
    </>
  );
}
