/** Back-navigation helpers for Tech Project Detail screens. */

export const TECH_TEAM_FROM = {
  projects: {
    to: '/dashboard/tech-team/projects',
    label: 'Back to My Projects',
  },
  completed: {
    to: '/dashboard/tech-team/projects?view=completed',
    label: 'Back to Completed',
  },
  priority: {
    to: '/dashboard/tech-team/priority',
    label: 'Back to Priority Task',
  },
};

export const TECH_HEAD_FROM = {
  queue: {
    to: '/dashboard/tech-head/queue',
    label: 'Back to Incoming Queue',
  },
  assigned: {
    to: '/dashboard/tech-head/assigned',
    label: 'Back to Assigned Projects',
  },
  priority: {
    to: '/dashboard/tech-head/priority',
    label: 'Back to Priority Task',
  },
  completed: {
    to: '/dashboard/tech-head/completed',
    label: 'Back to Completed Projects',
  },
  'team-comments': {
    to: '/dashboard/tech-head/team-comments',
    label: 'Back to Team Comments',
  },
  'cst-comments': {
    to: '/dashboard/tech-head/escalations',
    label: 'Back to CST Comments',
  },
};

export const resolveTechTeamBackNav = (fromParam) =>
  TECH_TEAM_FROM[fromParam] || TECH_TEAM_FROM.projects;

export const resolveTechHeadBackNav = (fromParam) =>
  TECH_HEAD_FROM[fromParam] || TECH_HEAD_FROM.assigned;

export const techTeamClientPath = (leadId, { from, tab } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (tab) params.set('tab', tab);
  const qs = params.toString();
  return `/dashboard/tech-team/client/${leadId}${qs ? `?${qs}` : ''}`;
};

export const techHeadClientPath = (leadId, { from, tab } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (tab) params.set('tab', tab);
  const qs = params.toString();
  return `/dashboard/tech-head/client/${leadId}${qs ? `?${qs}` : ''}`;
};
