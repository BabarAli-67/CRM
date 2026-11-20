import api from '../config/api.config.js';

/**
 * Monthly closed-sale count for the current agent/closer — count only.
 * @param {string} [month] YYYY-MM (PKT); omit for current month
 */
export const getMyClosedCount = async (month) => {
  const response = await api.get('/stats/my-closed-count', {
    params: month ? { month } : undefined,
  });
  return response.data.data.count;
};
