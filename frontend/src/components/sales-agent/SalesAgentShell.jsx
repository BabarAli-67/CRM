import DepartmentShell from '../department/DepartmentShell.jsx';

const NAV_ITEMS = [
  { to: '/dashboard/sales-agent', label: 'Attendance', end: true },
  { to: '/dashboard/sales-agent/callbacks', label: 'My Callbacks' },
  { to: '/dashboard/sales-agent/leads', label: 'My Leads' },
  { to: '/dashboard/sales-agent/leads/new', label: 'New Lead' },
];

export default function SalesAgentShell({ title, children }) {
  return (
    <DepartmentShell title={title} navItems={NAV_ITEMS}>
      {children}
    </DepartmentShell>
  );
}
