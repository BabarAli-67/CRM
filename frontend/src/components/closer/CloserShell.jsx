import {
  BadgeCheck,
  CalendarCheck,
  PhoneCall,
  UserX,
  Users,
  UsersRound,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import DepartmentShell from '../department/DepartmentShell.jsx';

const NAV_ITEMS = [
  { to: '/dashboard/closer', label: 'Attendance', end: true, icon: CalendarCheck },
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
  { to: '/dashboard/closer/callbacks', label: 'My Callbacks', icon: PhoneCall },
];

/** Attendance banner + KPI strip only on the Attendance home route. */
const isAttendanceHome = (pathname) => pathname === '/dashboard/closer';

export default function CloserShell({ title, children }) {
  const { pathname } = useLocation();

  return (
    <DepartmentShell
      title={title}
      roleLabel="Closer"
      navItems={NAV_ITEMS}
      showAttendanceChrome={isAttendanceHome(pathname)}
    >
      {children}
    </DepartmentShell>
  );
}
