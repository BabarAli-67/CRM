import { useMemo } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Flag,
  Inbox,
  LayoutTemplate,
  Users,
  FolderKanban,
  MessageSquare,
  MessageSquareWarning,
  UserRound,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import DepartmentShell from '../department/DepartmentShell.jsx';
import { getMockupBadges } from '../../services/mockup.service.js';
import { getTechHeadBadges } from '../../services/techHead.service.js';

export default function TechHeadShell({ title, children }) {
  const { data: badges } = useQuery({
    queryKey: ['techHeadBadges'],
    queryFn: getTechHeadBadges,
    refetchInterval: 15_000,
  });

  const { data: mockupBadges } = useQuery({
    queryKey: ['mockupBadges'],
    queryFn: getMockupBadges,
    refetchInterval: 15_000,
  });

  const navItems = useMemo(
    () => [
      {
        to: '/dashboard/tech-head',
        label: 'Tech Team Attendance',
        end: true,
        icon: CalendarCheck,
      },
      {
        to: '/dashboard/tech-head/queue',
        label: 'Incoming Queue',
        icon: Inbox,
        badge: badges?.queueCount ?? 0,
      },
      {
        to: '/dashboard/tech-head/assigned',
        label: 'Assigned Projects',
        icon: FolderKanban,
      },
      {
        to: '/dashboard/tech-head/priority',
        label: 'Priority Task',
        icon: Flag,
        badge: badges?.priorityCount ?? 0,
      },
      {
        to: '/dashboard/tech-head/completed',
        label: 'Completed Projects',
        icon: CheckCircle2,
        badge: badges?.completedCount ?? 0,
      },
      {
        to: '/dashboard/tech-head/mockup',
        label: 'Mockup',
        icon: LayoutTemplate,
        badge: mockupBadges?.actionable ?? 0,
      },
      {
        to: '/dashboard/tech-head/escalations',
        label: 'CST Comments',
        icon: MessageSquareWarning,
        badge: badges?.escalationUnread ?? 0,
      },
      {
        to: '/dashboard/tech-head/team-comments',
        label: 'Team Comments',
        icon: MessageSquare,
        badge: badges?.teamCommentUnread ?? 0,
      },
      {
        to: '/dashboard/tech-head/intern-activity',
        label: 'Intern Activity',
        icon: UserRound,
      },
      {
        to: '/dashboard/tech-head/team',
        label: 'Team Management',
        icon: Users,
      },
    ],
    [badges, mockupBadges]
  );

  return (
    <DepartmentShell
      title={title}
      roleLabel="Tech Head"
      navItems={navItems}
      /* Tech Head has no personal check-in / KPI / request-attendance chrome */
      showAttendanceChrome={false}
      showAttendancePulse={false}
    >
      {children}
    </DepartmentShell>
  );
}
