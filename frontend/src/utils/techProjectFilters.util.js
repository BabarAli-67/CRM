import { resolveClientOpsStatus } from './opsStatus.util.js';
import { resolveProjectNumber } from './projectNumber.util.js';

/** Standard service filter options for Tech Head / Tech Team lists. */
export const TECH_SERVICE_FILTER_OPTIONS = [
  'Website Development',
  'SEO',
  'Web SEO',
  'Citation Pages',
  'Social Media',
  'Website',
  'Others',
];

export const TECH_PROJECT_STATUS_OPTIONS = [
  { value: 'assigned', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'ongoing_seo', label: 'Ongoing (SEO)' },
  { value: 'completed', label: 'Completed' },
];

/** Active Assigned Projects board (Completed lives on its own tab). */
export const TECH_LIVE_STATUS_OPTIONS = TECH_PROJECT_STATUS_OPTIONS.filter(
  (opt) => opt.value !== 'completed'
);

export const CLIENT_OPS_FILTER_OPTIONS = [
  'Running',
  'Paused',
  'Stopped / Out',
];

/** YYYY-MM-DD in Asia/Karachi for comparing against <input type="date">. */
export const pktDateKey = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
};

const haystack = (...parts) =>
  parts
    .map((p) => String(p || '').toLowerCase())
    .filter(Boolean)
    .join(' ');

export const matchesTechSearch = (lead, query) => {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return true;

  const projectNum = resolveProjectNumber(lead);
  const asProjectQuery = q.replace(/^#/, '');
  if (/^\d+$/.test(asProjectQuery)) {
    if (projectNum != null && String(projectNum) === asProjectQuery) {
      return true;
    }
  }

  return haystack(
    lead?.businessName,
    lead?.serviceAreas,
    lead?.servicesOffered,
    lead?.socialLinks
  ).includes(q);
};

export const matchesTechService = (lead, service) => {
  const needle = String(service || '')
    .trim()
    .toLowerCase();
  if (!needle) return true;

  const offered = String(lead?.servicesOffered || '').toLowerCase();
  if (offered.includes(needle)) return true;

  const upsells = Array.isArray(lead?.upsells) ? lead.upsells : [];
  for (const row of upsells) {
    const blob = haystack(row?.title, row?.service, row?.serviceOther);
    if (blob.includes(needle)) return true;
  }
  return false;
};

export const matchesOnboardedDate = (lead, ymd) => {
  if (!ymd) return true;
  return pktDateKey(lead?.handover?.onboardedAt) === ymd;
};

export const getTechProjectStatusKey = (lead) =>
  lead?.handover?.techStatus || lead?.handover?.cstStatus || null;

export const matchesProjectStatus = (lead, statusKey) => {
  if (!statusKey) return true;
  return getTechProjectStatusKey(lead) === statusKey;
};

export const matchesClientOpsStatus = (lead, opsStatus) => {
  if (!opsStatus) return true;
  return resolveClientOpsStatus(lead?.handover) === opsStatus;
};

/** Combined project + client ops status for Assigned Projects dropdown. */
export const matchesAssignedStatusFilter = (lead, filterValue) => {
  if (!filterValue) return true;
  if (
    filterValue === 'Running' ||
    filterValue === 'Paused' ||
    filterValue === 'Stopped / Out'
  ) {
    return matchesClientOpsStatus(lead, filterValue);
  }
  return matchesProjectStatus(lead, filterValue);
};

export const matchesAssignedSpecialist = (lead, specialistId) => {
  if (!specialistId) return true;
  const ids = [];
  const multi = lead?.handover?.assignedTechIds;
  if (Array.isArray(multi)) {
    for (const t of multi) {
      const id = typeof t === 'object' ? t?._id : t;
      if (id) ids.push(String(id));
    }
  }
  const legacy = lead?.handover?.assignedTechId;
  if (legacy) {
    const id = typeof legacy === 'object' ? legacy?._id : legacy;
    if (id) ids.push(String(id));
  }
  return ids.includes(String(specialistId));
};
