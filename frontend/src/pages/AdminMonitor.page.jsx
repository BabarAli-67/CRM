import AdminConsole from '../components/AdminConsole.component.jsx';
import DockedChatWindowsHost from '../components/DockedChatWindowsHost.component.jsx';
import MessengerIcon from '../components/MessengerIcon.component.jsx';

export default function AdminMonitorPage() {
  return (
    <>
      <MessengerIcon />
      <DockedChatWindowsHost />
      <AdminConsole
        readOnly={true}
        title="Admin — Read-Only System Monitor"
        subtitle="View operations and attendance without making changes"
      />
    </>
  );
}
