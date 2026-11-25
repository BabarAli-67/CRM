import api from '../config/api.config.js';

export const MOCKUP_STATUS_LABEL = {
  pending_assignment: 'Pending Assignment',
  in_progress: 'In Progress',
  ready_for_review: 'Ready for Tech Head Review',
  delivered: 'Delivered',
};

export const createMockupRequest = async (formData) => {
  const response = await api.post('/mockups', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.data.mockup;
};

export const listMyMockups = async () => {
  const response = await api.get('/mockups/mine');
  return response.data.data.mockups || [];
};

export const listTechHeadMockups = async () => {
  const response = await api.get('/mockups/tech-head');
  return response.data.data.mockups || [];
};

export const listAssignedMockups = async () => {
  const response = await api.get('/mockups/assigned');
  return response.data.data.mockups || [];
};

export const getMockupBadges = async () => {
  const response = await api.get('/mockups/badges');
  return (
    response.data.data || {
      actionable: 0,
      pendingAssignment: 0,
      readyForReview: 0,
      assignedActive: 0,
    }
  );
};

export const assignMockup = async (mockupId, techId) => {
  const response = await api.patch(`/mockups/${mockupId}/assign`, { techId });
  return response.data.data.mockup;
};

export const submitMockupUrl = async (mockupId, mockupUrl) => {
  const response = await api.patch(`/mockups/${mockupId}/submit-url`, {
    mockupUrl,
  });
  return response.data.data.mockup;
};

export const forwardMockupToSender = async (mockupId, mockupUrl) => {
  const response = await api.patch(`/mockups/${mockupId}/forward`, {
    mockupUrl,
  });
  return response.data.data.mockup;
};

export const getMockupFileUrl = (mockupId, field) =>
  `/mockups/${mockupId}/files/${field}`;
