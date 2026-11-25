import { useMemo } from 'react';
import {
  BadgeCheck,
  CalendarCheck,
  LayoutTemplate,
  PhoneCall,
  UserX,
  Users,
  UsersRound,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import DepartmentShell from '../department/DepartmentShell.jsx';
import { getMockupBadges } from '../../services/mockup.service.js';

/** Attendance banner + KPI strip only on the Attendance home route. */
const isAttendanceHome = (pathname) => pathname === '/dashboard/closer';

export default function CloserShell({ title, children }) {
  const { pathname } = useLocation();

  const { data: mockupBadges } = useQuery({
    queryKey: ['mockupBadges'],
    queryFn: getMockupBadges,
    refetchInterval: 15_000,
  });

  const navItems = useMemo(
    () => [
      {
        to: '/dashboard/closer',
        label: 'Attendance',
        end: true,
        icon: CalendarCheck,
      },
      {
        to: '/dashboard/closer/leads',
        label: 'Leads',
        matchTab: 'leads',
        defaultTab: 'leads',
        icon: Users,
      },
      {
        to: '/dashboard/closer/leads?tab=closed',
        label: 'Closed Sales',
        matchTab: 'closed',
        icon: BadgeCheck,
      },
      {
        to: '/dashboard/closer/leads?tab=disqualified',
        label: 'Disqualified Leads',
        matchTab: 'disqualified',
        icon: UserX,
      },
      {
        to: '/dashboard/closer/leads?tab=team',
        label: 'My Team',
        matchTab: 'team',
        icon: UsersRound,
      },
      {
        to: '/dashboard/closer/callbacks',
        label: 'My Callbacks',
        icon: PhoneCall,
      },
      {
        to: '/dashboard/closer/mockup',
        label: 'Mockup',
        icon: LayoutTemplate,
        badge: mockupBadges?.deliveredUnread ?? mockupBadges?.actionable ?? 0,
      },
    ],
    [mockupBadges]
  );

  return (
    <DepartmentShell
      title={title}
      roleLabel="Closer"
      navItems={navItems}
      showAttendanceChrome={isAttendanceHome(pathname)}
    >
      {children}
    </DepartmentShell>
  );
}
