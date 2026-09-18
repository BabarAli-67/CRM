import DepartmentShell from '../department/DepartmentShell.jsx';

const NAV_ITEMS = [
  { to: '/dashboard/tech-team', label: 'Attendance', end: true },
  { to: '/dashboard/tech-team/projects', label: 'My Projects' },
];

export default function TechTeamShell({ title, children }) {
  return (
    <DepartmentShell title={title} roleLabel="Tech Team" navItems={NAV_ITEMS}>
      {children}
    </DepartmentShell>
  );
}
