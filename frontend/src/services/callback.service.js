import api from '../config/api.config.js';

export const getMyCallbacks = async (includePromoted = false) => {
  const response = await api.get('/callbacks/mine', {
    params: includePromoted ? { includePromoted: 'true' } : undefined,
  });
  return response.data.data.callbacks;
};

export const createCallback = async (payload) => {
  const response = await api.post('/callbacks', payload);
  return response.data.data.callback;
};

export const updateCallback = async (id, payload) => {
  const response = await api.patch(`/callbacks/${id}`, payload);
  return response.data.data.callback;
};

export const deleteCallback = async (id) => {
  const response = await api.delete(`/callbacks/${id}`);
  return response.data;
};

export const markCallbackAlert = async (id, flags) => {
  const response = await api.patch(`/callbacks/${id}/mark-alert`, flags);
  return response.data.data.callback;
};

export const promoteCallback = async (id) => {
  const response = await api.post(`/callbacks/${id}/promote`);
  return response.data.data.lead;
};

export const getAllCallbacks = async () => {
  const response = await api.get('/callbacks');
  return response.data.data.callbacks;
};

/** Super Admin / Auditor — full audit feed with lead + assignee. */
export const getAdminCallbacks = async () => {
  const response = await api.get('/admin/callbacks');
  return response.data.data.callbacks;
};
