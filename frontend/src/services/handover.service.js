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

/**
 * Mark Retention Paid for the current cycle.
 * @param {string} leadId
 * @param {{ amount: number, serviceName: string, note?: string, paidAt?: string }} payload
 */
export const markRetentionPaid = async (leadId, payload) => {
  const response = await api.patch(`/handover/${leadId}/retention/paid`, {
    amount: Number(payload?.amount) || 0,
    serviceName: String(payload?.serviceName || '').trim(),
    ...(payload?.note != null ? { note: payload.note } : {}),
    ...(payload?.paidAt != null ? { paidAt: payload.paidAt } : {}),
  });
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
 * to the same payload (keywords, reports, …).
 */
export const saveClientPortfolio = async (leadId, payload) => {
  const response = await api.patch(`/handover/${leadId}/portfolio`, payload);
  return response.data.data.lead;
};

/** CST — update Base / Upsell / Total pending balances (recomputes Collected). */
export const updateClientBalances = async (leadId, payload) => {
  const response = await api.patch(`/handover/${leadId}/balances`, payload);
  return response.data.data.lead;
};

/** CST — set Document Sign Yes/No + optional signed file. */
export const updateClientSignedDocument = async (
  leadId,
  { documentSigned, file }
) => {
  const formData = new FormData();
  formData.append('documentSigned', documentSigned ? 'yes' : 'no');
  if (file) formData.append('signedDocument', file);
  const response = await api.patch(
    `/handover/${leadId}/signed-document`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data.data.lead;
};

export const clientSignedDocumentUrl = (leadId) =>
  `/handover/${leadId}/signed-document`;

/** CST Client Detail — append one upsell (+ optional new saved card). */
export const addClientUpsell = async (leadId, payload) => {
  const response = await api.post(`/handover/${leadId}/upsell`, payload);
  return response.data.data.lead;
};

/** CST / Tech — post a shared client comment with optional mentions + files. */
export const addClientComment = async (leadId, { body, mentionIds, files }) => {
  const formData = new FormData();
  formData.append('body', body || '');
  formData.append('mentions', JSON.stringify(mentionIds || []));
  for (const file of files || []) {
    formData.append('files', file);
  }
  const response = await api.post(`/handover/${leadId}/comments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.data.lead;
};

/** Mark client comments as read for the current CST / Tech user. */
export const markClientCommentsRead = async (leadId) => {
  const response = await api.patch(`/handover/${leadId}/comments/read`);
  return response.data.data;
};

/** Unread client-comment inbox for CST / Tech notification bell. */
export const getCommentNotifications = async () => {
  const response = await api.get('/handover/comment-notifications');
  return response.data.data;
};

export const clientCommentAttachmentUrl = (leadId, commentId, filename) =>
  `/handover/${leadId}/comments/${commentId}/files/${encodeURIComponent(
    filename
  )}`;

/** Deep-link to the shared Comments tab for CST / Tech Head / Tech Team. */
export const clientCommentsPath = (role, leadId) => {
  if (role === 'tech_team') {
    return `/dashboard/tech-team/client/${leadId}?tab=comments`;
  }
  if (role === 'tech_head') {
    return `/dashboard/tech-head/client/${leadId}?tab=comments`;
  }
  return `/dashboard/cst-manager/client/${leadId}?tab=comments&from=onboard`;
};

/** Tech — save live portfolio keywords.
 * Keywords are upsert-merged server-side; pass removeKeywordIds to delete. */
export const saveLivePortfolio = async (leadId, payload) => {
  const response = await api.patch(`/handover/${leadId}/live-portfolio`, payload);
  return response.data.data.lead;
};

/** Upload monthly report PDF (Tech). */
export const uploadMonthlyReport = async (
  leadId,
  { title, reportMonth, file }
) => {
  const formData = new FormData();
  formData.append('title', title || '');
  if (reportMonth) formData.append('reportMonth', reportMonth);
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
