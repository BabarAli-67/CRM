import DepartmentShell from '../department/DepartmentShell.jsx';

const NAV_ITEMS = [
  { to: '/dashboard/cst-manager', label: 'Attendance', end: true },
  { to: '/dashboard/cst-manager/handover', label: 'Handover Queue' },
];

export default function CstManagerShell({ title, children }) {
  return (
    <DepartmentShell
      title={title}
      roleLabel="CST Manager"
      navItems={NAV_ITEMS}
    >
      {children}
    </DepartmentShell>
  );
}
