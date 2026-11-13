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

export const handLeadToCloser = async (id) => {
  const response = await api.patch(`/leads/${id}/hand-to-closer`);
  return response.data.data.lead;
};

export const getCloserClosedSales = async () => {
  const response = await api.get('/leads/closer-closed');
  return response.data.data.leads;
};

/** Closer — disqualified leads assigned to them. */
export const getCloserDisqualifiedLeads = async () => {
  const response = await api.get('/leads/closer-disqualified');
  return response.data.data.leads;
};

/** Closer — agents who tagged leads/callbacks to this closer. */
export const getCloserTeamAgents = async () => {
  const response = await api.get('/leads/closer-team');
  return response.data.data.agents;
};

/** Permanently delete a disqualified lead. */
export const deleteLeadPermanently = async (id) => {
  const response = await api.delete(`/leads/${id}`);
  return response.data.data;
};

/** Restore a disqualified lead to the Closer's active Leads tab. */
export const restoreDisqualifiedLead = async (id) => {
  const response = await api.patch(`/leads/${id}/restore`);
  return response.data.data.lead;
};

/** Sales agent — own closed sales history. */
export const getMyClosedSales = async () => {
  const response = await api.get('/leads/mine/closed');
  return response.data.data.leads;
};

export const moveLeadToCst = async (id, formData) => {
  const response = await api.patch(`/leads/${id}/move-to-cst`, formData);
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

export const closeLead = async (id, payload) => {
  const response = await api.patch(`/leads/${id}/close`, payload);
  return response.data.data;
};
