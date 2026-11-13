import api from '../config/api.config.js';

export const getHandoverQueue = async () => {
  const response = await api.get('/handover/queue');
  return response.data.data.leads;
};

export const getTechPipeline = async () => {
  const response = await api.get('/handover/tech-pipeline');
  return response.data.data.leads;
};

export const getTechList = async () => {
  const response = await api.get('/handover/tech-list');
  return response.data.data.techs;
};

/** Move pending_review client into the Onboard tab (no tech assign yet). */
export const markClientOnboarded = async (leadId) => {
  const response = await api.patch(`/handover/${leadId}/onboard`);
  return response.data.data.lead;
};

/** CST Client Detail — save Activation Call Yes/No (+ timestamp when Yes). */
export const setActivationCall = async (leadId, done) => {
  const response = await api.patch(`/handover/${leadId}/activation-call`, {
    done: Boolean(done),
  });
  return response.data.data.lead;
};

/** CST Client Detail — persist Onboarding Welcome Email send status. */
export const setWelcomeEmail = async (leadId, { sent, toEmail }) => {
  const response = await api.patch(`/handover/${leadId}/welcome-email`, {
    sent: Boolean(sent),
    ...(toEmail != null ? { toEmail } : {}),
  });
  return response.data.data.lead;
};

/** Active retention schedules for CST dashboard exact-time alerts. */
export const getRetentionReminders = async () => {
  const response = await api.get('/handover/retention-reminders');
  return response.data.data.leads;
};

/** Schedule / update / clear retention (pass at: null to clear). */
export const setRetention = async (leadId, at) => {
  const response = await api.patch(`/handover/${leadId}/retention`, {
    at: at == null ? null : at,
  });
  return response.data.data.lead;
};

/** Mark retention exact-time alert as fired / acknowledged. */
export const markRetentionAlert = async (leadId, { exactTimeFired }) => {
  const response = await api.patch(`/handover/${leadId}/retention/alert`, {
    exactTimeFired: Boolean(exactTimeFired),
  });
  return response.data.data.lead;
};

/** Mark retention callback done. */
export const markRetentionDone = async (leadId) => {
  const response = await api.patch(`/handover/${leadId}/retention/done`);
  return response.data.data.lead;
};

/** CST Client Detail — save Products / Services & Custom Scope. */
export const setServiceScope = async (leadId, { selected, otherNote }) => {
  const response = await api.patch(`/handover/${leadId}/service-scope`, {
    selected: Array.isArray(selected) ? selected : [],
    otherNote: otherNote ?? null,
  });
  return response.data.data.lead;
};

/**
 * CST Client Detail — unified save for all portfolio sections.
 * Pass only the sections you want to write; future sections can be added
 * to the same payload (keywords, changeRequests, …).
 */
export const saveClientPortfolio = async (leadId, payload) => {
  const response = await api.patch(`/handover/${leadId}/portfolio`, payload);
  return response.data.data.lead;
};

/** CST / Tech — save keywords + change requests (live portfolio). */
export const saveLivePortfolio = async (leadId, payload) => {
  const response = await api.patch(`/handover/${leadId}/live-portfolio`, payload);
  return response.data.data.lead;
};

/** Upload monthly report PDF (Tech). */
export const uploadMonthlyReport = async (leadId, { title, file }) => {
  const formData = new FormData();
  formData.append('title', title || '');
  formData.append('report', file);
  const response = await api.post(
    `/handover/${leadId}/monthly-reports`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data.data.lead;
};

/** Fetch monthly report PDF blob (auth). */
export const fetchMonthlyReportBlob = async (leadId, filename) => {
  const response = await api.get(
    `/handover/${leadId}/monthly-reports/${filename}`,
    { responseType: 'blob' }
  );
  return response.data;
};

/** Tech — update change request status. */
export const updateChangeRequestStatus = async (
  leadId,
  requestId,
  status
) => {
  const response = await api.patch(
    `/handover/${leadId}/change-requests/${requestId}/status`,
    { status }
  );
  return response.data.data.lead;
};

export const assignHandover = async (leadId, payload) => {
  const body =
    typeof payload === 'string' ? { techId: payload } : { ...payload };
  const response = await api.patch(`/handover/${leadId}/assign`, body);
  return response.data.data.lead;
};

export const getMyProjects = async () => {
  const response = await api.get('/handover/my-projects');
  return response.data.data.leads;
};

export const updateMilestone = async (leadId, milestone) => {
  const response = await api.patch(`/handover/${leadId}/milestone`, {
    milestone,
  });
  return response.data.data.lead;
};

/** Super Admin override (Phase 3.4.3) — requires overrideReason. */
export const reassignHandover = async (leadId, payload) => {
  const response = await api.patch(`/handover/${leadId}/reassign`, payload);
  return response.data.data.lead;
};
