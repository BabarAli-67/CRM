import AdminConsole from '../components/AdminConsole.component.jsx';
import DockedChatWindowsHost from '../components/DockedChatWindowsHost.component.jsx';
import MessengerIcon from '../components/MessengerIcon.component.jsx';

export default function AdminDashboardPage() {
  return (
    <>
      <div className="fixed right-4 top-4 z-40 flex flex-col items-end gap-2">
        <MessengerIcon />
        <DockedChatWindowsHost />
      </div>
      <AdminConsole
        readOnly={false}
        title="Admin Dashboard — Command Center"
        subtitle="Live operations, access control, and attendance oversight"
      />
    </>
  );
}
