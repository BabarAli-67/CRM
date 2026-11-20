import { CalendarCheck, FolderKanban } from 'lucide-react';
import DepartmentShell from '../department/DepartmentShell.jsx';

const NAV_ITEMS = [
  {
    to: '/dashboard/tech-team',
    label: 'Attendance',
    end: true,
    icon: CalendarCheck,
  },
  {
    to: '/dashboard/tech-team/projects',
    label: 'My Projects',
    end: false,
    alsoMatch: ['/dashboard/tech-team/client'],
    icon: FolderKanban,
  },
];

export default function TechTeamShell({ title, children }) {
  return (
    <DepartmentShell title={title} roleLabel="Tech Team" navItems={NAV_ITEMS}>
      {children}
    </DepartmentShell>
  );
}
