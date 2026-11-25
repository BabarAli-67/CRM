import {
  CalendarCheck,
  ClipboardList,
  LayoutTemplate,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import DepartmentShell from '../department/DepartmentShell.jsx';
import {
  getHandoverQueue,
  getTechPipeline,
} from '../../services/handover.service.js';

/** Attendance banner + KPI strip only on the Attendance home route. */
const isAttendanceHome = (pathname) => pathname === '/dashboard/cst-manager';

export default function CstManagerShell({ title, children }) {
  const { pathname } = useLocation();

  const { data: queueLeads = [] } = useQuery({
    queryKey: ['handoverQueue'],
    queryFn: getHandoverQueue,
    refetchInterval: 30_000,
  });

  const { data: techLeads = [] } = useQuery({
    queryKey: ['cstTechPipeline'],
    queryFn: getTechPipeline,
    refetchInterval: 15_000,
  });

  const counts = useMemo(() => {
    let pending = 0;
    let onboard = 0;
    for (const lead of queueLeads) {
      const status = lead?.handover?.cstStatus;
      if (status === 'pending_review') pending += 1;
      else if (status === 'onboarded') onboard += 1;
    }
    return {
      pending,
      onboard,
      tech: Array.isArray(techLeads) ? techLeads.length : 0,
    };
  }, [queueLeads, techLeads]);

  const navItems = useMemo(
    () => [
      {
        to: '/dashboard/cst-manager',
        label: 'Attendance',
        end: true,
        icon: CalendarCheck,
      },
      {
        to: '/dashboard/cst-manager/handover',
        label: 'Pending Review',
        matchTab: 'pending',
        defaultTab: 'pending',
        icon: ClipboardList,
        badge: counts.pending,
      },
      {
        to: '/dashboard/cst-manager/handover?tab=onboard',
        label: 'Onboard',
        matchTab: 'onboard',
        matchFrom: 'onboard',
        alsoMatch: ['/dashboard/cst-manager/client'],
        icon: UserCheck,
        badge: counts.onboard,
      },
      {
        to: '/dashboard/cst-manager/handover?tab=tech',
        label: 'Tech Status',
        matchTab: 'tech',
        matchFrom: 'tech',
        alsoMatch: ['/dashboard/cst-manager/client'],
        icon: Wrench,
        badge: counts.tech,
      },
      {
        to: '/dashboard/cst-manager/mockup',
        label: 'Mockup',
        icon: LayoutTemplate,
      },
    ],
    [counts]
  );

  return (
    <DepartmentShell
      title={title}
      roleLabel="CST Manager"
      navItems={navItems}
      showAttendanceChrome={isAttendanceHome(pathname)}
    >
      {children}
    </DepartmentShell>
  );
}
