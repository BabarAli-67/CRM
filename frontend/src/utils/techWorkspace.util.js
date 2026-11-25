/** Tech JD → dedicated project workspace routing (Interns inherit mentor jd). */

export const resolveTechWorkspaceJd = (user) => {
  if (!user || user.role !== 'tech_team') return null;
  if (user.workspaceJd) return user.workspaceJd;
  const own = String(user.jd || '').trim();
  if (own && own !== 'Intern') return own;
  const mentor = user.assignedMentorId;
  const mentorJd =
    mentor && typeof mentor === 'object' ? String(mentor.jd || '').trim() : '';
  if (mentorJd && mentorJd !== 'Intern') return mentorJd;
  return own || null;
};

export const WORKSPACE_META = {
  'SEO Expert': {
    badge: 'SEO Workspace',
    primaryTab: 'portfolio',
    primaryLabel: 'Work & Reports',
    cardPrimaryLabel: 'Open Work & Reports',
    cardPrimaryTab: null,
  },
  Developer: {
    badge: 'Developer Workspace',
    primaryTab: 'comments',
    primaryLabel: 'Comments',
    // Mockups live in the sidebar Mockup tab — no per-project Mockup button
    cardPrimaryLabel: null,
    cardPrimaryTab: null,
  },
  'Content Writer': {
    badge: 'Content Workspace',
    primaryTab: 'workspace',
    primaryLabel: 'Content Workspace',
    cardPrimaryLabel: 'Open Workspace',
    cardPrimaryTab: 'workspace',
    notesTitle: 'Content Deliverable Notes',
    notesHint:
      'Draft briefs, article outlines, and content deliverables for this client.',
  },
  'Social Media Manager': {
    badge: 'Social Media Workspace',
    primaryTab: 'workspace',
    primaryLabel: 'Social Media Workspace',
    cardPrimaryLabel: 'Open Workspace',
    cardPrimaryTab: 'workspace',
    notesTitle: 'Social Media Task Notes',
    notesHint:
      'Campaign plans, post calendars, and social deliverables for this client.',
  },
  'Graphic Designer': {
    badge: 'Design Workspace',
    primaryTab: 'workspace',
    primaryLabel: 'Design Workspace',
    cardPrimaryLabel: 'Open Workspace',
    cardPrimaryTab: 'workspace',
    notesTitle: 'Design Deliverable Notes',
    notesHint:
      'Creative briefs, asset checklists, and design deliverables for this client.',
  },
};

export const getWorkspaceMeta = (workspaceJd) =>
  WORKSPACE_META[workspaceJd] || {
    badge: 'Tech Workspace',
    primaryTab: 'workspace',
    primaryLabel: 'Workspace',
    cardPrimaryLabel: 'Open Workspace',
    cardPrimaryTab: 'workspace',
    notesTitle: 'Task / Deliverable Notes',
    notesHint: 'Role-specific notes and deliverables for this client.',
  };

export const getClientTabsForJd = (workspaceJd) => {
  if (workspaceJd === 'SEO Expert') {
    return [
      { id: 'portfolio', label: 'Work & Reports' },
      { id: 'comments', label: 'Comments' },
    ];
  }
  if (workspaceJd === 'Developer') {
    return [{ id: 'comments', label: 'Comments' }];
  }
  const meta = getWorkspaceMeta(workspaceJd);
  return [
    { id: 'workspace', label: meta.primaryLabel },
    { id: 'comments', label: 'Comments' },
  ];
};

export const resolveClientTab = (workspaceJd, rawTab) => {
  const tabs = getClientTabsForJd(workspaceJd);
  const allowed = new Set(tabs.map((t) => t.id));
  if (rawTab && allowed.has(rawTab)) return rawTab;
  return tabs[0]?.id || 'comments';

};

export const clientPathForTab = (leadId, tabId, workspaceJd) => {
  const defaultTab = getWorkspaceMeta(workspaceJd).primaryTab;
  if (!tabId || tabId === defaultTab) {
    return `/dashboard/tech-team/client/${leadId}`;
  }
  return `/dashboard/tech-team/client/${leadId}?tab=${tabId}`;
};
