import path from 'path';
import fs from 'fs';
import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import Lead from '../models/lead.model.js';
import User from '../models/user.model.js';
import {
  appendSavedCard,
  buildSavedCardEntry,
  syncLegacyCardsIntoVault,
} from '../utils/savedCard.util.js';
import { emitToUser } from '../sockets/ioInstance.util.js';
import { randomUUID } from 'crypto';

const CHANGE_REQUEST_CATEGORIES = new Set([
  'seo',
  'web',
  'citation_pages',
  'others',
  // Legacy values still accepted on read/normalize
  'other',
  'social_media',
]);

const UPSELL_SERVICES = new Set(['seo', 'web', 'citation_pages', 'other']);
const UPSELL_PAYMENT_OPTIONS = new Set([
  'new_card',
  'old_card',
  'link',
  'others',
]);

const UPSELL_SERVICE_LABEL = {
  seo: 'SEO',
  web: 'Web',
  citation_pages: 'Citation Pages',
  other: 'Other',
};
const CHANGE_REQUEST_STATUSES = new Set([
  'pending',
  'in_progress',
  'completed',
]);

const refId = (ref) => {
  if (!ref) return null;
  if (typeof ref === 'object' && ref._id != null) return String(ref._id);
  return String(ref);
};

const normalizeKeywords = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      // Legacy plain-string keywords still supported
      if (typeof row === 'string') {
        const text = row.trim();
        if (!text) return null;
        return {
          keywordId: `kw-${index + 1}`,
          text,
          position: null,
          note: null,
          at: new Date(),
        };
      }
      if (!row || typeof row !== 'object') return null;
      const text = String(row.text || row.keyword || '').trim();
      if (!text) return null;
      const positionRaw = row.position ?? row.rank ?? null;
      const position =
        typeof positionRaw === 'string' && positionRaw.trim()
          ? positionRaw.trim()
          : positionRaw != null && positionRaw !== ''
            ? String(positionRaw).trim()
            : null;
      return {
        keywordId: String(row.keywordId || `kw-${index + 1}`).trim(),
        text,
        position,
        note:
          typeof row.note === 'string' && row.note.trim()
            ? row.note.trim()
            : null,
        at: row.at ? new Date(row.at) : new Date(),
      };
    })
    .filter(Boolean);
};

const normalizeChangeRequests = (raw, userId) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null;
      const category = String(row.category || '')
        .trim()
        .toLowerCase();
      const description = String(row.description || '').trim();
      if (!CHANGE_REQUEST_CATEGORIES.has(category) || !description) {
        return null;
      }
      const status = CHANGE_REQUEST_STATUSES.has(row.status)
        ? row.status
        : 'pending';
      return {
        requestId: String(row.requestId || `cr-${index + 1}`).trim(),
        category,
        description,
        status,
        loggedAt: row.loggedAt ? new Date(row.loggedAt) : new Date(),
        loggedBy: row.loggedBy || userId || null,
        statusUpdatedAt: row.statusUpdatedAt
          ? new Date(row.statusUpdatedAt)
          : null,
        statusUpdatedBy: row.statusUpdatedBy || null,
      };
    })
    .filter(Boolean);
};

export const getHandoverQueue = asyncHandler(async (req, res) => {
  // Pending Review + Onboard tabs share this feed; frontend filters by cstStatus
  const leads = await Lead.find({
    stage: 'closed_sale',
    'handover.cstStatus': { $in: ['pending_review', 'onboarded'] },
  })
    .select(
      'stage status clientName businessName personalPhone businessPhone businessEmail personalEmail yelpLink websiteLink gmbLink serviceAreas servicesOffered niche locationAddress leadSource salesAmount paymentOffered paymentReceived paymentPending payment savedCards handover closedAt closedBy agentId closerId notes createdAt updatedAt'
    )
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .sort({ closedAt: 1 });

  res.status(200).json(
    new ApiResponse(
      200,
      { leads: attachUnreadCommentCount(leads, req.user._id) },
      'Handover queue retrieved'
    )
  );
});

/**
 * CST moves a pending_review client into the Onboard tab (no tech assign yet).
 * Locks the automatic 30-day retention alert at closedAt + 30 days (same PKT clock).
 */
export const markClientOnboarded = asyncHandler(async (req, res) => {
  const now = new Date();

  const existing = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.cstStatus': 'pending_review',
  }).select('_id closedAt');

  if (!existing) {
    throw new ApiError(
      409,
      'This lead is no longer pending review — it may already be onboarded.'
    );
  }

  const closed = existing.closedAt ? new Date(existing.closedAt) : now;
  const closedMs = closed.getTime();
  const retentionAt = Number.isNaN(closedMs)
    ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    : new Date(closedMs + 30 * 24 * 60 * 60 * 1000);

  const lead = await Lead.findOneAndUpdate(
    {
      _id: existing._id,
      stage: 'closed_sale',
      'handover.cstStatus': 'pending_review',
    },
    {
      $set: {
        'handover.cstStatus': 'onboarded',
        'handover.onboardedAt': now,
        // Clear tech execution until Assign Tech — keeps Tech board tag as Onboarded
        'handover.techStatus': null,
        // Auto 30-day retention (exact-time only; skip 5-min early warning)
        'handover.retention.at': retentionAt,
        'handover.retention.status': 'scheduled',
        'handover.retention.alerts.fiveMinFired': true,
        'handover.retention.alerts.exactTimeFired': false,
        'handover.retention.doneAt': null,
      },
    },
    {
      new: true,
      runValidators: true,
    }
  )
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .populate({
      path: 'handover.assignedTechId',
      select: 'fullName username role',
    });

  if (!lead) {
    throw new ApiError(
      409,
      'This lead is no longer pending review — it may already be onboarded.'
    );
  }

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Client moved to Onboard'));
});

/**
 * CST Client Detail — save Activation Call Yes/No.
 * Yes → records exact timestamp (PKT display on Handover Queue).
 * No → clears timestamp. Only touches activationCall paths.
 */
export const setActivationCall = asyncHandler(async (req, res) => {
  const { done } = req.body;

  if (typeof done !== 'boolean') {
    throw new ApiError(400, 'done must be a boolean (true = Yes, false = No)');
  }

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.cstStatus': {
      $in: ['pending_review', 'onboarded', 'assigned', 'in_progress', 'completed'],
    },
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found in CST handover pipeline');
  }

  const now = new Date();
  const $set = {
    'handover.activationCall.done': done,
    'handover.activationCall.at': done ? now : null,
  };

  const updated = await Lead.findByIdAndUpdate(
    lead._id,
    { $set },
    { new: true, runValidators: true }
  )
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .populate({
      path: 'handover.assignedTechId',
      select: 'fullName username role',
    });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { lead: updated },
        done ? 'Activation Call saved as Yes' : 'Activation Call saved as No'
      )
    );
});

/**
 * CST Client Detail — record Onboarding Welcome Email send (after EmailJS success).
 * Persists sent flag, recipient, and timestamp. Only touches welcomeEmail paths.
 */
export const setWelcomeEmail = asyncHandler(async (req, res) => {
  const { sent, toEmail } = req.body;

  if (typeof sent !== 'boolean') {
    throw new ApiError(400, 'sent must be a boolean');
  }

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.cstStatus': {
      $in: ['pending_review', 'onboarded', 'assigned', 'in_progress', 'completed'],
    },
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found in CST handover pipeline');
  }

  const email =
    typeof toEmail === 'string' ? toEmail.trim().toLowerCase() : '';

  if (sent) {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError(400, 'A valid recipient email is required');
    }
  }

  const now = new Date();
  const $set = sent
    ? {
        'handover.welcomeEmail.sent': true,
        'handover.welcomeEmail.at': now,
        'handover.welcomeEmail.toEmail': email,
      }
    : {
        'handover.welcomeEmail.sent': false,
        'handover.welcomeEmail.at': null,
        'handover.welcomeEmail.toEmail': null,
      };

  const updated = await Lead.findByIdAndUpdate(
    lead._id,
    { $set },
    { new: true, runValidators: true }
  )
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .populate({
      path: 'handover.assignedTechId',
      select: 'fullName username role',
    });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { lead: updated },
        sent
          ? 'Onboarding welcome email status saved'
          : 'Onboarding welcome email cleared'
      )
    );
});

const CST_PIPELINE_STATUSES = [
  'pending_review',
  'onboarded',
  'assigned',
  'in_progress',
  'completed',
];

/** Client comments are CST Manager ↔ Tech Team only. */
const CLIENT_COMMENT_ROLES = new Set(['cst_manager', 'tech_team']);

const commentAuthorId = (comment) => {
  const by = comment?.createdBy;
  if (!by) return null;
  if (typeof by === 'object' && by._id != null) return String(by._id);
  return String(by);
};

const unreadCommentCountForUser = (lead, userId) => {
  const comments = Array.isArray(lead?.handover?.comments)
    ? lead.handover.comments
    : [];
  if (!comments.length || !userId) return 0;
  const uid = String(userId);
  const reads = Array.isArray(lead?.handover?.commentReads)
    ? lead.handover.commentReads
    : [];
  const entry = reads.find((r) => String(r.userId) === uid);
  const lastReadMs = entry?.lastReadAt
    ? new Date(entry.lastReadAt).getTime()
    : 0;
  const watermark = Number.isNaN(lastReadMs) ? 0 : lastReadMs;

  return comments.filter((c) => {
    if (commentAuthorId(c) === uid) return false;
    const at = new Date(c.createdAt || 0).getTime();
    return !Number.isNaN(at) && at > watermark;
  }).length;
};

const attachUnreadCommentCount = (leads, userId) =>
  (Array.isArray(leads) ? leads : []).map((lead) => {
    const obj = typeof lead?.toObject === 'function' ? lead.toObject() : { ...lead };
    obj.unreadCommentCount = unreadCommentCountForUser(obj, userId);
    return obj;
  });

const populateCstLead = (query) =>
  query
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .populate({
      path: 'handover.assignedTechId',
      select: 'fullName username role',
    })
    .populate({
      path: 'handover.comments.createdBy',
      select: 'fullName username role',
    });

/**
 * Active retention schedules for CST Manager dashboard alerts.
 * Exact-time only — client bridge skips the 5-minute early warning.
 */
export const getRetentionReminders = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    stage: 'closed_sale',
    // Active onboarded (or further) clients only — not Pending Review
    'handover.cstStatus': {
      $in: ['onboarded', 'assigned', 'in_progress', 'completed'],
    },
    'handover.retention.at': { $ne: null },
    'handover.retention.status': 'scheduled',
    // Still waiting for CST dismiss / mark-done (not yet acknowledged)
    $or: [
      { 'handover.retention.alerts.exactTimeFired': { $ne: true } },
      { 'handover.retention.alerts.exactTimeFired': { $exists: false } },
    ],
  })
    .select(
      'clientName businessName personalPhone businessPhone handover.retention handover.cstStatus createdAt updatedAt'
    )
    .sort({ 'handover.retention.at': 1 });

  res
    .status(200)
    .json(
      new ApiResponse(200, { leads }, 'Retention reminders retrieved')
    );
});

/**
 * CST Client Detail — schedule / update / clear retention callback.
 * Body: { at: ISO string } to save, or { at: null } to clear.
 * Always arms exact-time only (fiveMinFired=true skips early warning).
 */
export const setRetention = asyncHandler(async (req, res) => {
  const { at } = req.body;

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.cstStatus': { $in: CST_PIPELINE_STATUSES },
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found in CST handover pipeline');
  }

  let update;
  if (at === null || at === '' || at === undefined) {
    update = {
      $set: {
        'handover.retention.at': null,
        'handover.retention.alerts.fiveMinFired': true,
        'handover.retention.alerts.exactTimeFired': true,
        'handover.retention.doneAt': null,
      },
      $unset: {
        'handover.retention.status': 1,
      },
    };
  } else {
    const when = new Date(at);
    if (Number.isNaN(when.getTime())) {
      throw new ApiError(400, 'Invalid retention date/time');
    }
    const prevMs = lead.handover?.retention?.at
      ? new Date(lead.handover.retention.at).getTime()
      : null;
    const nextMs = when.getTime();
    const timeChanged = prevMs !== nextMs;
    update = {
      $set: {
        'handover.retention.at': when,
        'handover.retention.status': 'scheduled',
        // Exact-time only — never arm the 5-minute early warning
        'handover.retention.alerts.fiveMinFired': true,
        ...(timeChanged
          ? {
              'handover.retention.alerts.exactTimeFired': false,
              'handover.retention.doneAt': null,
            }
          : {}),
      },
    };
  }

  const updated = await populateCstLead(
    Lead.findByIdAndUpdate(lead._id, update, {
      new: true,
      runValidators: true,
    })
  );

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { lead: updated },
        at === null || at === '' || at === undefined
          ? 'Retention schedule cleared'
          : 'Retention schedule saved'
      )
    );
});

/**
 * Persist retention exact-time alert flag (fires once; dismiss / OK also calls this).
 */
export const markRetentionAlert = asyncHandler(async (req, res) => {
  const { exactTimeFired } = req.body;

  if (typeof exactTimeFired !== 'boolean') {
    throw new ApiError(400, 'exactTimeFired must be a boolean');
  }

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.retention.at': { $ne: null },
  });

  if (!lead) {
    throw new ApiError(404, 'Retention schedule not found for this client');
  }

  if (!lead.handover.retention.alerts) {
    lead.handover.retention.alerts = {
      fiveMinFired: true,
      exactTimeFired: false,
    };
  }

  if (exactTimeFired === true) {
    lead.handover.retention.alerts.exactTimeFired = true;
  }
  // Always keep five-min skipped for retention
  lead.handover.retention.alerts.fiveMinFired = true;

  await lead.save();

  const updated = await populateCstLead(Lead.findById(lead._id));

  res
    .status(200)
    .json(new ApiResponse(200, { lead: updated }, 'Retention alert updated'));
});

/**
 * Mark retention callback done (stops future alerts for this schedule).
 */
export const markRetentionDone = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.retention.at': { $ne: null },
  });

  if (!lead) {
    throw new ApiError(404, 'Retention schedule not found for this client');
  }

  const now = new Date();
  const updated = await populateCstLead(
    Lead.findByIdAndUpdate(
      lead._id,
      {
        $set: {
          'handover.retention.status': 'done',
          'handover.retention.doneAt': now,
          'handover.retention.alerts.fiveMinFired': true,
          'handover.retention.alerts.exactTimeFired': true,
        },
      },
      { new: true, runValidators: true }
    )
  );

  res
    .status(200)
    .json(new ApiResponse(200, { lead: updated }, 'Retention marked done'));
});

const SERVICE_SCOPE_OPTIONS = new Set([
  'seo',
  'web',
  'social_media',
  'other',
]);

/**
 * CST Client Detail — save Products / Services & Custom Scope (Section D).
 * Body: { selected: string[], otherNote?: string }
 */
export const setServiceScope = asyncHandler(async (req, res) => {
  const rawSelected = Array.isArray(req.body?.selected)
    ? req.body.selected
    : [];
  const selected = [
    ...new Set(
      rawSelected
        .map((v) => String(v || '').trim().toLowerCase())
        .filter((v) => SERVICE_SCOPE_OPTIONS.has(v))
    ),
  ];

  const includeOther = selected.includes('other');
  const otherNote = includeOther
    ? typeof req.body?.otherNote === 'string'
      ? req.body.otherNote.trim()
      : ''
    : null;

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.cstStatus': { $in: CST_PIPELINE_STATUSES },
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found in CST handover pipeline');
  }

  const updated = await populateCstLead(
    Lead.findByIdAndUpdate(
      lead._id,
      {
        $set: {
          'handover.serviceScope.selected': selected,
          'handover.serviceScope.otherNote': otherNote || null,
        },
      },
      { new: true, runValidators: true }
    )
  );

  res
    .status(200)
    .json(
      new ApiResponse(200, { lead: updated }, 'Services & scope saved')
    );
});

const normalizeUpsellRow = (row, index) => {
  if (!row || typeof row !== 'object') return null;
  const entryId = String(row.entryId || `upsell-${index + 1}`).trim();
  if (!entryId) return null;
  const totalAmount = Math.max(0, Number(row.totalAmount) || 0);
  let paidAmount = Math.max(0, Number(row.paidAmount) || 0);
  if (paidAmount > totalAmount) paidAmount = totalAmount;

  const serviceRaw = String(row.service || '')
    .trim()
    .toLowerCase();
  const service = UPSELL_SERVICES.has(serviceRaw) ? serviceRaw : null;
  const serviceOther =
    service === 'other'
      ? String(row.serviceOther || row.title || '').trim() || null
      : null;

  const titleFromService =
    service === 'other'
      ? serviceOther || 'Other'
      : service
        ? UPSELL_SERVICE_LABEL[service] || service
        : '';

  const paymentOptionRaw = String(row.paymentOption || '')
    .trim()
    .toLowerCase();
  const paymentOption = UPSELL_PAYMENT_OPTIONS.has(paymentOptionRaw)
    ? paymentOptionRaw
    : null;

  return {
    entryId,
    title:
      typeof row.title === 'string' && row.title.trim()
        ? row.title.trim()
        : titleFromService,
    service,
    serviceOther,
    totalAmount,
    paidAmount,
    paymentOption,
    selectedCardId: row.selectedCardId
      ? String(row.selectedCardId).trim()
      : null,
    paymentReference:
      typeof row.paymentReference === 'string' && row.paymentReference.trim()
        ? row.paymentReference.trim()
        : null,
    notes:
      typeof row.notes === 'string' && row.notes.trim()
        ? row.notes.trim()
        : null,
  };
};

/**
 * CST Client Detail — unified portfolio save (single request).
 * Accepts any combination of section payloads; unknown future keys can be
 * added the same way (splitPayment, keywords, monthlyReports, …).
 *
 * Body shape (all optional):
 * {
 *   activationCall?: { done: boolean },
 *   retention?: { at: ISO string | null },  // null clears; omit to leave
 *   serviceScope?: { selected: string[], otherNote?: string },
 *   upsellLedger?: Array<{ entryId, title, totalAmount, paidAmount, … }>,
 *   portfolioKeywords?: Array<{ keywordId, text, note? }>,
 *   changeRequests?: Array<{ requestId, category, description, status? }>,
 *   profileContext?: { …agent/closer/CST tier fields… }
 * }
 */
export const saveClientPortfolio = asyncHandler(async (req, res) => {
  const {
    activationCall,
    retention,
    serviceScope,
    upsellLedger,
    portfolioKeywords,
    changeRequests,
    profileContext,
  } = req.body || {};

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.cstStatus': { $in: CST_PIPELINE_STATUSES },
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found in CST handover pipeline');
  }

  const $set = {};
  const $unset = {};
  const now = new Date();

  // Section A — Activation Call
  if (activationCall && typeof activationCall.done === 'boolean') {
    const done = activationCall.done;
    $set['handover.activationCall.done'] = done;
    if (done) {
      const alreadyDone = Boolean(lead.handover?.activationCall?.done);
      const existingAt = lead.handover?.activationCall?.at;
      $set['handover.activationCall.at'] =
        alreadyDone && existingAt ? existingAt : now;
    } else {
      $set['handover.activationCall.at'] = null;
    }
  }

  // Section C — Retention (null clears; omit key to leave unchanged)
  if (retention && Object.prototype.hasOwnProperty.call(retention, 'at')) {
    if (retention.at === null || retention.at === '') {
      $set['handover.retention.at'] = null;
      $set['handover.retention.alerts.fiveMinFired'] = true;
      $set['handover.retention.alerts.exactTimeFired'] = true;
      $set['handover.retention.doneAt'] = null;
      $unset['handover.retention.status'] = 1;
    } else {
      const when = new Date(retention.at);
      if (Number.isNaN(when.getTime())) {
        throw new ApiError(400, 'Invalid retention date/time');
      }
      const prevMs = lead.handover?.retention?.at
        ? new Date(lead.handover.retention.at).getTime()
        : null;
      const nextMs = when.getTime();
      const timeChanged = prevMs !== nextMs;
      $set['handover.retention.at'] = when;
      $set['handover.retention.status'] = 'scheduled';
      // Exact-time only — skip 5-min warning
      $set['handover.retention.alerts.fiveMinFired'] = true;
      // Re-arm ring only when the PKT schedule actually changes (or first arm)
      if (timeChanged) {
        $set['handover.retention.alerts.exactTimeFired'] = false;
        $set['handover.retention.doneAt'] = null;
      }
    }
  }

  // Section D — Products / Services & Custom Scope
  if (serviceScope && typeof serviceScope === 'object') {
    const rawSelected = Array.isArray(serviceScope.selected)
      ? serviceScope.selected
      : [];
    const selected = [
      ...new Set(
        rawSelected
          .map((v) => String(v || '').trim().toLowerCase())
          .filter((v) => SERVICE_SCOPE_OPTIONS.has(v))
      ),
    ];
    const includeOther = selected.includes('other');
    const otherNote = includeOther
      ? typeof serviceScope.otherNote === 'string'
        ? serviceScope.otherNote.trim()
        : ''
      : null;
    $set['handover.serviceScope.selected'] = selected;
    $set['handover.serviceScope.otherNote'] = otherNote || null;
  }

  // Section E — Upselling & Split Payment Ledger (never overwrites base payment fields)
  if (Array.isArray(upsellLedger)) {
    const normalized = upsellLedger
      .map((row, index) => normalizeUpsellRow(row, index))
      .filter(Boolean);
    $set['handover.upsellLedger'] = normalized;
  }

  // Section F — Keywords (shared CST/Tech live portfolio)
  if (Array.isArray(portfolioKeywords)) {
    $set['handover.portfolioKeywords'] = normalizeKeywords(portfolioKeywords);
  }

  // Section F — Change request log
  if (Array.isArray(changeRequests)) {
    $set['handover.changeRequests'] = normalizeChangeRequests(
      changeRequests,
      req.user._id
    );
  }

  // Full Agent / Closer / CST context — never wipe omitted keys; only set provided paths
  if (profileContext && typeof profileContext === 'object') {
    const strOrNull = (v) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    };

    const topLevelStrings = [
      'clientName',
      'businessName',
      'personalPhone',
      'businessPhone',
      'businessEmail',
      'personalEmail',
      'websiteLink',
      'yelpLink',
      'gmbLink',
      'serviceAreas',
      'servicesOffered',
      'niche',
      'locationAddress',
      'leadSource',
      'notes',
    ];
    for (const key of topLevelStrings) {
      if (!Object.prototype.hasOwnProperty.call(profileContext, key)) continue;
      const next = strOrNull(profileContext[key]);
      if (next === undefined) continue;
      if (key === 'businessName') {
        if (!next) {
          throw new ApiError(400, `${key} cannot be empty`);
        }
      }
      $set[key] = next;
    }

    if (
      Object.prototype.hasOwnProperty.call(profileContext, 'personalPhone') ||
      Object.prototype.hasOwnProperty.call(profileContext, 'businessPhone')
    ) {
      const nextPersonal = Object.prototype.hasOwnProperty.call(
        $set,
        'personalPhone'
      )
        ? $set.personalPhone
        : lead.personalPhone;
      const nextBusiness = Object.prototype.hasOwnProperty.call(
        $set,
        'businessPhone'
      )
        ? $set.businessPhone
        : lead.businessPhone;
      const derived =
        strOrNull(nextBusiness) || strOrNull(nextPersonal) || null;
      if (!derived) {
        throw new ApiError(
          400,
          'At least one of businessPhone or personalPhone is required'
        );
      }
    }

    const parsePaymentNumber = (raw, fieldName, { allowNull = false } = {}) => {
      if (raw === '' || raw === null) {
        if (allowNull) return null;
        throw new ApiError(400, `${fieldName} is required`);
      }
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0) {
        throw new ApiError(400, `${fieldName} must be a non-negative number`);
      }
      return n;
    };

    if (Object.prototype.hasOwnProperty.call(profileContext, 'paymentOffered')) {
      $set.paymentOffered = parsePaymentNumber(
        profileContext.paymentOffered,
        'paymentOffered'
      );
    }
    if (Object.prototype.hasOwnProperty.call(profileContext, 'paymentReceived')) {
      $set.paymentReceived = parsePaymentNumber(
        profileContext.paymentReceived,
        'paymentReceived'
      );
    }
    if (
      Object.prototype.hasOwnProperty.call($set, 'paymentOffered') ||
      Object.prototype.hasOwnProperty.call($set, 'paymentReceived')
    ) {
      const offered = Math.max(
        0,
        Number(
          Object.prototype.hasOwnProperty.call($set, 'paymentOffered')
            ? $set.paymentOffered
            : lead.paymentOffered
        ) || 0
      );
      const received = Math.max(
        0,
        Number(
          Object.prototype.hasOwnProperty.call($set, 'paymentReceived')
            ? $set.paymentReceived
            : lead.paymentReceived
        ) || 0
      );
      $set.paymentOffered = offered;
      $set.paymentReceived = received;
      $set.paymentPending = Math.max(0, offered - received);
    }

    if (Object.prototype.hasOwnProperty.call(profileContext, 'closedAt')) {
      const raw = profileContext.closedAt;
      if (raw === null || raw === '') {
        $set.closedAt = null;
      } else {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
          throw new ApiError(400, 'Invalid closedAt date');
        }
        $set.closedAt = d;
      }
    }

    if (profileContext.payment && typeof profileContext.payment === 'object') {
      const p = profileContext.payment;
      if (Object.prototype.hasOwnProperty.call(p, 'method')) {
        const method = p.method === '' || p.method == null ? null : String(p.method);
        if (
          method != null &&
          !['via_link', 'via_card', 'other'].includes(method)
        ) {
          throw new ApiError(400, 'Invalid payment method');
        }
        $set['payment.method'] = method;
      }
      if (Object.prototype.hasOwnProperty.call(p, 'cardLast4')) {
        $set['payment.cardLast4'] = strOrNull(p.cardLast4) ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(p, 'cardBrand')) {
        $set['payment.cardBrand'] = strOrNull(p.cardBrand) ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(p, 'linkUrl')) {
        $set['payment.linkUrl'] = strOrNull(p.linkUrl) ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(p, 'otherDetails')) {
        $set['payment.otherDetails'] = strOrNull(p.otherDetails) ?? null;
      }
    }

    if (Object.prototype.hasOwnProperty.call(profileContext, 'documentSigned')) {
      const ds = profileContext.documentSigned;
      if (ds === '' || ds === null || ds === 'unknown') {
        $set['handover.documentSigned'] = null;
      } else if (ds === true || ds === 'true' || ds === 'yes') {
        $set['handover.documentSigned'] = true;
      } else if (ds === false || ds === 'false' || ds === 'no') {
        $set['handover.documentSigned'] = false;
      }
    }

    if (Object.prototype.hasOwnProperty.call(profileContext, 'upscaleNotes')) {
      $set['handover.upscaleNotes'] =
        strOrNull(profileContext.upscaleNotes) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(profileContext, 'onboardingNotes')) {
      $set['handover.onboardingNotes'] =
        strOrNull(profileContext.onboardingNotes) ?? null;
    }
  }

  // Recompute cumulative totals after base payment and/or upsell ledger updates
  if (
    Array.isArray(upsellLedger) ||
    Object.prototype.hasOwnProperty.call($set, 'paymentOffered') ||
    Object.prototype.hasOwnProperty.call($set, 'paymentReceived')
  ) {
    const baseOffered = Math.max(
      0,
      Number(
        Object.prototype.hasOwnProperty.call($set, 'paymentOffered')
          ? $set.paymentOffered
          : lead.paymentOffered ?? lead.salesAmount
      ) || 0
    );
    const baseReceived = Math.max(
      0,
      Number(
        Object.prototype.hasOwnProperty.call($set, 'paymentReceived')
          ? $set.paymentReceived
          : lead.paymentReceived
      ) || 0
    );
    const ledgerRows = Array.isArray(upsellLedger)
      ? $set['handover.upsellLedger'] || []
      : Array.isArray(lead.handover?.upsellLedger)
        ? lead.handover.upsellLedger
        : [];
    let upsellTotal = 0;
    let upsellPaid = 0;
    for (const row of ledgerRows) {
      upsellTotal += Math.max(0, Number(row?.totalAmount) || 0);
      upsellPaid += Math.max(0, Number(row?.paidAmount) || 0);
    }
    $set['handover.totalCollectedAmount'] = baseReceived + upsellPaid;
    $set['handover.totalContractValue'] = baseOffered + upsellTotal;
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
    throw new ApiError(400, 'No portfolio fields provided to save');
  }

  const update = { $set };
  if (Object.keys($unset).length > 0) update.$unset = $unset;

  const updated = await populateCstLead(
    Lead.findByIdAndUpdate(lead._id, update, {
      new: true,
      runValidators: true,
    })
  );

  res
    .status(200)
    .json(new ApiResponse(200, { lead: updated }, 'Client details saved'));
});

/**
 * CST — append one upsell ledger row (+ optional new saved card).
 * Body JSON: service, serviceOther?, totalAmount, paidAmount, paymentOption,
 * selectedCardId?, paymentReference?, notes?, newCard?
 */
export const addClientUpsell = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.cstStatus': { $in: CST_PIPELINE_STATUSES },
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found in CST handover pipeline');
  }

  // Ensure base-deal / legacy cards are in the vault before Old Card selection
  syncLegacyCardsIntoVault(lead);

  const service = String(req.body?.service || '')
    .trim()
    .toLowerCase();
  if (!UPSELL_SERVICES.has(service)) {
    throw new ApiError(
      400,
      'Services / Product must be SEO, Web, Citation Pages, or Other'
    );
  }

  const serviceOther =
    service === 'other'
      ? String(req.body?.serviceOther || '').trim()
      : '';
  if (service === 'other' && !serviceOther) {
    throw new ApiError(400, 'Specify the Other service / product');
  }

  const totalAmount = Number(req.body?.totalAmount);
  const paidAmountRaw = Number(req.body?.paidAmount);
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    throw new ApiError(400, 'Total is required and must be a non-negative number');
  }
  if (!Number.isFinite(paidAmountRaw) || paidAmountRaw < 0) {
    throw new ApiError(400, 'Paid is required and must be a non-negative number');
  }
  let paidAmount = paidAmountRaw;
  if (paidAmount > totalAmount) paidAmount = totalAmount;

  const paymentOption = String(req.body?.paymentOption || '')
    .trim()
    .toLowerCase();
  if (!UPSELL_PAYMENT_OPTIONS.has(paymentOption)) {
    throw new ApiError(
      400,
      'Payment Option must be New Card, Old Card, Link, or Others'
    );
  }

  let selectedCardId = req.body?.selectedCardId
    ? String(req.body.selectedCardId).trim()
    : null;
  let paymentReference =
    typeof req.body?.paymentReference === 'string'
      ? req.body.paymentReference.trim()
      : '';

  if (paymentOption === 'old_card') {
    const cards = Array.isArray(lead.savedCards) ? lead.savedCards : [];
    if (!selectedCardId || !cards.some((c) => String(c.cardId) === selectedCardId)) {
      throw new ApiError(400, 'Select a saved card for Old Card payment');
    }
  } else if (paymentOption === 'new_card') {
    const newCard = req.body?.newCard || {};
    const digits = String(newCard.cardNumber || '').replace(/\D/g, '');
    const last4 = digits.slice(-4);
    if (digits.length < 13 || last4.length !== 4) {
      throw new ApiError(400, 'Enter a valid Card Number');
    }
    const expiry = String(newCard.expiry || '').trim();
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      throw new ApiError(400, 'Expiry must be MM/YY');
    }
    const cvc = String(newCard.cvc || '').replace(/\D/g, '');
    if (cvc.length < 3) {
      throw new ApiError(400, 'CVC is required');
    }
    const nameOnCard = String(newCard.nameOnCard || '').trim();
    const billingZipCode = String(newCard.billingZipCode || '').trim();
    if (!nameOnCard || !billingZipCode) {
      throw new ApiError(400, 'Name on Card and Billing Zip Code are required');
    }

    const entry = buildSavedCardEntry({
      cardLast4: last4,
      cardBrand: newCard.cardBrand || null,
      expiry,
      nameOnCard,
      billingZipCode,
      source: 'cst_upsell',
      cvcCollected: true,
    });
    appendSavedCard(lead, entry);
    selectedCardId = entry.cardId;
  } else if (!paymentReference) {
    throw new ApiError(400, 'Payment reference / details are required');
  }

  const notes =
    typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

  const row = normalizeUpsellRow(
    {
      entryId: randomUUID(),
      service,
      serviceOther,
      title:
        service === 'other'
          ? serviceOther
          : UPSELL_SERVICE_LABEL[service] || service,
      totalAmount,
      paidAmount,
      paymentOption,
      selectedCardId,
      paymentReference: paymentReference || null,
      notes: notes || null,
    },
    0
  );

  if (!lead.handover) lead.handover = {};
  if (!Array.isArray(lead.handover.upsellLedger)) {
    lead.handover.upsellLedger = [];
  }
  lead.handover.upsellLedger.push(row);

  const baseOffered = Math.max(
    0,
    Number(lead.paymentOffered ?? lead.salesAmount) || 0
  );
  const baseReceived = Math.max(0, Number(lead.paymentReceived) || 0);
  let upsellTotal = 0;
  let upsellPaid = 0;
  for (const r of lead.handover.upsellLedger) {
    upsellTotal += Math.max(0, Number(r?.totalAmount) || 0);
    upsellPaid += Math.max(0, Number(r?.paidAmount) || 0);
  }
  lead.handover.totalCollectedAmount = baseReceived + upsellPaid;
  lead.handover.totalContractValue = baseOffered + upsellTotal;

  await lead.save();

  const updated = await populateCstLead(Lead.findById(lead._id));

  res
    .status(200)
    .json(new ApiResponse(200, { lead: updated }, 'Upsell added'));
});

/**
 * CST Manager / Tech Team — shared client comment thread
 * (@mentions between CST↔Tech + file attachments).
 * multipart: body (text), mentions (JSON array of userIds), files[]
 */
export const addClientComment = asyncHandler(async (req, res) => {
  const role = req.user.role;
  if (
    role !== 'cst_manager' &&
    role !== 'tech_team' &&
    role !== 'super_admin'
  ) {
    throw new ApiError(403, 'Only CST Manager and Tech Team can post comments');
  }

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.cstStatus': { $in: CST_PIPELINE_STATUSES },
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found in CST handover pipeline');
  }

  if (role === 'tech_team') {
    const assigned = refId(lead.handover?.assignedTechId);
    if (!assigned || assigned !== String(req.user._id)) {
      throw new ApiError(
        403,
        'You can only comment on clients assigned to you'
      );
    }
  }

  const body = String(req.body?.body || '').trim();
  if (!body) {
    throw new ApiError(400, 'Comment text is required');
  }

  let mentionIds = [];
  try {
    const raw = req.body?.mentions;
    const parsed =
      typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    if (Array.isArray(parsed)) {
      mentionIds = [
        ...new Set(
          parsed
            .map((id) => String(id || '').trim())
            .filter(Boolean)
        ),
      ];
    }
  } catch {
    throw new ApiError(400, 'Invalid mentions payload');
  }

  const mentionUsers =
    mentionIds.length > 0
      ? await User.find({
          _id: { $in: mentionIds },
          status: 'approved',
          role: { $in: [...CLIENT_COMMENT_ROLES] },
        }).select('fullName username role')
      : [];

  const mentions = mentionUsers.map((u) => ({
    userId: u._id,
    fullName: u.fullName || null,
    username: u.username || null,
    role: u.role || null,
  }));

  const files = Array.isArray(req.files) ? req.files : [];
  const attachments = files.map((file) => ({
    originalName: file.originalname || null,
    storedFilename: file.filename,
    mimeType: file.mimetype || null,
    sizeBytes: file.size || null,
    relativePath: path
      .join('uploads', 'client-comments', String(req.params.id), file.filename)
      .replace(/\\/g, '/'),
  }));

  const comment = {
    commentId: randomUUID(),
    body,
    mentions,
    attachments,
    createdAt: new Date(),
    createdBy: req.user._id,
  };

  if (!lead.handover) lead.handover = {};
  if (!Array.isArray(lead.handover.comments)) {
    lead.handover.comments = [];
  }
  lead.handover.comments.push(comment);

  // Author has read their own thread through the latest comment
  if (!Array.isArray(lead.handover.commentReads)) {
    lead.handover.commentReads = [];
  }
  const authorReadIdx = lead.handover.commentReads.findIndex(
    (r) => String(r.userId) === String(req.user._id)
  );
  if (authorReadIdx >= 0) {
    lead.handover.commentReads[authorReadIdx].lastReadAt = comment.createdAt;
  } else {
    lead.handover.commentReads.push({
      userId: req.user._id,
      lastReadAt: comment.createdAt,
    });
  }

  await lead.save();

  const businessName = lead.businessName || 'Client';
  const authorName =
    req.user.fullName ||
    req.user.username ||
    (role === 'tech_team' ? 'Tech Team' : 'CST Manager');
  const authorRole = role === 'super_admin' ? 'cst_manager' : role;
  const bodyPreview = body.slice(0, 140);
  const payloadBase = {
    leadId: String(lead._id),
    commentId: comment.commentId,
    businessName,
    authorName,
    authorRole,
    bodyPreview,
    at: comment.createdAt,
  };

  const recipientIds = new Set();
  for (const m of mentions) {
    if (String(m.userId) !== String(req.user._id)) {
      recipientIds.add(String(m.userId));
    }
  }

  if (authorRole === 'cst_manager') {
    const techId = refId(lead.handover?.assignedTechId);
    if (techId && techId !== String(req.user._id)) {
      recipientIds.add(techId);
    }
  } else if (authorRole === 'tech_team') {
    const cstManagers = await User.find({
      role: 'cst_manager',
      status: 'approved',
    }).select('_id');
    for (const u of cstManagers) {
      if (String(u._id) !== String(req.user._id)) {
        recipientIds.add(String(u._id));
      }
    }
  }

  const mentionIdSet = new Set(mentions.map((m) => String(m.userId)));
  for (const uid of recipientIds) {
    const isMention = mentionIdSet.has(uid);
    const eventPayload = { ...payloadBase, isMention };
    emitToUser(uid, 'client:comment-new', eventPayload);
    if (isMention) {
      emitToUser(uid, 'client:comment-mention', eventPayload);
    }
  }

  const updated = await populateCstLead(Lead.findById(lead._id));
  const leadObj =
    typeof updated?.toObject === 'function' ? updated.toObject() : updated;
  if (leadObj) {
    leadObj.unreadCommentCount = 0;
  }

  res
    .status(200)
    .json(new ApiResponse(200, { lead: leadObj }, 'Comment added'));
});

/**
 * Mark all client comments as read for the current CST / Tech user.
 */
export const markClientCommentsRead = asyncHandler(async (req, res) => {
  const role = req.user.role;
  if (
    role !== 'cst_manager' &&
    role !== 'tech_team' &&
    role !== 'super_admin'
  ) {
    throw new ApiError(403, 'Only CST Manager and Tech Team can mark comments read');
  }

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.cstStatus': { $in: CST_PIPELINE_STATUSES },
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found in CST handover pipeline');
  }

  if (role === 'tech_team') {
    const assigned = refId(lead.handover?.assignedTechId);
    if (!assigned || assigned !== String(req.user._id)) {
      throw new ApiError(
        403,
        'You can only mark comments read on clients assigned to you'
      );
    }
  }

  if (!lead.handover) lead.handover = {};
  if (!Array.isArray(lead.handover.commentReads)) {
    lead.handover.commentReads = [];
  }

  const now = new Date();
  const idx = lead.handover.commentReads.findIndex(
    (r) => String(r.userId) === String(req.user._id)
  );
  if (idx >= 0) {
    lead.handover.commentReads[idx].lastReadAt = now;
  } else {
    lead.handover.commentReads.push({
      userId: req.user._id,
      lastReadAt: now,
    });
  }

  await lead.save();

  res.status(200).json(
    new ApiResponse(
      200,
      { leadId: String(lead._id), unreadCommentCount: 0, lastReadAt: now },
      'Comments marked as read'
    )
  );
});

/**
 * Unread client-comment inbox for CST Manager / Tech Team notification bell.
 */
export const getCommentNotifications = asyncHandler(async (req, res) => {
  const role = req.user.role;
  if (role !== 'cst_manager' && role !== 'tech_team' && role !== 'super_admin') {
    throw new ApiError(
      403,
      'Only CST Manager and Tech Team can view comment notifications'
    );
  }

  const filter =
    role === 'tech_team'
      ? {
          stage: 'closed_sale',
          'handover.assignedTechId': req.user._id,
          'handover.cstStatus': {
            $in: ['assigned', 'in_progress', 'completed'],
          },
          'handover.comments.0': { $exists: true },
        }
      : {
          stage: 'closed_sale',
          'handover.cstStatus': { $in: CST_PIPELINE_STATUSES },
          'handover.comments.0': { $exists: true },
        };

  const leads = await Lead.find(filter)
    .select('businessName clientName handover.comments handover.commentReads')
    .populate({
      path: 'handover.comments.createdBy',
      select: 'fullName username role',
    })
    .sort({ updatedAt: -1 })
    .limit(100);

  const uid = String(req.user._id);
  const notifications = [];

  for (const lead of leads) {
    const unread = unreadCommentCountForUser(lead, uid);
    if (unread <= 0) continue;

    const comments = Array.isArray(lead.handover?.comments)
      ? [...lead.handover.comments]
      : [];
    const reads = Array.isArray(lead.handover?.commentReads)
      ? lead.handover.commentReads
      : [];
    const entry = reads.find((r) => String(r.userId) === uid);
    const lastReadMs = entry?.lastReadAt
      ? new Date(entry.lastReadAt).getTime()
      : 0;
    const watermark = Number.isNaN(lastReadMs) ? 0 : lastReadMs;

    const unreadRows = comments
      .filter((c) => {
        if (commentAuthorId(c) === uid) return false;
        const at = new Date(c.createdAt || 0).getTime();
        return !Number.isNaN(at) && at > watermark;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
      );

    const latest = unreadRows[0];
    if (!latest) continue;

    const author =
      latest.createdBy?.fullName ||
      latest.createdBy?.username ||
      (latest.createdBy?.role === 'tech_team' ? 'Tech Team' : 'CST Manager');
    const isMention = (latest.mentions || []).some(
      (m) => String(m.userId) === uid
    );

    notifications.push({
      leadId: String(lead._id),
      businessName: lead.businessName || 'Client',
      clientName: lead.clientName || null,
      unreadCount: unread,
      isMention,
      latestComment: {
        commentId: latest.commentId,
        body: latest.body,
        authorName: author,
        authorRole: latest.createdBy?.role || null,
        createdAt: latest.createdAt,
      },
    });
  }

  notifications.sort((a, b) => {
    const aAt = new Date(a.latestComment?.createdAt || 0).getTime();
    const bAt = new Date(b.latestComment?.createdAt || 0).getTime();
    return bAt - aAt;
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        notifications,
        totalUnread: notifications.reduce(
          (sum, n) => sum + (n.unreadCount || 0),
          0
        ),
      },
      'Comment notifications retrieved'
    )
  );
});

/**
 * Serve a client-comment attachment (CST Manager / Tech Team / admin).
 */
export const serveClientCommentAttachment = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id).select(
    'handover.comments handover.assignedTechId businessName'
  );
  if (!lead) throw new ApiError(404, 'Client not found');

  const role = req.user.role;
  if (role === 'tech_team') {
    const assigned = refId(lead.handover?.assignedTechId);
    if (!assigned || assigned !== String(req.user._id)) {
      throw new ApiError(403, 'You can only open attachments on your assigned clients');
    }
  } else if (
    role !== 'cst_manager' &&
    role !== 'super_admin' &&
    role !== 'admin'
  ) {
    throw new ApiError(403, 'Attachments are limited to CST Manager and Tech Team');
  }

  const comment = (lead.handover?.comments || []).find(
    (c) => String(c.commentId) === String(req.params.commentId)
  );
  if (!comment) throw new ApiError(404, 'Comment not found');

  const file = (comment.attachments || []).find(
    (a) => String(a.storedFilename) === String(req.params.filename)
  );
  if (!file) throw new ApiError(404, 'Attachment not found');

  const abs = path.join(
    process.cwd(),
    'uploads',
    'client-comments',
    String(req.params.id),
    file.storedFilename
  );
  if (!fs.existsSync(abs)) {
    throw new ApiError(404, 'Attachment file missing on disk');
  }

  res.setHeader(
    'Content-Type',
    file.mimeType || 'application/octet-stream'
  );
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(file.originalName || file.storedFilename)}"`
  );
  fs.createReadStream(abs).pipe(res);
});

/**
 * Tech (assigned) or CST — save live portfolio keywords + change requests only.
 */
export const saveLivePortfolio = asyncHandler(async (req, res) => {
  const { portfolioKeywords, changeRequests } = req.body || {};

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found');
  }

  const role = req.user.role;
  const isCst = role === 'cst_manager' || role === 'super_admin' || role === 'admin';
  const isAssignedTech =
    role === 'tech_team' &&
    refId(lead.handover?.assignedTechId) === String(req.user._id);

  if (!isCst && !isAssignedTech) {
    throw new ApiError(403, 'Not allowed to update this client portfolio');
  }

  const $set = {};
  if (Array.isArray(portfolioKeywords)) {
    $set['handover.portfolioKeywords'] = normalizeKeywords(portfolioKeywords);
  }
  if (Array.isArray(changeRequests)) {
    $set['handover.changeRequests'] = normalizeChangeRequests(
      changeRequests,
      req.user._id
    );
  }

  if (Object.keys($set).length === 0) {
    throw new ApiError(400, 'No live portfolio fields provided');
  }

  const updated = await populateCstLead(
    Lead.findByIdAndUpdate(lead._id, { $set }, { new: true, runValidators: true })
  );

  res
    .status(200)
    .json(new ApiResponse(200, { lead: updated }, 'Live portfolio saved'));
});

/**
 * Tech uploads a monthly report PDF (local uploads/monthly-reports).
 */
export const uploadMonthlyReport = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found');
  }

  const isAssignedTech =
    req.user.role === 'tech_team' &&
    refId(lead.handover?.assignedTechId) === String(req.user._id);
  const isCst =
    req.user.role === 'cst_manager' ||
    req.user.role === 'super_admin';

  if (!isAssignedTech && !isCst) {
    throw new ApiError(403, 'Not allowed to upload reports for this client');
  }

  if (!req.file) {
    throw new ApiError(400, 'PDF file is required');
  }

  const title =
    typeof req.body?.title === 'string' && req.body.title.trim()
      ? req.body.title.trim()
      : req.file.originalname || 'Monthly Report';

  const report = {
    reportId: `rpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    originalName: req.file.originalname,
    storedFilename: req.file.filename,
    mimeType: req.file.mimetype || 'application/pdf',
    sizeBytes: req.file.size,
    relativePath: path
      .join('uploads', 'monthly-reports', String(lead._id), req.file.filename)
      .replace(/\\/g, '/'),
    uploadedBy: req.user._id,
    at: new Date(),
  };

  const existing = Array.isArray(lead.handover?.monthlyReports)
    ? lead.handover.monthlyReports
    : [];

  const updated = await populateCstLead(
    Lead.findByIdAndUpdate(
      lead._id,
      {
        $set: {
          'handover.monthlyReports': [...existing, report],
        },
      },
      { new: true, runValidators: true }
    )
  );

  res
    .status(201)
    .json(new ApiResponse(201, { lead: updated, report }, 'Monthly report uploaded'));
});

/**
 * CST or assigned Tech — download / view a monthly report PDF.
 */
export const serveMonthlyReport = asyncHandler(async (req, res) => {
  const { filename } = req.params;
  if (
    !filename ||
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    throw new ApiError(400, 'Invalid filename');
  }

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found');
  }

  const role = req.user.role;
  const isCst =
    role === 'cst_manager' || role === 'super_admin' || role === 'admin';
  const isAssignedTech =
    role === 'tech_team' &&
    refId(lead.handover?.assignedTechId) === String(req.user._id);

  if (!isCst && !isAssignedTech) {
    throw new ApiError(403, 'Not allowed to access this report');
  }

  const reports = Array.isArray(lead.handover?.monthlyReports)
    ? lead.handover.monthlyReports
    : [];
  const match = reports.find((r) => r.storedFilename === filename);
  if (!match) {
    throw new ApiError(404, 'Report not found on this client');
  }

  const absolutePath = path.join(
    process.cwd(),
    'uploads',
    'monthly-reports',
    String(lead._id),
    filename
  );

  if (!fs.existsSync(absolutePath)) {
    throw new ApiError(404, 'Report file missing on disk');
  }

  res.setHeader(
    'Content-Type',
    match.mimeType || 'application/pdf'
  );
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(match.originalName || filename)}"`
  );
  res.sendFile(absolutePath);
});

/**
 * Tech updates a change-request status (Pending → In Progress → Completed).
 */
export const updateChangeRequestStatus = asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!CHANGE_REQUEST_STATUSES.has(status)) {
    throw new ApiError(
      400,
      'status must be pending, in_progress, or completed'
    );
  }

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
  });

  if (!lead) {
    throw new ApiError(404, 'Client not found');
  }

  const isAssignedTech =
    req.user.role === 'tech_team' &&
    refId(lead.handover?.assignedTechId) === String(req.user._id);
  const isCst =
    req.user.role === 'cst_manager' || req.user.role === 'super_admin';

  if (!isAssignedTech && !isCst) {
    throw new ApiError(403, 'Not allowed to update this change request');
  }

  const requests = Array.isArray(lead.handover?.changeRequests)
    ? [...lead.handover.changeRequests.map((r) => r.toObject?.() || r)]
    : [];
  const idx = requests.findIndex(
    (r) => String(r.requestId) === String(req.params.requestId)
  );
  if (idx < 0) {
    throw new ApiError(404, 'Change request not found');
  }

  requests[idx] = {
    ...requests[idx],
    status,
    statusUpdatedAt: new Date(),
    statusUpdatedBy: req.user._id,
  };

  const updated = await populateCstLead(
    Lead.findByIdAndUpdate(
      lead._id,
      { $set: { 'handover.changeRequests': requests } },
      { new: true, runValidators: true }
    )
  );

  res
    .status(200)
    .json(
      new ApiResponse(200, { lead: updated }, 'Change request status updated')
    );
});

/**
 * CST Tech Status board — Onboarded (active, awaiting tech) + live Tech delivery.
 */
export const getTechPipeline = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    stage: 'closed_sale',
    $or: [
      // Freshly onboarded — visible as Onboarded / Active before tech assign
      { 'handover.cstStatus': 'onboarded' },
      {
        'handover.assignedTechId': { $ne: null },
        'handover.cstStatus': {
          $in: ['assigned', 'in_progress', 'completed'],
        },
      },
    ],
  })
    .select(
      'stage status clientName businessName personalPhone businessPhone businessEmail personalEmail yelpLink websiteLink gmbLink serviceAreas servicesOffered niche locationAddress leadSource paymentOffered paymentReceived paymentPending payment handover closedAt closedBy agentId closerId notes createdAt updatedAt'
    )
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .populate('handover.assignedTechId', 'fullName username role')
    .sort({
      'handover.onboardedAt': -1,
      'handover.assignedAt': -1,
    });

  res.status(200).json(
    new ApiResponse(
      200,
      { leads: attachUnreadCommentCount(leads, req.user._id) },
      'Tech pipeline retrieved'
    )
  );
});

export const getTechList = asyncHandler(async (req, res) => {
  const techs = await User.find({
    role: 'tech_team',
    status: 'approved',
  })
    .select('fullName username')
    .sort({ fullName: 1 });

  res
    .status(200)
    .json(new ApiResponse(200, { techs }, 'Tech team list retrieved'));
});

export const assignHandover = asyncHandler(async (req, res) => {
  const {
    techId,
    clientName,
    businessEmail,
    personalEmail,
    paymentOffered,
    paymentReceived,
    servicesOffered,
    serviceAreas,
    gmbLink,
    yelpLink,
    onboardingNotes,
  } = req.body;

  if (!techId) {
    throw new ApiError(400, 'techId is required');
  }

  const tech = await User.findById(techId);

  if (!tech || tech.role !== 'tech_team' || tech.status !== 'approved') {
    throw new ApiError(400, 'techId must be an approved tech_team user');
  }

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'closed_sale',
    'handover.cstStatus': { $in: ['pending_review', 'onboarded'] },
  });

  if (!lead) {
    throw new ApiError(
      409,
      'This lead has already been assigned to a Tech Team member.'
    );
  }

  const setIfProvided = (field, value) => {
    if (value === undefined) return;
    lead[field] = value === '' || value === null ? null : value;
  };

  setIfProvided('clientName', clientName);
  setIfProvided('businessEmail', businessEmail);
  setIfProvided('personalEmail', personalEmail);
  setIfProvided('servicesOffered', servicesOffered);
  setIfProvided('serviceAreas', serviceAreas);
  setIfProvided('gmbLink', gmbLink);
  setIfProvided('yelpLink', yelpLink);

  if (paymentOffered !== undefined && paymentOffered !== '' && paymentOffered !== null) {
    const n = Number(paymentOffered);
    if (Number.isNaN(n) || n < 0) {
      throw new ApiError(400, 'paymentOffered must be a non-negative number');
    }
    lead.paymentOffered = n;
  }
  if (paymentReceived !== undefined) {
    const n = Number(
      paymentReceived === '' || paymentReceived === null ? 0 : paymentReceived
    );
    if (Number.isNaN(n) || n < 0) {
      throw new ApiError(400, 'paymentReceived must be a non-negative number');
    }
    lead.paymentReceived = n;
  }
  // Keep pending in sync whenever either amount is touched
  if (paymentOffered !== undefined || paymentReceived !== undefined) {
    const offered = Math.max(0, Number(lead.paymentOffered) || 0);
    const received = Math.max(0, Number(lead.paymentReceived) || 0);
    lead.paymentOffered = offered;
    lead.paymentReceived = received;
    lead.paymentPending = Math.max(0, offered - received);
  }

  if (!lead.handover) {
    lead.handover = {};
  }

  lead.handover.assignedTechId = tech._id;
  lead.handover.cstStatus = 'assigned';
  lead.handover.techStatus = 'assigned';
  lead.handover.assignedAt = new Date();

  if (onboardingNotes !== undefined) {
    lead.handover.onboardingNotes =
      onboardingNotes === '' || onboardingNotes === null
        ? null
        : String(onboardingNotes).trim();
  }

  await lead.save();

  await lead.populate([
    { path: 'agentId', select: 'fullName username role' },
    { path: 'closerId', select: 'fullName username role' },
    { path: 'closedBy', select: 'fullName username role' },
    { path: 'handover.assignedTechId', select: 'fullName username role' },
  ]);

  res
    .status(200)
    .json(
      new ApiResponse(200, { lead }, 'Client onboarded and assigned to tech')
    );
});

export const getMyProjects = asyncHandler(async (req, res) => {
  // Strict: only projects assigned to this tech member
  const leads = await Lead.find({
    stage: 'closed_sale',
    'handover.assignedTechId': req.user._id,
    'handover.cstStatus': { $in: ['assigned', 'in_progress', 'completed'] },
  })
    .select(
      'stage status clientName businessName personalPhone businessPhone businessEmail personalEmail yelpLink websiteLink gmbLink serviceAreas servicesOffered niche locationAddress leadSource paymentOffered paymentReceived paymentPending payment handover closedAt notes createdAt updatedAt'
    )
    .sort({ 'handover.assignedAt': 1 });

  res.status(200).json(
    new ApiResponse(
      200,
      { leads: attachUnreadCommentCount(leads, req.user._id) },
      'My projects retrieved'
    )
  );
});

const MILESTONE_ORDER = {
  pending_review: 0,
  onboarded: 1,
  assigned: 2,
  in_progress: 3,
  completed: 4,
};

export const updateMilestone = asyncHandler(async (req, res) => {
  const { milestone } = req.body;

  if (!['in_progress', 'completed'].includes(milestone)) {
    throw new ApiError(
      400,
      "milestone must be 'in_progress' or 'completed'"
    );
  }

  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (
    !lead.handover?.assignedTechId ||
    lead.handover.assignedTechId.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(403, 'You can only update milestones on your assigned projects');
  }

  const current = lead.handover.cstStatus || 'pending_review';
  const currentRank = MILESTONE_ORDER[current];
  const nextRank = MILESTONE_ORDER[milestone];

  if (currentRank === undefined || nextRank === undefined) {
    throw new ApiError(400, 'Invalid handover status');
  }

  // Tech may only move forward one step (assigned → in_progress → completed).
  // Backward moves require super_admin override (Phase 3.4.3).
  if (nextRank <= currentRank) {
    throw new ApiError(
      400,
      'Milestone can only move forward; contact a Super Admin to reverse status'
    );
  }

  if (nextRank !== currentRank + 1) {
    throw new ApiError(
      400,
      `Invalid transition: cannot skip from '${current}' to '${milestone}'`
    );
  }

  lead.handover.cstStatus = milestone;
  lead.handover.techStatus = milestone;

  if (milestone === 'completed') {
    lead.handover.completedAt = new Date();
  }

  await lead.save();

  await lead.populate([
    { path: 'handover.assignedTechId', select: 'fullName username role' },
  ]);

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Milestone updated successfully'));
});

const VALID_CST_STATUSES = [
  'awaiting_handover',
  'pending_review',
  'onboarded',
  'assigned',
  'in_progress',
  'completed',
];

export const reassignHandover = asyncHandler(async (req, res) => {
  const { techId, assignedTechId, cstStatus, milestone, overrideReason } =
    req.body;

  if (!overrideReason || !String(overrideReason).trim()) {
    throw new ApiError(400, 'overrideReason is required for audit');
  }

  const nextTechId = techId || assignedTechId;
  const nextStatus = cstStatus || milestone;

  if (!nextTechId && !nextStatus) {
    throw new ApiError(
      400,
      'Provide assignedTechId (or techId) and/or cstStatus (or milestone) to override'
    );
  }

  if (nextStatus && !VALID_CST_STATUSES.includes(nextStatus)) {
    throw new ApiError(
      400,
      `cstStatus must be one of: ${VALID_CST_STATUSES.join(', ')}`
    );
  }

  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (lead.stage !== 'closed_sale') {
    throw new ApiError(400, 'Only closed sales support handover overrides');
  }

  if (!lead.handover) {
    lead.handover = {
      cstStatus: 'pending_review',
      assignedTechId: null,
      assignedAt: null,
      completedAt: null,
      overrideLog: [],
    };
  }

  if (!Array.isArray(lead.handover.overrideLog)) {
    lead.handover.overrideLog = [];
  }

  if (nextTechId) {
    const tech = await User.findById(nextTechId);

    if (!tech || tech.role !== 'tech_team' || tech.status !== 'approved') {
      throw new ApiError(400, 'techId must be an approved tech_team user');
    }

    lead.handover.assignedTechId = tech._id;
    if (!lead.handover.assignedAt) {
      lead.handover.assignedAt = new Date();
    }
  }

  if (nextStatus) {
    lead.handover.cstStatus = nextStatus;
    if (['assigned', 'in_progress', 'completed'].includes(nextStatus)) {
      lead.handover.techStatus = nextStatus;
    } else if (
      nextStatus === 'pending_review' ||
      nextStatus === 'onboarded' ||
      nextStatus === 'awaiting_handover'
    ) {
      lead.handover.techStatus = null;
    }

    if (nextStatus === 'completed') {
      lead.handover.completedAt = new Date();
    } else {
      // Forced backward / off completed clears completion timestamp
      lead.handover.completedAt = null;
    }

    if (nextStatus === 'onboarded' && !lead.handover.onboardedAt) {
      lead.handover.onboardedAt = new Date();
    }
    if (nextStatus === 'pending_review' || nextStatus === 'awaiting_handover') {
      lead.handover.onboardedAt = null;
    }
  }

  lead.handover.overrideLog.push({
    by: req.user._id,
    reason: String(overrideReason).trim(),
    at: new Date(),
  });

  await lead.save();

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Handover override applied'));
});
