import api from '../config/api.config.js';

export const getHandoverQueue = async () => {
  const response = await api.get('/handover/queue');
  return response.data.data.leads;
};

export const getTechPipeline = async () => {
  const response = await api.get('/handover/tech-pipeline');
  return response.data.data.leads;
};

export const getTechList = async () => {
  const response = await api.get('/handover/tech-list');
  return response.data.data.techs;
};

export const assignHandover = async (leadId, payload) => {
  const body =
    typeof payload === 'string' ? { techId: payload } : { ...payload };
  const response = await api.patch(`/handover/${leadId}/assign`, body);
  return response.data.data.lead;
};

export const getMyProjects = async () => {
  const response = await api.get('/handover/my-projects');
  return response.data.data.leads;
};

export const updateMilestone = async (leadId, milestone) => {
  const response = await api.patch(`/handover/${leadId}/milestone`, {
    milestone,
  });
  return response.data.data.lead;
};

/** Super Admin override (Phase 3.4.3) — requires overrideReason. */
export const reassignHandover = async (leadId, payload) => {
  const response = await api.patch(`/handover/${leadId}/reassign`, payload);
  return response.data.data.lead;
};
