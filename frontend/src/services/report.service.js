import api from '../config/api.config.js';

/** @param {{ month?: number, year?: number }} [params] */
export const getMonthlyReport = async (params = {}) => {
  const response = await api.get('/reports/monthly', { params });
  return response.data.data;
};
