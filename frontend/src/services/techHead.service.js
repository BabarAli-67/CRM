import api from '../config/api.config.js';

export const TECH_JD_OPTIONS = [
  'Developer',
  'Content Writer',
  'SEO Expert',
  'Social Media Manager',
  'Graphic Designer',
  'Intern',
];

export const MENTOR_JD_OPTIONS = TECH_JD_OPTIONS.filter((jd) => jd !== 'Intern');

export const listTechTeam = async () => {
  const response = await api.get('/tech-head/team');
  return response.data.data.members || [];
};

/** Read-only Tech Department attendance (no approve/reject). */
export const getTechTeamAttendance = async (filters = {}) => {
  const response = await api.get('/tech-head/attendance', { params: filters });
  return response.data.data.records || [];
};

export const createTechMember = async (payload) => {
  const response = await api.post('/tech-head/team', payload);
  return response.data.data.member;
};

export const updateTechMember = async (id, payload) => {
  const response = await api.patch(`/tech-head/team/${id}`, payload);
  return response.data.data.member;
};

export const getTechHeadBadges = async () => {
  const response = await api.get('/tech-head/badges');
  return (
    response.data.data || {
      queueCount: 0,
      escalationUnread: 0,
      completedCount: 0,
      teamCommentUnread: 0,
    }
  );
};

export const getTeamComments = async () => {
  const response = await api.get('/tech-head/team-comments');
  return response.data.data.items || [];
};

export const getTechHeadQueue = async () => {
  const response = await api.get('/tech-head/queue');
  return response.data.data.leads || [];
};

export const getTechHeadAssigned = async () => {
  const response = await api.get('/tech-head/assigned');
  return response.data.data.leads || [];
};

export const getTechHeadCompleted = async () => {
  const response = await api.get('/tech-head/completed');
  return response.data.data.leads || [];
};

export const assignTeamToClient = async (leadId, techIds) => {
  const response = await api.patch(`/tech-head/assign/${leadId}`, { techIds });
  return response.data.data.lead;
};

export const getCstEscalations = async () => {
  const response = await api.get('/tech-head/escalations');
  return response.data.data.items || [];
};

export const forwardEscalation = async (
  leadId,
  { commentId, assignToUserId, guidance }
) => {
  const response = await api.post(`/tech-head/escalations/${leadId}/forward`, {
    commentId,
    assignToUserId,
    guidance: guidance || undefined,
  });
  return response.data.data.note;
};

export const getInternActivity = async () => {
  const response = await api.get('/tech-head/intern-activity');
  return response.data.data.items || [];
};

export const getTechHeadClient = async (leadId) => {
  const response = await api.get(`/tech-head/clients/${leadId}`);
  return response.data.data.lead;
};

/** Tech Head updates Client / GMB / Website SEO operational statuses. */
export const updateClientOpsStatus = async (leadId, payload) => {
  const response = await api.patch(
    `/tech-head/clients/${leadId}/ops-status`,
    payload
  );
  return response.data.data.lead;
};
