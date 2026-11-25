import { CalendarCheck, FolderKanban, LayoutTemplate } from 'lucide-react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import DepartmentShell from '../department/DepartmentShell.jsx';
import { getMockupBadges } from '../../services/mockup.service.js';

/** Attendance banner + KPI strip only on the Attendance home route. */
const isAttendanceHome = (pathname) => pathname === '/dashboard/tech-team';

export default function TechTeamShell({ title, children }) {
  const { pathname } = useLocation();

  const { data: mockupBadges } = useQuery({
    queryKey: ['mockupBadges'],
    queryFn: getMockupBadges,
    refetchInterval: 15_000,
  });

  const navItems = useMemo(
    () => [
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
      {
        to: '/dashboard/tech-team/mockup',
        label: 'Mockup',
        icon: LayoutTemplate,
        badge: mockupBadges?.assignedActive ?? 0,
      },
    ],
    [mockupBadges]
  );

  return (
    <DepartmentShell
      title={title}
      roleLabel="Tech Team"
      navItems={navItems}
      showAttendanceChrome={isAttendanceHome(pathname)}
    >
      {children}
    </DepartmentShell>
  );
}
