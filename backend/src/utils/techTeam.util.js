import { emitToUser } from '../sockets/ioInstance.util.js';

/** Shared Tech Department constants + assignment helpers. */

export const TECH_JD_OPTIONS = [
  'Developer',
  'Content Writer',
  'SEO Expert',
  'Social Media Manager',
  'Graphic Designer',
  'Intern',
];

export const MENTOR_JD_OPTIONS = TECH_JD_OPTIONS.filter((jd) => jd !== 'Intern');

/**
 * Effective specialization for Tech workspace UI / SEO tools.
 * Interns inherit their supervisor's jd when available.
 */
export const resolveTechWorkspaceJd = (user) => {
  if (!user || user.role !== 'tech_team') return null;
  const own = String(user.jd || '').trim();
  if (own && own !== 'Intern' && TECH_JD_OPTIONS.includes(own)) {
    return own;
  }
  const mentor = user.assignedMentorId;
  const mentorJd =
    mentor && typeof mentor === 'object'
      ? String(mentor.jd || '').trim()
      : '';
  if (mentorJd && mentorJd !== 'Intern' && TECH_JD_OPTIONS.includes(mentorJd)) {
    return mentorJd;
  }
  return own || null;
};

export const canUseSeoPortfolioTools = (user) => {
  if (!user) return false;
  if (user.role === 'tech_head' || user.role === 'cst_manager') return true;
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  return resolveTechWorkspaceJd(user) === 'SEO Expert';
};

export const refId = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

/** All specialist user ids on a lead (multi-assign + legacy single). */
export const getAssignedTechIdList = (lead) => {
  const ids = [];
  const multi = lead?.handover?.assignedTechIds;
  if (Array.isArray(multi)) {
    for (const id of multi) {
      const s = refId(id);
      if (s) ids.push(s);
    }
  }
  const legacy = refId(lead?.handover?.assignedTechId);
  if (legacy && !ids.includes(legacy)) ids.push(legacy);
  return ids;
};

export const isUserAssignedTech = (lead, userId) => {
  const uid = String(userId || '');
  if (!uid) return false;
  return getAssignedTechIdList(lead).includes(uid);
};

/** Mongo clause: hide Expired clients from Tech Head / Tech Team lists. */
export const TECH_NON_EXPIRED_CLAUSE = {
  'handover.clientStatus': { $ne: 'Expired' },
};

export const isExpiredClient = (lead) =>
  String(lead?.handover?.clientStatus || lead?.clientStatus || '') ===
  'Expired';

/** True when the client brief indicates GMB and/or SEO work. */
export const leadIndicatesGmbOrSeo = (lead) => {
  const offered = String(lead?.servicesOffered || '').toLowerCase();
  const areas = String(lead?.serviceAreas || '').toLowerCase();
  const blob = `${offered} ${areas}`;
  if (
    /\bgmb\b/.test(blob) ||
    blob.includes('google my business') ||
    blob.includes('google business') ||
    /\bseo\b/.test(blob) ||
    blob.includes('search engine')
  ) {
    return true;
  }
  if (String(lead?.gmbLink || '').trim()) return true;
  const gmbOps = lead?.handover?.gmbOpsStatus;
  if (gmbOps && gmbOps !== 'Not Applicable') return true;
  return false;
};

/** True when the client includes a website build (Developer) scope. */
export const leadIncludesWebsiteDevelopment = (lead) => {
  const blob = `${String(lead?.servicesOffered || '')} ${String(
    lead?.serviceAreas || ''
  )}`.toLowerCase();
  if (blob.includes('website development')) return true;
  if (blob.includes('web development')) return true;
  if (blob.includes('website') && blob.includes('develop')) return true;
  // Upsell titles
  const ledger = Array.isArray(lead?.handover?.upsellLedger)
    ? lead.handover.upsellLedger
    : Array.isArray(lead?.upsells)
      ? lead.upsells
      : [];
  for (const row of ledger) {
    const rowBlob = `${row?.title || ''} ${row?.service || ''} ${
      row?.serviceOther || ''
    }`.toLowerCase();
    if (
      rowBlob.includes('website development') ||
      rowBlob.includes('web development')
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Collect effective JDs of currently assigned Tech specialists.
 * Prefers populated user docs (`jd` / Intern mentor inheritance).
 */
export const getAssignedTechJdSet = (lead) => {
  const jds = new Set();
  const addUser = (u) => {
    if (!u || typeof u !== 'object') return;
    const effective =
      resolveTechWorkspaceJd({ ...u, role: u.role || 'tech_team' }) ||
      String(u.jd || '').trim() ||
      null;
    if (effective) jds.add(effective);
  };
  const multi = lead?.handover?.assignedTechIds;
  if (Array.isArray(multi)) {
    for (const u of multi) addUser(u);
  }
  addUser(lead?.handover?.assignedTechId);
  return jds;
};

/**
 * Dual-assign dependency:
 * Developer + SEO Expert on the same project, and status is still
 * Pending / In Progress → SEO Expert actions stay locked.
 * Unlocks at Ongoing (SEO) / Completed, or when no Developer is assigned.
 */
export const isSeoWaitingForDeveloper = (lead) => {
  const jds = getAssignedTechJdSet(lead);
  if (!jds.has('Developer') || !jds.has('SEO Expert')) return false;
  const st = lead?.handover?.techStatus || lead?.handover?.cstStatus || '';
  return st !== 'ongoing_seo' && st !== 'completed';
};

/**
 * Ensure assigned tech refs are populated with jd (and Intern mentor) so
 * isSeoWaitingForDeveloper can resolve specialization.
 */
export const ensureAssignedTechsPopulated = async (lead, User) => {
  if (!lead?.handover || !User) return lead;
  const needsIds = Array.isArray(lead.handover.assignedTechIds)
    ? lead.handover.assignedTechIds.some(
        (u) => !u || typeof u !== 'object' || !('jd' in u)
      )
    : false;
  const legacy = lead.handover.assignedTechId;
  const needsLegacy =
    Boolean(legacy) &&
    (typeof legacy !== 'object' || !('jd' in legacy));
  if (!needsIds && !needsLegacy) return lead;
  await lead.populate([
    {
      path: 'handover.assignedTechIds',
      select: 'fullName username role jd assignedMentorId',
      populate: { path: 'assignedMentorId', select: 'jd fullName' },
    },
    {
      path: 'handover.assignedTechId',
      select: 'fullName username role jd assignedMentorId',
      populate: { path: 'assignedMentorId', select: 'jd fullName' },
    },
  ]);
  return lead;
};

export const SEO_WAITING_FOR_DEVELOPER_MSG =
  'Waiting for Developer to push to Ongoing (SEO)';

/**
 * Legacy name kept for imports — dual-assigned projects stay visible so SEO
 * can see the "Waiting for Developer…" state; pure SEO/GMB also visible.
 */
export const seoExpertCanSeeInActiveQueue = () => true;

export const commentAuthorRole = (comment) => {
  const by = comment?.createdBy;
  if (by && typeof by === 'object' && by.role) return by.role;
  return null;
};

export const isTechForwardHandoffComment = (comment) =>
  /^\[Forwarded from CST/i.test(String(comment?.body || '').trim());

/**
 * Resolve comment lane. Explicit `visibility` wins; legacy rows are inferred.
 * - cst: CST ↔ Tech Head only
 * - tech: Tech Head ↔ specialists (incl. forwards)
 * - both: visible on both lanes
 */
export const resolveCommentVisibility = (comment) => {
  const explicit = comment?.visibility;
  if (explicit === 'cst' || explicit === 'tech' || explicit === 'both') {
    return explicit;
  }

  const r = commentAuthorRole(comment);
  if (r === 'tech_team') return 'tech';
  if (r === 'cst_manager') return 'cst';
  if (r === 'super_admin' || r === 'admin') {
    if (isTechForwardHandoffComment(comment)) return 'tech';
    return 'cst';
  }
  if (r === 'tech_head') {
    if (isTechForwardHandoffComment(comment)) return 'tech';
    const mentions = Array.isArray(comment?.mentions) ? comment.mentions : [];
    const hasTech = mentions.some((m) => m?.role === 'tech_team');
    const hasCst = mentions.some((m) => m?.role === 'cst_manager');
    if (hasTech && hasCst) return 'both';
    if (hasTech) return 'tech';
    // Plain Tech Head replies default to the CST lane
    return 'cst';
  }
  return 'both';
};

/**
 * Department privacy filter for client project comments.
 * - CST: CST ↔ Tech Head only (never forwards / Tech Team)
 * - Tech Team: Tech Head↔Tech only (never raw CST / CST-lane Tech Head chats)
 * - Tech Head / SA / Admin: full thread
 */
export const filterCommentsForViewerRole = (comments, role) => {
  const rows = Array.isArray(comments) ? comments : [];
  if (role === 'cst_manager') {
    return rows.filter((c) => {
      if (commentAuthorRole(c) === 'tech_team') return false;
      if (isTechForwardHandoffComment(c)) return false;
      const v = resolveCommentVisibility(c);
      return v === 'cst' || v === 'both';
    });
  }
  if (role === 'tech_team') {
    return rows.filter((c) => {
      const r = commentAuthorRole(c);
      if (r === 'cst_manager') return false;
      if (r === 'tech_team') return true;
      const v = resolveCommentVisibility(c);
      return v === 'tech' || v === 'both';
    });
  }
  return rows;
};

/**
 * Strip contact + GMB + ALL financial / payment / retention data for
 * Tech Head + Tech Specialist.
 * Approved work fields only:
 * Business Name, Service Areas, Website Link, Services Offered,
 * Upsell name/notes (no pricing), Social Links.
 * Never includes: businessPhone, businessEmail, gmbLink, pricing, cards, internActivity.
 */
export const toTechSafeClient = (lead) => {
  if (!lead) return null;
  const obj = typeof lead.toObject === 'function' ? lead.toObject() : { ...lead };

  const upsells = [];
  const ledger = Array.isArray(obj.handover?.upsellLedger)
    ? obj.handover.upsellLedger
    : [];
  for (const row of ledger) {
    upsells.push({
      entryId: row.entryId,
      title: row.title || null,
      service: row.service || null,
      serviceOther: row.serviceOther || null,
      notes: row.notes || null,
      // intentionally omit amount / paymentMethod / card fields
    });
  }

  const upscale = obj.handover?.upscale;
  if (upscale?.enabled) {
    upsells.push({
      entryId: 'handover-upscale',
      title: upscale.itemName || 'Handover Upsell',
      service: null,
      serviceOther: null,
      notes: obj.handover?.upscaleNotes || null,
    });
  }

  // Strip any accidental financial keys from keyword/report rows
  const keywords = Array.isArray(obj.handover?.portfolioKeywords)
    ? obj.handover.portfolioKeywords.map((row) => ({
        keywordId: row.keywordId,
        text: row.text,
        position: row.position ?? null,
        note: row.note ?? null,
        at: row.at ?? null,
        updatedBy: row.updatedBy ?? null,
        updatedByName: row.updatedByName ?? null,
      }))
    : undefined;

  const reports = Array.isArray(obj.handover?.monthlyReports)
    ? obj.handover.monthlyReports.map((row) => ({
        reportId: row.reportId,
        title: row.title,
        reportMonth: row.reportMonth ?? null,
        originalName: row.originalName ?? null,
        storedFilename: row.storedFilename,
        mimeType: row.mimeType ?? null,
        sizeBytes: row.sizeBytes ?? null,
        relativePath: row.relativePath,
        uploadedBy: row.uploadedBy ?? null,
        uploadedByName: row.uploadedByName ?? null,
        at: row.at ?? null,
      }))
    : undefined;

  const projectNumber =
    typeof obj.handover?.projectNumber === 'number' &&
    obj.handover.projectNumber > 0
      ? obj.handover.projectNumber
      : null;

  return {
    _id: obj._id,
    businessName: obj.businessName || null,
    serviceAreas: obj.serviceAreas || null,
    websiteLink: obj.websiteLink || null,
    servicesOffered: obj.servicesOffered || null,
    socialLinks: obj.socialLinks || null,
    /** Convenience top-level mirror of handover.projectNumber (#1, #2, …). */
    projectNumber,
    upsells,
    upsellNotes: obj.handover?.upscaleNotes || null,
    handover: {
      cstStatus: obj.handover?.cstStatus || null,
      techStatus: obj.handover?.techStatus || null,
      clientOpsStatus: obj.handover?.clientOpsStatus || null,
      clientStatus: obj.handover?.clientStatus || 'Active',
      isPriority: Boolean(obj.handover?.isPriority),
      priorityAssignedAt: obj.handover?.priorityAssignedAt || null,
      developedWebsiteUrl: obj.handover?.developedWebsiteUrl || null,
      keywordsRankedConfirmation:
        obj.handover?.keywordsRankedConfirmation || null,
      gmbOpsStatus: obj.handover?.gmbOpsStatus || null,
      websiteSeoOpsStatus: obj.handover?.websiteSeoOpsStatus || null,
      projectNumber,
      onboardedAt: obj.handover?.onboardedAt || null,
      assignedAt: obj.handover?.assignedAt || null,
      completedAt: obj.handover?.completedAt || null,
      onboardingNotes: obj.handover?.onboardingNotes || null,
      assignedTechId: obj.handover?.assignedTechId || null,
      assignedTechIds: Array.isArray(obj.handover?.assignedTechIds)
        ? obj.handover.assignedTechIds
        : [],
      comments: obj.handover?.comments,
      portfolioKeywords: keywords,
      monthlyReports: reports,
      changeRequests: obj.handover?.changeRequests,
      techTaskNotes: Array.isArray(obj.handover?.techTaskNotes)
        ? obj.handover.techTaskNotes
        : [],
      // internActivity NEVER returned here — mentors must not see Tech Head mirror metadata.
    },
    unreadCommentCount: obj.unreadCommentCount,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
};

/** Notify every approved Tech Head (in-app socket). */
export const emitToAllTechHeads = async (User, event, payload) => {
  const heads = await User.find({
    role: 'tech_head',
    status: 'approved',
  }).select('_id');
  for (const h of heads) {
    emitToUser(h._id, event, payload);
  }
};

/**
 * Real-time Tech department project sync.
 * Broadcasts `tech:project-sync` to all Tech Heads + assigned specialists
 * (and optional prior assignees / actor) so open UIs refresh without reload.
 */
export const emitTechProjectSync = async (
  User,
  lead,
  {
    reason = 'update',
    actorId = null,
    alsoNotifyUserIds = [],
  } = {}
) => {
  if (!lead?._id || !User) return;

  const payload = {
    leadId: String(lead._id),
    businessName: lead.businessName || 'Client',
    projectNumber: lead.handover?.projectNumber || null,
    cstStatus: lead.handover?.cstStatus || null,
    techStatus: lead.handover?.techStatus || null,
    clientStatus: lead.handover?.clientStatus || 'Active',
    clientOpsStatus: lead.handover?.clientOpsStatus || null,
    gmbOpsStatus: lead.handover?.gmbOpsStatus || null,
    websiteSeoOpsStatus: lead.handover?.websiteSeoOpsStatus || null,
    isPriority: Boolean(lead.handover?.isPriority),
    priorityAssignedAt: lead.handover?.priorityAssignedAt || null,
    reason: String(reason || 'update'),
    at: new Date(),
  };

  await emitToAllTechHeads(User, 'tech:project-sync', payload);

  const recipientIds = new Set(getAssignedTechIdList(lead));
  for (const id of alsoNotifyUserIds || []) {
    const s = String(id || '');
    if (s) recipientIds.add(s);
  }
  if (actorId) recipientIds.add(String(actorId));

  for (const uid of recipientIds) {
    emitToUser(uid, 'tech:project-sync', payload);
  }
};

/**
 * Notify specialists (+ Tech Heads) that a project was marked / assigned as Priority.
 * Pass `notifyUserIds` to limit specialist recipients (e.g. newly assigned only).
 */
export const emitTechPriorityAlert = async (
  User,
  lead,
  { notifyUserIds = null, alsoNotifyUserIds = [], actorId = null } = {}
) => {
  if (!lead?._id || !User || !lead.handover?.isPriority) return;

  const payload = {
    leadId: String(lead._id),
    businessName: lead.businessName || 'Client',
    projectNumber: lead.handover?.projectNumber || null,
    isPriority: true,
    priorityAssignedAt: lead.handover?.priorityAssignedAt || new Date(),
    at: new Date(),
  };

  await emitToAllTechHeads(User, 'tech:priority', payload);

  const recipientIds = new Set(
    Array.isArray(notifyUserIds)
      ? notifyUserIds.map((id) => String(id || '')).filter(Boolean)
      : getAssignedTechIdList(lead)
  );
  for (const id of alsoNotifyUserIds || []) {
    const s = String(id || '');
    if (s) recipientIds.add(s);
  }
  if (actorId) recipientIds.delete(String(actorId));

  for (const uid of recipientIds) {
    emitToUser(uid, 'tech:priority', payload);
  }
};

/**
 * Developer → SEO handoff when status becomes Ongoing (SEO).
 * - Removes Developers from assignees (project leaves their My Projects)
 * - Ensures an SEO Expert is assigned (existing → single available → designated)
 * - Sets websiteSeoOpsStatus to Running
 * - Preserves projectNumber, comments, and work fields (caller does not touch them)
 *
 * @returns {{ handedOver: boolean, needsTechHeadAttention: boolean, seoAssignees: object[] }}
 */
export const applyDeveloperToSeoHandover = async (lead, actor, User) => {
  if (!lead?.handover || !actor || !User) {
    return { handedOver: false, needsTechHeadAttention: false, seoAssignees: [] };
  }

  const actorJd = resolveTechWorkspaceJd(actor);
  if (actorJd !== 'Developer') {
    return { handedOver: false, needsTechHeadAttention: false, seoAssignees: [] };
  }

  const assignedIds = getAssignedTechIdList(lead);
  const assignedUsers = assignedIds.length
    ? await User.find({
        _id: { $in: assignedIds },
        role: 'tech_team',
      }).select('_id fullName username jd')
    : [];

  const existingSeos = assignedUsers.filter((u) => u.jd === 'SEO Expert');
  // Keep every non-Developer specialist (Content, Design, SEO, …)
  const keepNonDevelopers = assignedUsers.filter((u) => u.jd !== 'Developer');

  let seoAssignees = existingSeos;
  let needsTechHeadAttention = false;

  if (seoAssignees.length === 0) {
    const pool = await User.find({
      role: 'tech_team',
      status: 'approved',
      jd: 'SEO Expert',
    })
      .select('_id fullName username jd createdAt')
      .sort({ createdAt: 1, fullName: 1 });

    if (pool.length === 0) {
      needsTechHeadAttention = true;
      seoAssignees = [];
    } else if (pool.length === 1) {
      seoAssignees = [pool[0]];
    } else {
      // Designated = earliest approved SEO; Tech Head is notified to reassign if needed
      seoAssignees = [pool[0]];
      needsTechHeadAttention = true;
    }
  }

  const nextIdSet = new Set(keepNonDevelopers.map((u) => String(u._id)));
  for (const seo of seoAssignees) {
    nextIdSet.add(String(seo._id));
  }
  const nextIds = [...nextIdSet];

  lead.handover.assignedTechIds = nextIds;
  lead.handover.assignedTechId = nextIds[0] || null;
  lead.handover.websiteSeoOpsStatus = 'Running';

  // Record developer handoff for task-history counters
  if (!Array.isArray(lead.handover.developerHandoffs)) {
    lead.handover.developerHandoffs = [];
  }
  lead.handover.developerHandoffs.push({
    developerId: actor._id,
    developerName: actor.fullName || actor.username || 'Developer',
    at: new Date(),
  });

  return {
    handedOver: true,
    needsTechHeadAttention,
    seoAssignees,
  };
};

/** Derive a unique username from an email address. */
/** Login username rules (aligned with User model). */
export const TECH_USERNAME_REGEX = /^[a-z0-9._-]{3,32}$/;

/** Trim + lowercase a username candidate. */
export const normalizeTechUsername = (raw) =>
  String(raw || '')
    .trim()
    .toLowerCase();

export const usernameFromEmail = (email) => {
  const local = String(email || '')
    .trim()
    .toLowerCase()
    .split('@')[0]
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 28);
  return local.length >= 3 ? local : `tech${Date.now().toString(36).slice(-6)}`;
};

/**
 * If actor is an Intern, append a silent Tech Head activity row.
 * Mentor / project surfaces never see a "also sent to Tech Head" flag.
 */
export const appendInternActivityIfNeeded = async ({
  lead,
  actor,
  type = 'work_log',
  summary,
  User,
}) => {
  if (!lead || !actor || actor.role !== 'tech_team' || actor.jd !== 'Intern') {
    return false;
  }
  if (!lead.handover) lead.handover = {};
  if (!Array.isArray(lead.handover.internActivity)) {
    lead.handover.internActivity = [];
  }

  let mentorName = null;
  let mentorId = refId(actor.assignedMentorId) || null;
  if (mentorId && User) {
    const mentor = await User.findById(mentorId)
      .select('fullName username')
      .lean();
    mentorName = mentor?.fullName || mentor?.username || null;
  }

  lead.handover.internActivity.push({
    activityId: `ia-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    summary: String(summary || '').trim() || 'Intern update',
    internId: actor._id,
    internName: actor.fullName || actor.username || 'Intern',
    mentorId: mentorId || undefined,
    mentorName,
    createdAt: new Date(),
  });
  return true;
};

/** Display labels for Tech project statuses. */
export const TECH_STATUS_LABEL = {
  assigned: 'Pending',
  pending: 'Pending',
  in_progress: 'In Progress',
  ongoing_seo: 'Ongoing (SEO)',
  completed: 'Completed',
  onboarded: 'Onboarded · Active',
};
