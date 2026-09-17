import AdminConsole from '../components/AdminConsole.component.jsx';

export default function AdminDashboardPage() {
  return (
    <AdminConsole
      readOnly={false}
      title="Admin Dashboard — Command Center"
      subtitle="Live operations, access control, and attendance oversight"
    />
  );
}
