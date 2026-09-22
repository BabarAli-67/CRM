import api from '../config/api.config.js';

export const getUsers = async (filters = {}) => {
  const response = await api.get('/users', { params: filters });
  return response.data.data.users;
};

export const getMyLeads = async () => {
  const response = await api.get('/leads/mine');
  return response.data.data.leads;
};

export const getAssignedLeads = async () => {
  const response = await api.get('/leads/assigned-to-me');
  return response.data.data.leads;
};

export const getCloserPool = async () => {
  const response = await api.get('/leads/closer-pool');
  return response.data.data.leads;
};

export const sendLeadToCloserPool = async (id) => {
  const response = await api.patch(`/leads/${id}/send-to-pool`);
  return response.data.data.lead;
};

export const claimLead = async (id) => {
  const response = await api.patch(`/leads/${id}/claim`);
  return response.data.data.lead;
};

export const getCloserClosedSales = async () => {
  const response = await api.get('/leads/closer-closed');
  return response.data.data.leads;
};

export const moveLeadToCst = async (id) => {
  const response = await api.patch(`/leads/${id}/move-to-cst`);
  return response.data.data.lead;
};

export const getLeadById = async (id) => {
  const response = await api.get(`/leads/${id}`);
  return response.data.data.lead;
};

/** Admin / super_admin — all leads (active + closed + disqualified). */
export const getAllLeads = async () => {
  const response = await api.get('/leads');
  return response.data.data.leads;
};

export const createLead = async (payload) => {
  const response = await api.post('/leads', payload);
  return response.data.data.lead;
};

export const updateLead = async (id, payload) => {
  const response = await api.patch(`/leads/${id}`, payload);
  return response.data.data.lead;
};

export const setLeadFollowUp = async (id, payload) => {
  const response = await api.patch(`/leads/${id}/follow-up`, payload);
  return response.data.data.lead;
};

export const markLeadFollowUpAlert = async (id, flags) => {
  const response = await api.patch(`/leads/${id}/follow-up/mark-alert`, flags);
  return response.data.data.lead;
};

export const disqualifyLead = async (id, disqualifiedReason) => {
  const response = await api.patch(`/leads/${id}/disqualify`, {
    disqualifiedReason,
  });
  return response.data.data.lead;
};

export const closeLead = async (id, payment) => {
  const response = await api.patch(`/leads/${id}/close`, { payment });
  return response.data.data;
};
