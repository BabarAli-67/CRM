import { CalendarCheck, CircleCheckBig, PhoneCall, Users } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import DepartmentShell from '../department/DepartmentShell.jsx';

const NAV_ITEMS = [
  { to: '/dashboard/sales-agent', label: 'Attendance', end: true, icon: CalendarCheck },
  { to: '/dashboard/sales-agent/callbacks', label: 'My Callbacks', icon: PhoneCall },
  {
    to: '/dashboard/sales-agent/leads',
    label: 'My Leads',
    end: false,
    icon: Users,
  },
  {
    to: '/dashboard/sales-agent/closed-sales',
    label: 'Closed Sales',
    icon: CircleCheckBig,
  },
];

/** Attendance banner + KPI strip only on the Attendance home route. */
const isAttendanceHome = (pathname) => pathname === '/dashboard/sales-agent';

export default function SalesAgentShell({ title, children }) {
  const { pathname } = useLocation();

  return (
    <DepartmentShell
      title={title}
      navItems={NAV_ITEMS}
      showAttendanceChrome={isAttendanceHome(pathname)}
    >
      {children}
    </DepartmentShell>
  );
}
