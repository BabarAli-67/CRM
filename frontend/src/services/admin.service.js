import api from '../config/api.config.js';

export const getPendingUsers = async () => {
  const response = await api.get('/admin/users/pending');
  return response.data.data.users;
};

export const approveUser = async (userId, role) => {
  const response = await api.patch(`/admin/users/${userId}/approve`, { role });
  return response.data;
};

export const rejectUser = async (userId) => {
  const response = await api.patch(`/admin/users/${userId}/reject`);
  return response.data;
};

export const resetUserPassword = async (userId, newPassword) => {
  const response = await api.patch(`/admin/users/${userId}/reset-password`, {
    newPassword,
  });
  return response.data;
};

export const getAllUsers = async (filters = {}) => {
  const response = await api.get('/admin/users', { params: filters });
  return response.data.data.users;
};

export const updateUser = async (userId, payload) => {
  const response = await api.patch(`/admin/users/${userId}`, payload);
  return response.data;
};

export const deleteUser = async (userId) => {
  const response = await api.delete(`/admin/users/${userId}`);
  return response.data;
};
