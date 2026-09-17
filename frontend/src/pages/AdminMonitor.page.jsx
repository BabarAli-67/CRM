import AdminConsole from '../components/AdminConsole.component.jsx';

export default function AdminMonitorPage() {
  return (
    <AdminConsole
      readOnly={true}
      title="Admin — Read-Only System Monitor"
      subtitle="View operations and attendance without making changes"
    />
  );
}
