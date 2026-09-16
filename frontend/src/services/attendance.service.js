import api from '../config/api.config.js';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export const getTodayStatus = async () => {
  const response = await api.get('/attendance/today');
  return response.data.data;
};

export const checkIn = async () => {
  const response = await api.post('/attendance/check-in');
  return response.data;
};

export const submitLateRequest = async (reason) => {
  const response = await api.post('/attendance/late-request', { reason });
  return response.data;
};

export const checkOut = async () => {
  const response = await api.post('/attendance/check-out');
  return response.data;
};

export const extendShift = async () => {
  const response = await api.post('/attendance/extend');
  return response.data;
};

export const getHistory = async (month) => {
  const response = await api.get('/attendance/history', { params: { month } });
  return response.data.data.records;
};

export const getLateQueue = async () => {
  const response = await api.get('/attendance/manage/late-requests');
  return response.data.data.requests;
};

export const approveAttendance = async (id, decision) => {
  const response = await api.patch(`/attendance/manage/${id}/approve`, {
    decision,
  });
  return response.data;
};

export const forceAbsent = async (id, reason) => {
  const response = await api.patch(`/attendance/manage/${id}/force-absent`, {
    reason,
  });
  return response.data;
};

export const getGrid = async (filters) => {
  const response = await api.get('/attendance/manage/grid', { params: filters });
  return response.data.data.records;
};

export const exportGridUrl = (filters = {}) => {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return `${API_BASE}/attendance/manage/export${query ? `?${query}` : ''}`;
};
