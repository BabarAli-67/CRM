import api from '../config/api.config.js';

/** Monthly closed-sale count for the current agent/closer — count only. */
export const getMyClosedCount = async () => {
  const response = await api.get('/stats/my-closed-count');
  return response.data.data.count;
};
