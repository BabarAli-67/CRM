import DepartmentShell from '../department/DepartmentShell.jsx';

const NAV_ITEMS = [
  { to: '/dashboard/closer', label: 'Attendance', end: true },
  { to: '/dashboard/closer/leads', label: 'Assigned Leads' },
];

export default function CloserShell({ title, children }) {
  return (
    <DepartmentShell title={title} roleLabel="Closer" navItems={NAV_ITEMS}>
      {children}
    </DepartmentShell>
  );
}
