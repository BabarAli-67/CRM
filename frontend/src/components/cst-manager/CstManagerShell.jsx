import { CalendarCheck, Inbox } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import DepartmentShell from '../department/DepartmentShell.jsx';

const NAV_ITEMS = [
  {
    to: '/dashboard/cst-manager',
    label: 'Attendance',
    end: true,
    icon: CalendarCheck,
  },
  {
    to: '/dashboard/cst-manager/handover',
    label: 'Handover Queue',
    end: false,
    alsoMatch: ['/dashboard/cst-manager/client'],
    icon: Inbox,
  },
];

/** Attendance banner + KPI strip only on the Attendance home route. */
const isAttendanceHome = (pathname) => pathname === '/dashboard/cst-manager';

export default function CstManagerShell({ title, children }) {
  const { pathname } = useLocation();

  return (
    <DepartmentShell
      title={title}
      roleLabel="CST Manager"
      navItems={NAV_ITEMS}
      showAttendanceChrome={isAttendanceHome(pathname)}
    >
      {children}
    </DepartmentShell>
  );
}
