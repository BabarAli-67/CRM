import AdminConsole from '../components/AdminConsole.component.jsx';
import DockedChatWindowsHost from '../components/DockedChatWindowsHost.component.jsx';
import MessengerIcon from '../components/MessengerIcon.component.jsx';

export default function AdminDashboardPage() {
  return (
    <>
      <MessengerIcon />
      <DockedChatWindowsHost />
      <AdminConsole
        readOnly={false}
        title="Admin Dashboard — Command Center"
        subtitle="Live operations, access control, and attendance oversight"
      />
    </>
  );
}
