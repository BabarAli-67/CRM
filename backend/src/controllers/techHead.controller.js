import { randomUUID } from 'crypto';
import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import User from '../models/user.model.js';
import Lead from '../models/lead.model.js';
import { emitToUser } from '../sockets/ioInstance.util.js';
import { getTechTeamAttendanceGrid } from '../services/attendance.service.js';
import {
  emitTechPriorityAlert,
  emitTechProjectSync,
  getAssignedTechIdList,
  isUserAssignedTech,
  leadIndicatesGmbOrSeo,
  MENTOR_JD_OPTIONS,
  TECH_JD_OPTIONS,
  TECH_CST_ACTIVE_CLAUSE,
  TECH_NON_EXPIRED_CLAUSE,
  TECH_STATUS_LABEL,
  toTechSafeClient,
  TECH_USERNAME_REGEX,
  normalizeTechUsername,
} from '../utils/techTeam.util.js';
import { ensureLeadProjectNumber } from '../utils/projectNumber.util.js';

const resolveMemberUsername = (raw) => {
  const username = normalizeTechUsername(raw);
  if (!username) {
    throw new ApiError(400, 'Username is required');
  }
  if (!TECH_USERNAME_REGEX.test(username)) {
    throw new ApiError(
      400,
      'Username must be 3–32 characters and may contain letters, numbers, dots, underscores, or hyphens'
    );
  }
  return username;
};

const TECH_ACTIVE_STATUSES = [
  'assigned',
  'in_progress',
  'ongoing_seo',
  'completed',
];

/** Live work board — excludes Completed (shown on its own tab). */
const TECH_LIVE_STATUSES = ['assigned', 'in_progress', 'ongoing_seo'];

const ASSIGNED_SPECIALIST_CLAUSE = {
  $or: [
    { 'handover.assignedTechIds.0': { $exists: true } },
    { 'handover.assignedTechId': { $ne: null } },
  ],
};

const TEAM_SAFE_SELECT =
  'fullName username email phone role status jd assignedMentorId createdAt updatedAt';

const assertMentor = async (mentorId, { allowSelfId } = {}) => {
  if (!mentorId) {
    throw new ApiError(400, 'Reports To / Mentor is required for Interns');
  }
  if (allowSelfId && String(mentorId) === String(allowSelfId)) {
    throw new ApiError(400, 'An Intern cannot report to themselves');
  }
  const mentor = await User.findById(mentorId).select(
    'role status jd fullName username'
  );
  if (
    !mentor ||
    mentor.role !== 'tech_team' ||
    mentor.status !== 'approved' ||
    !MENTOR_JD_OPTIONS.includes(mentor.jd)
  ) {
    throw new ApiError(
      400,
      'Mentor must be an approved Developer, Content Writer, SEO Expert, Social Media Manager, or Graphic Designer'
    );
  }
  return mentor;
};

const normalizeJdPayload = async ({ jd, assignedMentorId, memberId }) => {
  const nextJd = String(jd || '').trim();
  if (!TECH_JD_OPTIONS.includes(nextJd)) {
    throw new ApiError(
      400,
      `jd must be one of: ${TECH_JD_OPTIONS.join(', ')}`
    );
  }
  if (nextJd === 'Intern') {
    await assertMentor(assignedMentorId, { allowSelfId: memberId });
    return { jd: nextJd, assignedMentorId };
  }
  return { jd: nextJd, assignedMentorId: null };
};

/** GET /tech-head/team — list Tech specialists. */
export const listTechTeam = asyncHandler(async (req, res) => {
  const members = await User.find({
    role: 'tech_team',
    status: { $in: ['approved', 'pending'] },
  })
    .select(TEAM_SAFE_SELECT)
    .populate('assignedMentorId', 'fullName username jd')
    .sort({ fullName: 1 });

  res
    .status(200)
    .json(new ApiResponse(200, { members }, 'Tech team retrieved'));
});

/**
 * GET /tech-head/attendance — read-only Tech Department attendance.
 * No approve/reject; Super Admin owns attendance decisions.
 */
export const getTechTeamAttendance = asyncHandler(async (req, res) => {
  const { month, from, to, status, userId } = req.query;
  const records = await getTechTeamAttendanceGrid({
    month,
    from,
    to,
    status,
    userId,
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { records },
        'Tech team attendance retrieved'
      )
    );
});

/** POST /tech-head/team — create a Tech specialist account. */
export const createTechMember = asyncHandler(async (req, res) => {
  const {
    fullName,
    username: rawUsername,
    phone,
    email,
    password,
    jd,
    assignedMentorId,
  } = req.body;

  const name = String(fullName || '').trim();
  const username = resolveMemberUsername(rawUsername);
  const contact = String(phone || '').trim();
  const mail = String(email || '')
    .trim()
    .toLowerCase();
  const pass = String(password || '');

  if (!name) throw new ApiError(400, 'Full Name is required');
  if (!contact) throw new ApiError(400, 'Contact Number is required');
  if (!mail || !mail.includes('@')) {
    throw new ApiError(400, 'A valid Email is required');
  }
  if (pass.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }

  const { jd: nextJd, assignedMentorId: mentorId } = await normalizeJdPayload({
    jd,
    assignedMentorId,
  });

  const existingUsername = await User.findOne({ username });
  if (existingUsername) {
    throw new ApiError(409, 'A user with this username already exists');
  }

  const existingEmail = await User.findOne({ email: mail });
  if (existingEmail) {
    throw new ApiError(409, 'A user with this email already exists');
  }

  const member = await User.create({
    fullName: name,
    phone: contact,
    email: mail,
    username,
    password: pass,
    role: 'tech_team',
    requestedRole: 'tech_team',
    status: 'approved',
    isAdmin: false,
    jd: nextJd,
    assignedMentorId: mentorId || undefined,
  });

  const populated = await User.findById(member._id)
    .select(TEAM_SAFE_SELECT)
    .populate('assignedMentorId', 'fullName username jd');

  res
    .status(201)
    .json(new ApiResponse(201, { member: populated }, 'Tech member created'));
});

/** PATCH /tech-head/team/:id — edit / reassign jd & mentor. */
export const updateTechMember = asyncHandler(async (req, res) => {
  const member = await User.findById(req.params.id).select('+password');
  if (!member || member.role !== 'tech_team') {
    throw new ApiError(404, 'Tech team member not found');
  }

  const {
    fullName,
    username: rawUsername,
    phone,
    email,
    password,
    jd,
    assignedMentorId,
  } = req.body;

  if (fullName !== undefined) {
    const name = String(fullName || '').trim();
    if (!name) throw new ApiError(400, 'Full Name cannot be empty');
    member.fullName = name;
  }
  if (rawUsername !== undefined) {
    const username = resolveMemberUsername(rawUsername);
    const clash = await User.findOne({
      username,
      _id: { $ne: member._id },
    });
    if (clash) {
      throw new ApiError(409, 'A user with this username already exists');
    }
    member.username = username;
  }
  if (phone !== undefined) {
    const contact = String(phone || '').trim();
    if (!contact) throw new ApiError(400, 'Contact Number cannot be empty');
    member.phone = contact;
  }
  if (email !== undefined) {
    const mail = String(email || '')
      .trim()
      .toLowerCase();
    if (!mail || !mail.includes('@')) {
      throw new ApiError(400, 'A valid Email is required');
    }
    const clash = await User.findOne({
      email: mail,
      _id: { $ne: member._id },
    });
    if (clash) throw new ApiError(409, 'A user with this email already exists');
    member.email = mail;
  }
  if (password !== undefined && String(password).trim() !== '') {
    if (String(password).length < 8) {
      throw new ApiError(400, 'Password must be at least 8 characters');
    }
    member.password = String(password);
  }

  // Promotion / mentor change applies immediately to future updates.
  // Historical Lead.handover.internActivity rows are never rewritten or deleted.
  if (jd !== undefined) {
    const next = await normalizeJdPayload({
      jd,
      assignedMentorId:
        assignedMentorId !== undefined
          ? assignedMentorId
          : member.assignedMentorId,
      memberId: member._id,
    });
    member.jd = next.jd;
    member.assignedMentorId = next.assignedMentorId || undefined;
  } else if (assignedMentorId !== undefined && member.jd === 'Intern') {
    await assertMentor(assignedMentorId, { allowSelfId: member._id });
    member.assignedMentorId = assignedMentorId;
  }

  await member.save();

  const populated = await User.findById(member._id)
    .select(TEAM_SAFE_SELECT)
    .populate('assignedMentorId', 'fullName username jd');

  res
    .status(200)
    .json(new ApiResponse(200, { member: populated }, 'Tech member updated'));
});

/**
 * GET /tech-head/queue — onboarded clients awaiting Tech Head assignment.
 * Regular tech_team must never see these.
 */
export const getTechHeadQueue = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    stage: 'closed_sale',
    'handover.cstStatus': 'onboarded',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    $and: [
      {
        $or: [
          { 'handover.assignedTechIds': { $exists: false } },
          { 'handover.assignedTechIds': { $size: 0 } },
          { 'handover.assignedTechIds': null },
        ],
      },
      {
        $or: [
          { 'handover.assignedTechId': null },
          { 'handover.assignedTechId': { $exists: false } },
        ],
      },
    ],
  })
    .select(
      'businessName serviceAreas websiteLink servicesOffered socialLinks gmbLink handover.onboardedAt handover.onboardingNotes handover.projectNumber handover.upscale handover.upscaleNotes handover.upsellLedger handover.cstStatus handover.techStatus handover.clientOpsStatus handover.clientStatus handover.isPriority handover.priorityAssignedAt handover.gmbOpsStatus handover.websiteSeoOpsStatus createdAt updatedAt'
    )
    .sort({ 'handover.onboardedAt': 1, updatedAt: 1 });

  res.status(200).json(
    new ApiResponse(
      200,
      { leads: leads.map(toTechSafeClient) },
      'Tech Head queue retrieved'
    )
  );
});

/**
 * GET /tech-head/assigned — live assigned projects (Pending / In Progress / Ongoing SEO).
 */
export const getTechHeadAssigned = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    stage: 'closed_sale',
    'handover.cstStatus': { $in: TECH_LIVE_STATUSES },
    'handover.techStatus': { $ne: 'completed' },
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    $and: [ASSIGNED_SPECIALIST_CLAUSE],
  })
    .select(
      'businessName serviceAreas websiteLink servicesOffered socialLinks gmbLink handover createdAt updatedAt'
    )
    .populate('handover.assignedTechId', 'fullName username jd')
    .populate('handover.assignedTechIds', 'fullName username jd')
    .sort({ 'handover.assignedAt': -1 });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        leads: leads.map((lead) => {
          const client = toTechSafeClient(lead);
          const status =
            lead.handover?.techStatus || lead.handover?.cstStatus || null;
          client.statusLabel = TECH_STATUS_LABEL[status] || status;
          return client;
        }),
      },
      'Assigned projects retrieved'
    )
  );
});

/**
 * GET /tech-head/completed — Tech projects marked Completed.
 */
export const getTechHeadCompleted = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    stage: 'closed_sale',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    $and: [
      {
        $or: [
          { 'handover.techStatus': 'completed' },
          { 'handover.cstStatus': 'completed' },
        ],
      },
      ASSIGNED_SPECIALIST_CLAUSE,
    ],
  })
    .select(
      'businessName serviceAreas websiteLink servicesOffered socialLinks gmbLink handover createdAt updatedAt'
    )
    .populate('handover.assignedTechId', 'fullName username jd')
    .populate('handover.assignedTechIds', 'fullName username jd')
    .sort({ 'handover.completedAt': -1, 'handover.assignedAt': -1 });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        leads: leads.map((lead) => {
          const client = toTechSafeClient(lead);
          client.statusLabel = TECH_STATUS_LABEL.completed || 'Completed';
          return client;
        }),
      },
      'Completed projects retrieved'
    )
  );
});

/**
 * GET /tech-head/escalations — all CST comments (with or without @Tech Head).
 */
export const getCstEscalations = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    stage: 'closed_sale',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    'handover.comments.0': { $exists: true },
  })
    .select(
      'businessName handover.comments handover.techTaskNotes handover.assignedTechId handover.assignedTechIds handover.cstStatus handover.techStatus handover.projectNumber'
    )
    .populate('handover.comments.createdBy', 'fullName username role')
    .populate('handover.assignedTechId', 'fullName username jd')
    .populate('handover.assignedTechIds', 'fullName username jd')
    .sort({ updatedAt: -1 })
    .limit(200);

  const items = [];
  for (const lead of leads) {
    const comments = Array.isArray(lead.handover?.comments)
      ? lead.handover.comments
      : [];
    const notes = Array.isArray(lead.handover?.techTaskNotes)
      ? lead.handover.techTaskNotes
      : [];
    for (const comment of comments) {
      // CST Comments board: every CST / SA comment (Tech Team stays in Team Comments).
      const author = comment.createdBy;
      const authorRole =
        (typeof author === 'object' && author?.role) || null;
      if (
        authorRole &&
        authorRole !== 'cst_manager' &&
        authorRole !== 'super_admin'
      ) {
        continue;
      }
      const forwards = notes.filter(
        (n) => String(n.commentId) === String(comment.commentId)
      );
      items.push({
        leadId: String(lead._id),
        businessName: lead.businessName || 'Client',
        projectNumber:
          typeof lead.handover?.projectNumber === 'number' &&
          lead.handover.projectNumber > 0
            ? lead.handover.projectNumber
            : null,
        commentId: comment.commentId,
        body: comment.body,
        createdAt: comment.createdAt,
        authorName:
          (typeof author === 'object' &&
            (author?.fullName || author?.username)) ||
          'CST Manager',
        authorRole: authorRole || 'cst_manager',
        mentions: comment.mentions || [],
        forwards: forwards.map((f) => ({
          noteId: f.noteId,
          assignedToUserId: f.assignedToUserId,
          assignedToName: f.assignedToName,
          guidance: f.guidance,
          createdAt: f.createdAt,
          createdByName: f.createdByName,
        })),
        assignees: getAssignedTechIdList(lead).map((id) => {
          const multi = Array.isArray(lead.handover?.assignedTechIds)
            ? lead.handover.assignedTechIds
            : [];
          const match =
            multi.find((t) => String(t._id || t) === id) ||
            (String(lead.handover?.assignedTechId?._id ||
              lead.handover?.assignedTechId) === id
              ? lead.handover.assignedTechId
              : null);
          if (match && typeof match === 'object') {
            return {
              _id: String(match._id),
              fullName: match.fullName || match.username,
              jd: match.jd || null,
            };
          }
          return { _id: id, fullName: null, jd: null };
        }),
      });
    }
  }

  items.sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );

  res.status(200).json(
    new ApiResponse(200, { items }, 'CST escalations retrieved')
  );
});

/**
 * POST /tech-head/escalations/:leadId/forward
 * Body: { commentId, assignToUserId, guidance? }
 * Delivers CST instruction into the specialist Comments thread (+ optional assign).
 */
export const forwardEscalation = asyncHandler(async (req, res) => {
  const { commentId, assignToUserId, guidance } = req.body || {};
  const cid = String(commentId || '').trim();
  const techId = String(assignToUserId || '').trim();
  if (!cid) throw new ApiError(400, 'commentId is required');
  if (!techId) throw new ApiError(400, 'assignToUserId is required');

  const tech = await User.findOne({
    _id: techId,
    role: 'tech_team',
    status: 'approved',
  }).select('fullName username jd');
  if (!tech) {
    throw new ApiError(404, 'Tech specialist not found');
  }

  const lead = await Lead.findOne({
    _id: req.params.leadId,
    stage: 'closed_sale',
  });
  if (!lead) throw new ApiError(404, 'Client not found');

  if (!lead.handover) lead.handover = {};
  const comments = Array.isArray(lead.handover.comments)
    ? lead.handover.comments
    : [];
  const comment = comments.find((c) => String(c.commentId) === cid);
  if (!comment) throw new ApiError(404, 'Comment not found');

  // Ensure specialist can open My Projects for this client
  if (!isUserAssignedTech(lead, techId)) {
    if (!Array.isArray(lead.handover.assignedTechIds)) {
      lead.handover.assignedTechIds = [];
    }
    lead.handover.assignedTechIds.push(tech._id);
    if (!lead.handover.assignedTechId) {
      lead.handover.assignedTechId = tech._id;
    }
    if (!lead.handover.assignedAt) {
      lead.handover.assignedAt = new Date();
    }
    if (
      !lead.handover.techStatus ||
      lead.handover.techStatus === 'onboarded' ||
      lead.handover.cstStatus === 'onboarded'
    ) {
      lead.handover.techStatus = 'assigned';
      if (lead.handover.cstStatus === 'onboarded') {
        lead.handover.cstStatus = 'assigned';
      }
    }
  }

  const guidanceText =
    typeof guidance === 'string' && guidance.trim()
      ? guidance.trim()
      : null;
  const specialistLabel =
    tech.fullName || tech.username || 'Specialist';
  const jdLabel = tech.jd ? ` (${tech.jd})` : '';

  let forwardBody = `[Forwarded from CST → ${specialistLabel}${jdLabel}]\n\n${String(
    comment.body || ''
  ).trim()}`;
  if (guidanceText) {
    forwardBody += `\n\n———\nInternal guidance: ${guidanceText}`;
  }

  const forwardComment = {
    commentId: randomUUID(),
    body: forwardBody,
    visibility: 'tech',
    mentions: [
      {
        userId: tech._id,
        fullName: tech.fullName || null,
        username: tech.username || null,
        role: 'tech_team',
      },
    ],
    attachments: [],
    createdAt: new Date(),
    createdBy: req.user._id,
  };
  if (!Array.isArray(lead.handover.comments)) {
    lead.handover.comments = [];
  }
  lead.handover.comments.push(forwardComment);

  if (!Array.isArray(lead.handover.commentReads)) {
    lead.handover.commentReads = [];
  }
  const authorReadIdx = lead.handover.commentReads.findIndex(
    (r) => String(r.userId) === String(req.user._id)
  );
  if (authorReadIdx >= 0) {
    lead.handover.commentReads[authorReadIdx].lastReadAt =
      forwardComment.createdAt;
  } else {
    lead.handover.commentReads.push({
      userId: req.user._id,
      lastReadAt: forwardComment.createdAt,
    });
  }

  if (!Array.isArray(lead.handover.techTaskNotes)) {
    lead.handover.techTaskNotes = [];
  }

  const note = {
    noteId: randomUUID(),
    commentId: cid,
    forwardCommentId: forwardComment.commentId,
    body: comment.body,
    guidance: guidanceText,
    assignedToUserId: tech._id,
    assignedToName: specialistLabel,
    createdBy: req.user._id,
    createdByName: req.user.fullName || req.user.username || 'Tech Head',
    createdAt: new Date(),
  };
  lead.handover.techTaskNotes.push(note);
  await lead.save();

  const businessName = lead.businessName || 'Client';
  const fromName = note.createdByName;
  const bodyPreview = String(forwardComment.body || '').slice(0, 140);

  // Primary alert: Comments thread unread + toast
  emitToUser(String(tech._id), 'client:comment-new', {
    leadId: String(lead._id),
    commentId: forwardComment.commentId,
    businessName,
    authorName: fromName,
    authorRole: 'tech_head',
    bodyPreview,
    isMention: true,
    at: forwardComment.createdAt,
  });
  emitToUser(String(tech._id), 'client:comment-mention', {
    leadId: String(lead._id),
    commentId: forwardComment.commentId,
    businessName,
    authorName: fromName,
    authorRole: 'tech_head',
    bodyPreview,
    isMention: true,
    at: forwardComment.createdAt,
  });

  // Legacy task-note event (toast routes into Comments)
  emitToUser(String(tech._id), 'tech:task-note', {
    leadId: String(lead._id),
    businessName,
    noteId: note.noteId,
    commentId: forwardComment.commentId,
    bodyPreview,
    guidance: note.guidance,
    fromName,
    at: note.createdAt,
  });

  res.status(201).json(
    new ApiResponse(
      201,
      { note, comment: forwardComment },
      'Forwarded to specialist Comments thread'
    )
  );
});

/**
 * GET /tech-head/badges — Incoming Queue + unread escalations + completed count.
 */
export const getTechHeadBadges = asyncHandler(async (req, res) => {
  const queueCount = await Lead.countDocuments({
    stage: 'closed_sale',
    'handover.cstStatus': 'onboarded',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    $and: [
      {
        $or: [
          { 'handover.assignedTechIds': { $exists: false } },
          { 'handover.assignedTechIds': { $size: 0 } },
          { 'handover.assignedTechIds': null },
        ],
      },
      {
        $or: [
          { 'handover.assignedTechId': null },
          { 'handover.assignedTechId': { $exists: false } },
        ],
      },
    ],
  });

  const completedCount = await Lead.countDocuments({
    stage: 'closed_sale',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    $and: [
      {
        $or: [
          { 'handover.techStatus': 'completed' },
          { 'handover.cstStatus': 'completed' },
        ],
      },
      ASSIGNED_SPECIALIST_CLAUSE,
    ],
  });

  const priorityCount = await Lead.countDocuments({
    stage: 'closed_sale',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    'handover.isPriority': true,
    'handover.cstStatus': {
      $in: ['onboarded', ...TECH_LIVE_STATUSES],
    },
    'handover.techStatus': { $ne: 'completed' },
  });

  // Unread = @Tech Head comments newer than this user's commentReads watermark
  const uid = String(req.user._id);
  const leads = await Lead.find({
    stage: 'closed_sale',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    'handover.comments.0': { $exists: true },
  })
    .select('handover.comments handover.commentReads')
    .populate('handover.comments.createdBy', 'role')
    .limit(200);

  let escalationUnread = 0;
  for (const lead of leads) {
    const reads = Array.isArray(lead.handover?.commentReads)
      ? lead.handover.commentReads
      : [];
    const entry = reads.find((r) => String(r.userId) === uid);
    const lastReadMs = entry?.lastReadAt
      ? new Date(entry.lastReadAt).getTime()
      : 0;
    const watermark = Number.isNaN(lastReadMs) ? 0 : lastReadMs;
    const comments = Array.isArray(lead.handover?.comments)
      ? lead.handover.comments
      : [];
    for (const c of comments) {
      const by = c.createdBy;
      const authorRole =
        by && typeof by === 'object' ? by.role : null;
      // Badge matches CST Comments board (all CST / SA comments)
      if (authorRole && authorRole !== 'cst_manager' && authorRole !== 'super_admin') {
        continue;
      }
      const at = new Date(c.createdAt || 0).getTime();
      if (!Number.isNaN(at) && at > watermark) escalationUnread += 1;
    }
  }

  // Unread Tech Team → Tech Head comments (Team Comments board; @ optional)
  let teamCommentUnread = 0;
  for (const lead of leads) {
    const reads = Array.isArray(lead.handover?.commentReads)
      ? lead.handover.commentReads
      : [];
    const entry = reads.find((r) => String(r.userId) === uid);
    const lastReadMs = entry?.lastReadAt
      ? new Date(entry.lastReadAt).getTime()
      : 0;
    const watermark = Number.isNaN(lastReadMs) ? 0 : lastReadMs;
    const comments = Array.isArray(lead.handover?.comments)
      ? lead.handover.comments
      : [];
    for (const c of comments) {
      const by = c.createdBy;
      const authorRole = by && typeof by === 'object' ? by.role : null;
      if (authorRole !== 'tech_team') continue;
      const at = new Date(c.createdAt || 0).getTime();
      if (!Number.isNaN(at) && at > watermark) teamCommentUnread += 1;
    }
  }

  res.status(200).json(
    new ApiResponse(
      200,
      {
        queueCount,
        escalationUnread,
        completedCount,
        teamCommentUnread,
        priorityCount,
      },
      'Tech Head badges retrieved'
    )
  );
});

/**
 * GET /tech-head/priority — active Priority Task board (newest priority first).
 */
export const getTechHeadPriority = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    stage: 'closed_sale',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    'handover.isPriority': true,
    'handover.cstStatus': {
      $in: ['onboarded', ...TECH_LIVE_STATUSES],
    },
    'handover.techStatus': { $ne: 'completed' },
  })
    .select(
      'businessName serviceAreas websiteLink servicesOffered socialLinks gmbLink handover createdAt updatedAt'
    )
    .populate('handover.assignedTechId', 'fullName username jd')
    .populate('handover.assignedTechIds', 'fullName username jd')
    .sort({ 'handover.priorityAssignedAt': -1, 'handover.assignedAt': -1 });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        leads: leads.map((lead) => {
          const client = toTechSafeClient(lead);
          const status =
            lead.handover?.techStatus || lead.handover?.cstStatus || null;
          client.statusLabel = TECH_STATUS_LABEL[status] || status;
          return client;
        }),
      },
      'Priority projects retrieved'
    )
  );
});

/**
 * PATCH /tech-head/clients/:id/priority — mark / unmark Priority Task.
 */
export const setClientPriority = asyncHandler(async (req, res) => {
  const wantsPriority = Boolean(req.body?.isPriority);

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    'handover.cstStatus': {
      $in: ['onboarded', ...TECH_LIVE_STATUSES, 'completed'],
    },
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found');
  }
  if (!lead.handover) lead.handover = {};

  const wasPriority = Boolean(lead.handover.isPriority);
  lead.handover.isPriority = wantsPriority;
  lead.handover.priorityAssignedAt = wantsPriority ? new Date() : null;

  await lead.save();
  await lead.populate([
    { path: 'handover.assignedTechId', select: 'fullName username jd' },
    { path: 'handover.assignedTechIds', select: 'fullName username jd' },
  ]);

  await emitTechProjectSync(User, lead, {
    reason: wantsPriority ? 'priority-on' : 'priority-off',
    actorId: req.user._id,
  });

  if (wantsPriority && !wasPriority) {
    await emitTechPriorityAlert(User, lead, { actorId: req.user._id });
  }

  const client = toTechSafeClient(lead);
  const status =
    lead.handover?.techStatus || lead.handover?.cstStatus || null;
  client.statusLabel = TECH_STATUS_LABEL[status] || status;

  res.status(200).json(
    new ApiResponse(
      200,
      { lead: client },
      wantsPriority ? 'Marked as Priority' : 'Priority removed'
    )
  );
});

/**
 * GET /tech-head/intern-activity — silent Intern → Tech Head copies.
 */
export const getInternActivity = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    stage: 'closed_sale',
    'handover.internActivity.0': { $exists: true },
  })
    .select(
      'businessName handover.internActivity handover.cstStatus handover.techStatus handover.projectNumber'
    )
    .sort({ updatedAt: -1 })
    .limit(150);

  const items = [];
  for (const lead of leads) {
    const rows = Array.isArray(lead.handover?.internActivity)
      ? lead.handover.internActivity
      : [];
    for (const row of rows) {
      const internName = row.internName || 'Intern';
      const mentorName = row.mentorName || 'Supervisor';
      items.push({
        leadId: String(lead._id),
        businessName: lead.businessName || 'Client',
        projectNumber:
          typeof lead.handover?.projectNumber === 'number' &&
          lead.handover.projectNumber > 0
            ? lead.handover.projectNumber
            : null,
        activityId: row.activityId,
        type: row.type,
        summary: row.summary,
        internId: row.internId,
        internName,
        mentorId: row.mentorId,
        mentorName,
        createdAt: row.createdAt,
        tag: `[Intern Update • ${internName} • Under ${mentorName}]`,
      });
    }
  }

  items.sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );

  res.status(200).json(
    new ApiResponse(200, { items }, 'Intern activity retrieved')
  );
});

/**
 * GET /tech-head/clients/:id — Tech-safe client work view (keywords + reports).
 */
export const getTechHeadClient = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
  })
    .select(
      'businessName serviceAreas websiteLink servicesOffered socialLinks gmbLink handover createdAt updatedAt'
    )
    .populate('handover.assignedTechId', 'fullName username jd')
    .populate('handover.assignedTechIds', 'fullName username jd')
    .populate('handover.comments.createdBy', 'fullName username role');

  if (!lead) throw new ApiError(404, 'Client not found');

  const client = toTechSafeClient(lead);
  const status =
    lead.handover?.techStatus || lead.handover?.cstStatus || null;
  client.statusLabel = TECH_STATUS_LABEL[status] || status;

  res.status(200).json(
    new ApiResponse(200, { lead: client }, 'Tech Head client retrieved')
  );
});

/**
 * GET /tech-head/team-comments — all Tech Team comments (not CST); @ optional.
 */
export const getTeamComments = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    stage: 'closed_sale',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    'handover.comments.0': { $exists: true },
  })
    .select(
      'businessName handover.comments handover.commentReads handover.assignedTechId handover.assignedTechIds handover.cstStatus handover.techStatus handover.projectNumber'
    )
    .populate('handover.comments.createdBy', 'fullName username role jd')
    .populate('handover.assignedTechId', 'fullName username jd')
    .populate('handover.assignedTechIds', 'fullName username jd')
    .sort({ updatedAt: -1 })
    .limit(200);

  const uid = String(req.user._id);
  const items = [];

  for (const lead of leads) {
    const comments = Array.isArray(lead.handover?.comments)
      ? lead.handover.comments
      : [];
    const reads = Array.isArray(lead.handover?.commentReads)
      ? lead.handover.commentReads
      : [];
    const entry = reads.find((r) => String(r.userId) === uid);
    const lastReadMs = entry?.lastReadAt
      ? new Date(entry.lastReadAt).getTime()
      : 0;
    const watermark = Number.isNaN(lastReadMs) ? 0 : lastReadMs;

    for (const comment of comments) {
      const author = comment.createdBy;
      const authorRole =
        (typeof author === 'object' && author?.role) || null;
      if (authorRole !== 'tech_team') continue;

      const at = new Date(comment.createdAt || 0).getTime();
      const unread = !Number.isNaN(at) && at > watermark;

      items.push({
        leadId: String(lead._id),
        businessName: lead.businessName || 'Client',
        projectNumber:
          typeof lead.handover?.projectNumber === 'number' &&
          lead.handover.projectNumber > 0
            ? lead.handover.projectNumber
            : null,
        commentId: comment.commentId,
        body: comment.body,
        createdAt: comment.createdAt,
        unread,
        authorName:
          (typeof author === 'object' &&
            (author?.fullName || author?.username)) ||
          'Tech',
        authorRole: 'tech_team',
        authorJd:
          (typeof author === 'object' && author?.jd) || null,
        assignees: getAssignedTechIdList(lead).map((id) => {
          const multi = Array.isArray(lead.handover?.assignedTechIds)
            ? lead.handover.assignedTechIds
            : [];
          const match =
            multi.find((t) => String(t._id || t) === id) ||
            (String(
              lead.handover?.assignedTechId?._id ||
                lead.handover?.assignedTechId
            ) === id
              ? lead.handover.assignedTechId
              : null);
          if (match && typeof match === 'object') {
            return {
              _id: String(match._id),
              fullName: match.fullName || match.username,
              jd: match.jd || null,
            };
          }
          return { _id: id, fullName: null, jd: null };
        }),
      });
    }
  }

  items.sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );

  res.status(200).json(
    new ApiResponse(200, { items }, 'Team comments retrieved')
  );
});

const CLIENT_OPS_STATUS = ['Running', 'Paused', 'Stopped / Out', 'Pending'];
const GMB_OPS_STATUS = [
  'Verified',
  'Pending Verification',
  'Suspended',
  'Not Applicable',
];
const WEBSITE_SEO_OPS_STATUS = [
  'Running',
  'In Progress',
  'Paused',
  'Completed',
  'Not Applicable',
];

/**
 * PATCH /tech-head/clients/:id/ops-status
 * Tech Head sets Client / GMB / Website SEO operational statuses.
 */
export const updateClientOpsStatus = asyncHandler(async (req, res) => {
  const {
    clientOpsStatus,
    clientStatus,
    gmbOpsStatus,
    websiteSeoOpsStatus,
  } = req.body || {};

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.cstStatus': {
      $in: [
        'onboarded',
        'assigned',
        'in_progress',
        'ongoing_seo',
        'completed',
      ],
    },
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found');
  }
  if (!lead.handover) lead.handover = {};

  let touched = false;

  if (clientOpsStatus !== undefined) {
    const next = String(clientOpsStatus || '').trim();
    if (!CLIENT_OPS_STATUS.includes(next)) {
      throw new ApiError(
        400,
        `Client Ops Status must be one of: ${CLIENT_OPS_STATUS.join(', ')}`
      );
    }
    lead.handover.clientOpsStatus = next;
    touched = true;
  }

  if (clientStatus !== undefined) {
    const next = String(clientStatus || '').trim();
    if (next !== 'Active' && next !== 'Expired') {
      throw new ApiError(400, "clientStatus must be 'Active' or 'Expired'");
    }
    lead.handover.clientStatus = next;
    touched = true;
  }

  if (gmbOpsStatus !== undefined) {
    const next = String(gmbOpsStatus || '').trim();
    if (!GMB_OPS_STATUS.includes(next)) {
      throw new ApiError(
        400,
        `GMB Status must be one of: ${GMB_OPS_STATUS.join(', ')}`
      );
    }
    lead.handover.gmbOpsStatus = next;
    touched = true;
  }

  if (websiteSeoOpsStatus !== undefined) {
    const next = String(websiteSeoOpsStatus || '').trim();
    if (!WEBSITE_SEO_OPS_STATUS.includes(next)) {
      throw new ApiError(
        400,
        `Website SEO Status must be one of: ${WEBSITE_SEO_OPS_STATUS.join(', ')}`
      );
    }
    lead.handover.websiteSeoOpsStatus = next;
    touched = true;
  }

  if (!touched) {
    throw new ApiError(400, 'Provide at least one operational status to update');
  }

  await lead.save();
  await lead.populate([
    { path: 'handover.assignedTechId', select: 'fullName username jd' },
    { path: 'handover.assignedTechIds', select: 'fullName username jd' },
  ]);

  await emitTechProjectSync(User, lead, {
    reason: 'ops-status',
    actorId: req.user._id,
  });

  const client = toTechSafeClient(lead);
  const status =
    lead.handover?.techStatus || lead.handover?.cstStatus || null;
  client.statusLabel = TECH_STATUS_LABEL[status] || status;

  res.status(200).json(
    new ApiResponse(
      200,
      { lead: client },
      'Operational statuses updated'
    )
  );
});

/**
 * PATCH /tech-head/assign/:id — Assign / reassign specialists (multi-select).
 * Body: { techIds: string[] }
 * First assign from onboarded → Pending; reassign keeps current techStatus.
 */
export const assignTeamToClient = asyncHandler(async (req, res) => {
  const rawIds = Array.isArray(req.body?.techIds)
    ? req.body.techIds
    : req.body?.techId
      ? [req.body.techId]
      : [];
  const techIds = [
    ...new Set(
      rawIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ),
  ];

  if (techIds.length === 0) {
    throw new ApiError(400, 'Select at least one Tech specialist');
  }

  const techs = await User.find({
    _id: { $in: techIds },
    role: 'tech_team',
    status: 'approved',
  }).select('_id fullName username jd');

  if (techs.length !== techIds.length) {
    throw new ApiError(
      400,
      'Every assignee must be an approved Tech team member'
    );
  }

  // Preserve tech order from the request payload
  const byId = new Map(techs.map((t) => [String(t._id), t]));
  const ordered = techIds.map((id) => byId.get(id)).filter(Boolean);

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    ...TECH_NON_EXPIRED_CLAUSE,
    ...TECH_CST_ACTIVE_CLAUSE,
    'handover.cstStatus': {
      $in: [
        'onboarded',
        'assigned',
        'in_progress',
        'ongoing_seo',
        'completed',
      ],
    },
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found for Tech assignment');
  }

  if (!lead.handover) lead.handover = {};

  // GMB / SEO work must include at least one SEO Expert
  if (leadIndicatesGmbOrSeo(lead)) {
    const hasSeo = ordered.some((t) => t.jd === 'SEO Expert');
    if (!hasSeo) {
      throw new ApiError(
        400,
        'GMB / SEO clients must be assigned to at least one SEO Expert'
      );
    }
  }

  const priorIds = getAssignedTechIdList(lead);
  const firstAssign =
    priorIds.length === 0 || lead.handover.cstStatus === 'onboarded';

  lead.handover.assignedTechIds = ordered.map((t) => t._id);
  lead.handover.assignedTechId = ordered[0]._id;

  if (firstAssign) {
    lead.handover.cstStatus = 'assigned';
    lead.handover.techStatus = 'assigned';
    lead.handover.assignedAt = new Date();
    if (!lead.handover.clientOpsStatus) {
      lead.handover.clientOpsStatus = 'Running';
    }
  }
  // Reassign / add specialists: keep status + existing keywords/reports intact

  await lead.save();
  await ensureLeadProjectNumber(lead);
  await lead.populate([
    { path: 'handover.assignedTechId', select: 'fullName username jd' },
    { path: 'handover.assignedTechIds', select: 'fullName username jd' },
  ]);

  await emitTechProjectSync(User, lead, {
    reason: firstAssign ? 'assign' : 'reassign',
    actorId: req.user._id,
    alsoNotifyUserIds: priorIds,
  });

  // CST boards: leave Onboard → Tech Status + Client → Active
  if (firstAssign) {
    const cstManagers = await User.find({
      role: 'cst_manager',
      status: 'approved',
    }).select('_id');
    const cstPayload = {
      leadId: String(lead._id),
      businessName: lead.businessName || 'Client',
      projectNumber: lead.handover?.projectNumber || null,
      cstClientState: lead.handover?.cstClientState || 'Active',
      isNonActive: Boolean(lead.handover?.isNonActive),
      cstStatus: lead.handover?.cstStatus || 'assigned',
      reason: 'tech-assigned',
      at: new Date(),
    };
    for (const u of cstManagers) {
      emitToUser(u._id, 'cst:client-state', cstPayload);
    }
  }

  // Newly assigned specialists get a Priority alert when the project is flagged
  if (lead.handover.isPriority) {
    const currentIds = getAssignedTechIdList(lead);
    const newIds = firstAssign
      ? currentIds
      : currentIds.filter((id) => !priorIds.includes(id));
    if (newIds.length) {
      await emitTechPriorityAlert(User, lead, {
        actorId: req.user._id,
        notifyUserIds: newIds,
      });
    }
  }

  res.status(200).json(
    new ApiResponse(
      200,
      { lead: toTechSafeClient(lead) },
      firstAssign
        ? 'Client assigned to Tech team'
        : 'Tech team reassigned'
    )
  );
});
