import api from '../config/api.config.js';

export const getShift = async () => {
  const response = await api.get('/shift');
  return response.data.data;
};

export const updateShift = async (payload) => {
  const response = await api.patch('/shift', payload);
  return response.data;
};
