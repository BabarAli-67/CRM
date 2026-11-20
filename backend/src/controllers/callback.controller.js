import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import mongoose from 'mongoose';
import Callback from '../models/callback.model.js';
import Lead from '../models/lead.model.js';
import User from '../models/user.model.js';
import { healStaleAgentCallbacks } from '../utils/callbackResolve.util.js';
import { buildAlertFlagsForSchedule } from '../utils/alertTiming.util.js';
import { escalateStaleAgentLeads } from '../utils/leadEscalation.util.js';
import { parseLeadPaymentFields } from '../utils/leadPayment.util.js';

const isOwnerOrSuperAdmin = (callback, user) => {
  if (user.role === 'super_admin') return true;
  if (!callback.agentId) return false;
  return callback.agentId.toString() === user._id.toString();
};

const trimOrNull = (value) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
};

/** Prefer business → personal phone for promote / display. */
const primaryPhoneFromCallback = (cb) =>
  trimOrNull(cb.businessPhone) || trimOrNull(cb.personalPhone);

const resolveApprovedCloser = async (closerId) => {
  if (!closerId) {
    throw new ApiError(400, 'Assign Closer is required');
  }
  const closer = await User.findOne({
    _id: closerId,
    role: 'closer',
    status: 'approved',
  }).select('_id fullName username role');
  if (!closer) {
    throw new ApiError(400, 'Selected closer is invalid or inactive');
  }
  return closer;
};

/** Closer-owned rows OR agent rows assigned to this closer. */
const closerAgendaMatch = (userId) => ({
  $or: [
    { closerId: userId },
    { assignedCloserId: userId, agentId: { $ne: null } },
  ],
});

export const createCallback = asyncHandler(async (req, res) => {
  const {
    businessName,
    personalPhone,
    businessPhone,
    businessLink,
    callbackAt,
    notes,
    leadId,
    assignedCloserId,
  } = req.body;

  if (!callbackAt) {
    throw new ApiError(400, 'callbackAt is required');
  }

  const callbackAtDate = new Date(callbackAt);
  if (Number.isNaN(callbackAtDate.getTime())) {
    throw new ApiError(400, 'callbackAt must be a valid date');
  }

  let resolvedName = trimOrNull(businessName);
  let resolvedPersonal = trimOrNull(personalPhone);
  let resolvedBusinessPhone = trimOrNull(businessPhone);
  let resolvedLink = trimOrNull(businessLink);
  let linkedLeadId = null;
  let lead = null;

  if (leadId) {
    lead = await Lead.findOne({
      _id: leadId,
      agentId: req.user._id,
      stage: 'active',
    });

    if (!lead) {
      throw new ApiError(404, 'Lead not found or no longer active.');
    }

    resolvedName = trimOrNull(businessName) || lead.businessName;
    resolvedPersonal =
      trimOrNull(personalPhone) ||
      trimOrNull(lead.personalPhone) ||
      resolvedPersonal;
    resolvedBusinessPhone =
      trimOrNull(businessPhone) ||
      trimOrNull(lead.businessPhone) ||
      resolvedBusinessPhone;
    resolvedLink =
      trimOrNull(businessLink) ||
      trimOrNull(lead.websiteLink) ||
      resolvedLink;
    linkedLeadId = lead._id;
  }

  if (!resolvedName) {
    throw new ApiError(400, 'Business Name is required');
  }

  if (!resolvedLink) {
    throw new ApiError(400, 'Website Link is required');
  }

  // Prefer explicit body; fall back to linked lead's pre-assigned closer
  const closerSource =
    assignedCloserId ||
    (lead?.closerId ? String(lead.closerId) : null);
  const closer = await resolveApprovedCloser(closerSource);

  const scheduleAlerts = buildAlertFlagsForSchedule(callbackAtDate);
  const noteVal = trimOrNull(notes);

  // Upsert open lead-linked callback so reschedules don't duplicate agenda rows
  let callback = null;
  if (linkedLeadId) {
    callback = await Callback.findOne({
      leadId: linkedLeadId,
      agentId: req.user._id,
      status: { $in: ['pending', 'attended'] },
    }).sort({ updatedAt: -1 });
  }

  if (callback) {
    const prevAt = callback.callbackAt
      ? new Date(callback.callbackAt).getTime()
      : null;
    const nextAt = callbackAtDate.getTime();
    callback.businessName = resolvedName;
    callback.personalPhone = resolvedPersonal;
    callback.businessPhone = resolvedBusinessPhone;
    callback.businessLink = resolvedLink;
    callback.callbackAt = callbackAtDate;
    callback.notes = noteVal;
    callback.assignedCloserId = closer._id;
    callback.status = 'pending';
    callback.alerts =
      nextAt !== prevAt
        ? scheduleAlerts
        : buildAlertFlagsForSchedule(callbackAtDate);
    await callback.save();
  } else {
    callback = await Callback.create({
      businessName: resolvedName,
      personalPhone: resolvedPersonal,
      businessPhone: resolvedBusinessPhone,
      businessLink: resolvedLink,
      callbackAt: callbackAtDate,
      notes: noteVal,
      agentId: req.user._id,
      leadId: linkedLeadId,
      assignedCloserId: closer._id,
      status: 'pending',
      alerts: scheduleAlerts,
    });
  }

  // Keep lead Follow-up (PKT) column in sync when scheduling from a lead
  if (lead) {
    lead.followUp = {
      callbackAt: callbackAtDate,
      notes: noteVal || lead.followUp?.notes || null,
      acknowledged: false,
      alerts: scheduleAlerts,
    };
    await lead.save();
  }

  res
    .status(201)
    .json(new ApiResponse(201, { callback }, 'Callback created successfully'));
});

export const getMyCallbacks = asyncHandler(async (req, res) => {
  const includeResolved = req.query.includeResolved === 'true';

  // Expire 24h agent window first, then heal leftover agenda rows
  await escalateStaleAgentLeads(req.user._id);
  await healStaleAgentCallbacks(req.user._id);

  const filter = { agentId: req.user._id };

  if (!includeResolved) {
    // Active agenda: pending (due) + attended (viewed — no longer overdue / ringing)
    filter.status = { $in: ['pending', 'attended'] };
  }

  const callbacks = await Callback.find(filter)
    .populate(
      'leadId',
      'businessName personalPhone businessPhone websiteLink status stage agentId closerId'
    )
    .populate('assignedCloserId', 'fullName username role')
    .sort({ callbackAt: 1 });

  // Safety filter: only with_agent active leads (or standalone callbacks)
  const visible = includeResolved
    ? callbacks
    : callbacks.filter((cb) => {
        if (!cb.leadId) return true;
        const lead = cb.leadId;
        return (
          lead.stage === 'active' &&
          lead.status === 'with_agent' &&
          String(lead.agentId) === String(req.user._id)
        );
      });

  res
    .status(200)
    .json(new ApiResponse(200, { callbacks: visible }, 'My callbacks retrieved'));
});

/**
 * Super Admin / Auditor — full callback audit feed with lead + assignee.
 */
export const getAdminCallbacks = asyncHandler(async (req, res) => {
  const callbacks = await Callback.find()
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate(
      'leadId',
      'businessName personalPhone businessPhone websiteLink status stage agentId closerId'
    )
    .sort({ callbackAt: -1 });

  res
    .status(200)
    .json(
      new ApiResponse(200, { callbacks }, 'Admin callbacks audit retrieved')
    );
});

export const getAllCallbacks = asyncHandler(async (req, res) => {
  const callbacks = await Callback.find()
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate(
      'leadId',
      'businessName personalPhone businessPhone websiteLink status stage'
    )
    .sort({ callbackAt: 1 });

  res
    .status(200)
    .json(new ApiResponse(200, { callbacks }, 'All callbacks retrieved'));
});

export const updateCallback = asyncHandler(async (req, res) => {
  const callback = await Callback.findById(req.params.id);

  if (!callback) {
    throw new ApiError(404, 'Callback not found');
  }

  if (!isOwnerOrSuperAdmin(callback, req.user)) {
    throw new ApiError(403, 'You can only update your own callbacks');
  }

  const {
    businessName,
    personalPhone,
    businessPhone,
    businessLink,
    callbackAt,
    notes,
    status,
    assignedCloserId,
  } = req.body;

  if (businessName !== undefined) {
    const name = trimOrNull(businessName);
    if (!name) throw new ApiError(400, 'Business Name is required');
    callback.businessName = name;
  }
  if (personalPhone !== undefined) {
    callback.personalPhone = trimOrNull(personalPhone);
  }
  if (businessPhone !== undefined) {
    callback.businessPhone = trimOrNull(businessPhone);
  }
  if (businessLink !== undefined) {
    const link = trimOrNull(businessLink);
    if (!callback.leadId && !link) {
      throw new ApiError(400, 'Website Link is required');
    }
    callback.businessLink = link;
  }
  if (assignedCloserId !== undefined) {
    const closer = await resolveApprovedCloser(assignedCloserId);
    callback.assignedCloserId = closer._id;
  }
  if (callbackAt !== undefined) {
    callback.callbackAt = new Date(callbackAt);
    // Reschedule: arm exact-time; skip 5-min warning if <5 minutes remain
    callback.alerts = buildAlertFlagsForSchedule(callback.callbackAt);
    if (callback.status === 'attended') {
      callback.status = 'pending';
    }
  }
  if (notes !== undefined) callback.notes = trimOrNull(notes);
  if (status !== undefined) {
    const allowed = [
      'pending',
      'attended',
      'promoted',
      'completed',
      'transferred',
      'cancelled',
    ];
    if (!allowed.includes(status)) {
      throw new ApiError(400, 'Invalid status');
    }
    callback.status = status;
    // Attended / resolved — silence so scheduler never re-rings
    if (status === 'attended' || status === 'completed' || status === 'cancelled') {
      if (!callback.alerts) {
        callback.alerts = { fiveMinFired: false, exactTimeFired: false };
      }
      callback.alerts.fiveMinFired = true;
      callback.alerts.exactTimeFired = true;
    }
  }

  await callback.save();

  // Keep linked lead follow-up OVERDUE badge in sync
  if (callback.leadId) {
    const lead = await Lead.findById(callback.leadId);
    if (lead?.followUp) {
      if (status === 'attended' || status === 'completed') {
        lead.followUp.acknowledged = true;
        if (!lead.followUp.alerts) lead.followUp.alerts = {};
        lead.followUp.alerts.fiveMinFired = true;
        lead.followUp.alerts.exactTimeFired = true;
        await lead.save();
      } else if (callbackAt !== undefined) {
        lead.followUp.callbackAt = callback.callbackAt;
        lead.followUp.acknowledged = false;
        lead.followUp.alerts = buildAlertFlagsForSchedule(callback.callbackAt);
        await lead.save();
      }
    }
  }

  res
    .status(200)
    .json(new ApiResponse(200, { callback }, 'Callback updated successfully'));
});

export const deleteCallback = asyncHandler(async (req, res) => {
  const callback = await Callback.findById(req.params.id);

  if (!callback) {
    throw new ApiError(404, 'Callback not found');
  }

  if (!isOwnerOrSuperAdmin(callback, req.user)) {
    throw new ApiError(403, 'You can only delete your own callbacks');
  }

  await callback.deleteOne();

  res
    .status(200)
    .json(new ApiResponse(200, {}, 'Callback deleted successfully'));
});

export const markAlert = asyncHandler(async (req, res) => {
  const { fiveMinFired, exactTimeFired } = req.body;

  if (typeof fiveMinFired !== 'boolean' && typeof exactTimeFired !== 'boolean') {
    throw new ApiError(
      400,
      'Provide fiveMinFired and/or exactTimeFired as boolean'
    );
  }

  const $set = {};
  if (typeof fiveMinFired === 'boolean') {
    $set['alerts.fiveMinFired'] = fiveMinFired;
  }
  if (typeof exactTimeFired === 'boolean') {
    $set['alerts.exactTimeFired'] = exactTimeFired;
  }

  const callback = await Callback.findOneAndUpdate(
    { _id: req.params.id, agentId: req.user._id },
    { $set },
    { returnDocument: 'after' }
  );

  if (!callback) {
    throw new ApiError(404, 'Callback not found for your account.');
  }

  res
    .status(200)
    .json(new ApiResponse(200, { callback }, 'Callback alert flags updated'));
});

export const promoteCallback = asyncHandler(async (req, res) => {
  const callback = await Callback.findById(req.params.id);

  if (!callback) {
    throw new ApiError(404, 'Callback not found');
  }

  if (callback.agentId.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'You can only promote your own callbacks');
  }

  if (callback.status === 'promoted') {
    throw new ApiError(400, 'Callback has already been promoted');
  }

  // Allow last-minute reassignment from the Promote modal
  const closerSource =
    req.body?.assignedCloserId ||
    req.body?.closerId ||
    callback.assignedCloserId;
  const closer = await resolveApprovedCloser(closerSource);
  callback.assignedCloserId = closer._id;

  const promotedPhone = primaryPhoneFromCallback(callback);
  if (!promotedPhone) {
    throw new ApiError(
      400,
      'Add a Personal or Business phone before promoting to a lead.'
    );
  }

  const phoneNoteParts = [];
  if (callback.personalPhone) {
    phoneNoteParts.push(`Personal: ${callback.personalPhone}`);
  }
  if (callback.businessPhone) {
    phoneNoteParts.push(`Business: ${callback.businessPhone}`);
  }
  const phoneCarryNote = phoneNoteParts.length
    ? phoneNoteParts.join(' · ')
    : null;
  const combinedNotes = [callback.notes, phoneCarryNote]
    .filter(Boolean)
    .join('\n');

  const lead = await Lead.create({
    businessName: callback.businessName,
    personalPhone: trimOrNull(callback.personalPhone),
    businessPhone: trimOrNull(callback.businessPhone),
    websiteLink: callback.businessLink || 'https://',
    servicesOffered: 'TBD',
    paymentOffered: 0,
    paymentReceived: 0,
    paymentPending: 0,
    notes: combinedNotes || null,
    agentId: callback.agentId,
    closerId: closer._id,
    sourceCallbackId: callback._id,
  });

  callback.status = 'promoted';
  callback.promotedLeadId = lead._id;
  await callback.save();

  res
    .status(201)
    .json(new ApiResponse(201, { lead }, 'Callback promoted to lead'));
});

/* ─── Closer callbacks (isolated from sales-agent flows) ─── */

/**
 * Closers schedule against an assigned lead OR as a standalone direct callback.
 * Standalone: businessName + businessPhone + callbackAt (leadId null).
 */
export const createCloserCallback = asyncHandler(async (req, res) => {
  const {
    callbackAt,
    notes,
    leadId,
    businessName,
    businessPhone,
    personalPhone,
    businessLink,
  } = req.body;

  if (!callbackAt) {
    throw new ApiError(400, 'callbackAt is required');
  }

  const callbackAtDate = new Date(callbackAt);
  if (Number.isNaN(callbackAtDate.getTime())) {
    throw new ApiError(400, 'callbackAt must be a valid date');
  }

  let resolvedName = trimOrNull(businessName) || '';
  let resolvedBusinessPhone = trimOrNull(businessPhone);
  let resolvedPersonalPhone = trimOrNull(personalPhone);
  let resolvedLink = trimOrNull(businessLink);
  let linkedLeadId = null;
  let lead = null;

  if (leadId) {
    lead = await Lead.findOne({
      _id: leadId,
      closerId: req.user._id,
      stage: 'active',
      status: { $in: ['with_closer', 'in_progress'] },
    });

    if (!lead) {
      throw new ApiError(
        404,
        'Lead not found, not assigned to you, or no longer active.'
      );
    }

    resolvedName = lead.businessName;
    resolvedBusinessPhone =
      trimOrNull(businessPhone) ||
      trimOrNull(lead.businessPhone) ||
      resolvedBusinessPhone;
    resolvedPersonalPhone =
      trimOrNull(personalPhone) ||
      trimOrNull(lead.personalPhone) ||
      resolvedPersonalPhone;
    resolvedLink = trimOrNull(lead.websiteLink) || resolvedLink;
    linkedLeadId = lead._id;
  }

  if (!resolvedName) {
    throw new ApiError(
      400,
      leadId
        ? 'Linked lead is missing business name'
        : 'Business Name is required'
    );
  }

  // Standalone direct contact: same locked fields as agent callbacks (no Assign Closer —
  // closerId is always the logged-in closer). Phones optional; Website Link required.
  if (!leadId) {
    if (!resolvedLink) {
      throw new ApiError(400, 'Website Link is required');
    }
  } else if (!resolvedLink) {
    resolvedLink = trimOrNull(lead?.websiteLink) || 'https://';
  }

  // Fresh flags for the live reminder poller. If <5 minutes remain until
  // callbackAt, mark fiveMinFired so the early warning does not ring on save;
  // exactTimeFired stays false so the due chime still fires at callbackAt.
  const scheduleAlerts = buildAlertFlagsForSchedule(callbackAtDate);

  const agentFromLead = lead?.agentId || null;
  const callback = await Callback.create({
    businessName: resolvedName,
    personalPhone: resolvedPersonalPhone,
    businessPhone: resolvedBusinessPhone,
    businessLink: resolvedLink,
    callbackAt: callbackAtDate,
    notes: trimOrNull(notes),
    closerId: req.user._id,
    agentId: agentFromLead,
    // Always tag the logged-in closer so agenda + reminder poller match
    // closerId === user OR assignedCloserId === user (Direct Contact included).
    assignedCloserId: req.user._id,
    leadId: linkedLeadId,
    status: 'pending',
    alerts: scheduleAlerts,
  });

  if (lead) {
    const prevAt = lead.followUp?.callbackAt
      ? new Date(lead.followUp.callbackAt).getTime()
      : null;
    const nextAt = callbackAtDate.getTime();

    lead.followUp = {
      callbackAt: callbackAtDate,
      notes: notes || lead.followUp?.notes || null,
      acknowledged: nextAt !== prevAt ? false : lead.followUp?.acknowledged || false,
      alerts:
        nextAt !== prevAt
          ? scheduleAlerts
          : {
              fiveMinFired: lead.followUp?.alerts?.fiveMinFired || false,
              exactTimeFired: lead.followUp?.alerts?.exactTimeFired || false,
            },
    };
    await lead.save();
  }

  await callback.populate(
    'leadId',
    'businessName personalPhone businessPhone status stage closerId'
  );

  res
    .status(201)
    .json(
      new ApiResponse(201, { callback }, 'Closer callback scheduled successfully')
    );
});

export const getMyCloserCallbacks = asyncHandler(async (req, res) => {
  // Pick up any agent leads whose 24h window just expired (+ callback transfer)
  await escalateStaleAgentLeads();

  // Heal stuck rings: pending + overdue + exactTimeFired=true means the due
  // flag was written before a durable OK/attend. Reset so the modal can re-open.
  await Callback.updateMany(
    {
      ...closerAgendaMatch(req.user._id),
      status: 'pending',
      callbackAt: { $lte: new Date() },
      'alerts.exactTimeFired': true,
    },
    {
      $set: {
        'alerts.exactTimeFired': false,
        // Overdue: skip 5-min warning; keep exact-time armed
        'alerts.fiveMinFired': true,
      },
    }
  );

  const filter = {
    ...closerAgendaMatch(req.user._id),
    status: { $in: ['pending', 'attended', 'completed'] },
  };

  const callbacks = await Callback.find(filter)
    .populate(
      'leadId',
      'businessName personalPhone businessPhone personalEmail businessEmail websiteLink status stage closerId'
    )
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('assignedCloserId', 'fullName username role')
    .sort({ callbackAt: 1 })
    .lean();

  // Flatten contact fields onto each row so cards never blank when lead has data
  const enriched = callbacks.map((cb) => {
    const lead = cb.leadId && typeof cb.leadId === 'object' ? cb.leadId : null;
    return {
      ...cb,
      personalPhone:
        trimOrNull(cb.personalPhone) ||
        trimOrNull(lead?.personalPhone) ||
        null,
      businessPhone:
        trimOrNull(cb.businessPhone) ||
        trimOrNull(lead?.businessPhone) ||
        null,
      personalEmail: trimOrNull(lead?.personalEmail) || null,
      businessEmail: trimOrNull(lead?.businessEmail) || null,
    };
  });

  res
    .status(200)
    .json(
      new ApiResponse(200, { callbacks: enriched }, 'Closer callbacks retrieved')
    );
});

export const updateCloserCallback = asyncHandler(async (req, res) => {
  const callback = await Callback.findOne({
    _id: req.params.id,
    ...closerAgendaMatch(req.user._id),
  });

  if (!callback) {
    throw new ApiError(404, 'Callback not found for your account.');
  }

  const { callbackAt, notes, status } = req.body;

  if (callbackAt !== undefined) {
    const next = new Date(callbackAt);
    if (Number.isNaN(next.getTime())) {
      throw new ApiError(400, 'callbackAt must be a valid date');
    }
    callback.callbackAt = next;
    // Reschedule: always re-arm BOTH phases so the new time rings again
    callback.alerts = { fiveMinFired: false, exactTimeFired: false };
    callback.status = 'pending';
  }

  if (notes !== undefined) {
    callback.notes = notes || null;
  }

  if (status !== undefined) {
    if (!['pending', 'attended', 'completed', 'cancelled'].includes(status)) {
      throw new ApiError(400, 'Invalid status');
    }
    callback.status = status;
    if (
      status === 'attended' ||
      status === 'completed' ||
      status === 'cancelled'
    ) {
      if (!callback.alerts) {
        callback.alerts = { fiveMinFired: false, exactTimeFired: false };
      }
      callback.alerts.fiveMinFired = true;
      callback.alerts.exactTimeFired = true;
    }
  }

  await callback.save();

  // Keep lead follow-up in sync when rescheduling
  if (callbackAt !== undefined && callback.leadId) {
    const lead = await Lead.findOne({
      _id: callback.leadId,
      closerId: req.user._id,
      stage: 'active',
    });
    if (lead) {
      lead.followUp = {
        callbackAt: callback.callbackAt,
        notes: callback.notes || lead.followUp?.notes || null,
        acknowledged: false,
        alerts: { fiveMinFired: false, exactTimeFired: false },
      };
      await lead.save();
    }
  }

  // Attended from View — clear OVERDUE on linked lead
  if (
    (status === 'attended' || status === 'completed') &&
    callback.leadId
  ) {
    const lead = await Lead.findOne({
      _id: callback.leadId,
      closerId: req.user._id,
      stage: 'active',
    });
    if (lead?.followUp) {
      lead.followUp.acknowledged = true;
      if (!lead.followUp.alerts) lead.followUp.alerts = {};
      lead.followUp.alerts.fiveMinFired = true;
      lead.followUp.alerts.exactTimeFired = true;
      await lead.save();
    }
  }

  res
    .status(200)
    .json(new ApiResponse(200, { callback }, 'Closer callback updated'));
});

/**
 * Closer Direct Contact → Lead: create a closer-owned lead (agentId null,
 * status with_closer) and link/promote the standalone callback.
 */
export const moveCloserCallbackToLead = asyncHandler(async (req, res) => {
  const callback = await Callback.findOne({
    _id: req.params.id,
    closerId: req.user._id,
  });

  if (!callback) {
    throw new ApiError(404, 'Callback not found for your account.');
  }

  if (callback.leadId || callback.promotedLeadId) {
    throw new ApiError(400, 'This callback is already linked to a lead.');
  }

  if (callback.status === 'promoted') {
    throw new ApiError(400, 'Callback has already been promoted.');
  }

  // Only closer-created Direct Contact rows (not agent-agenda transfers)
  if (callback.agentId) {
    throw new ApiError(
      400,
      'Only closer Direct Contact callbacks can be moved to Leads.'
    );
  }

  const businessName = trimOrNull(req.body.businessName) || callback.businessName;
  if (!businessName) {
    throw new ApiError(400, 'Business Name is required');
  }

  let websiteLink =
    trimOrNull(req.body.websiteLink) ||
    trimOrNull(req.body.businessLink) ||
    trimOrNull(callback.businessLink);
  if (!websiteLink) {
    throw new ApiError(400, 'Website Link is required');
  }
  if (!/^https?:\/\//i.test(websiteLink)) {
    websiteLink = `https://${websiteLink}`;
  }

  const servicesOffered = trimOrNull(req.body.servicesOffered);
  if (!servicesOffered) {
    throw new ApiError(400, 'Services Offered is required');
  }

  const payment = parseLeadPaymentFields(req.body, { requireOffered: true });

  const personalPhone =
    req.body.personalPhone !== undefined
      ? trimOrNull(req.body.personalPhone)
      : trimOrNull(callback.personalPhone);
  const businessPhone =
    req.body.businessPhone !== undefined
      ? trimOrNull(req.body.businessPhone)
      : trimOrNull(callback.businessPhone);

  const lead = await Lead.create({
    businessName,
    personalPhone,
    businessPhone,
    websiteLink,
    clientName: trimOrNull(req.body.clientName),
    businessEmail: trimOrNull(req.body.businessEmail),
    personalEmail: trimOrNull(req.body.personalEmail),
    gmbLink: trimOrNull(req.body.gmbLink),
    serviceAreas: trimOrNull(req.body.serviceAreas),
    servicesOffered,
    paymentOffered: payment.paymentOffered,
    paymentReceived: payment.paymentReceived,
    paymentPending: payment.paymentPending,
    notes:
      req.body.notes !== undefined
        ? trimOrNull(req.body.notes)
        : trimOrNull(callback.notes),
    agentId: null,
    closerId: req.user._id,
    status: 'with_closer',
    stage: 'active',
    sourceCallbackId: callback._id,
    handedOverAt: new Date(),
    escalationType: 'manual',
    escalatedReason: 'Closer Direct Contact',
  });

  callback.leadId = lead._id;
  callback.promotedLeadId = lead._id;
  callback.status = 'promoted';
  callback.businessName = businessName;
  callback.personalPhone = personalPhone;
  callback.businessPhone = businessPhone;
  callback.businessLink = websiteLink;
  if (!callback.alerts) {
    callback.alerts = { fiveMinFired: false, exactTimeFired: false };
  }
  callback.alerts.fiveMinFired = true;
  callback.alerts.exactTimeFired = true;
  await callback.save();

  // Mirror schedule onto the new lead follow-up so Closer Leads stay in sync
  if (callback.callbackAt) {
    lead.followUp = {
      callbackAt: callback.callbackAt,
      notes: callback.notes || null,
      acknowledged: false,
      alerts: buildAlertFlagsForSchedule(callback.callbackAt),
    };
    await lead.save();
  }

  await lead.populate([
    { path: 'agentId', select: 'fullName username role' },
    { path: 'closerId', select: 'fullName username role' },
  ]);

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { lead, callback },
        'Callback moved to Leads successfully'
      )
    );
});

export const markCloserAlert = asyncHandler(async (req, res) => {
  const { fiveMinFired, exactTimeFired } = req.body;

  if (typeof fiveMinFired !== 'boolean' && typeof exactTimeFired !== 'boolean') {
    throw new ApiError(
      400,
      'Provide fiveMinFired and/or exactTimeFired as boolean'
    );
  }

  const $set = {};
  if (typeof fiveMinFired === 'boolean') {
    $set['alerts.fiveMinFired'] = fiveMinFired;
  }
  if (typeof exactTimeFired === 'boolean') {
    $set['alerts.exactTimeFired'] = exactTimeFired;
  }

  const owned = await Callback.findOne({
    _id: req.params.id,
    ...closerAgendaMatch(req.user._id),
  }).select('_id');

  if (!owned) {
    throw new ApiError(404, 'Callback not found for your account.');
  }

  const callback = await Callback.findOneAndUpdate(
    { _id: req.params.id },
    { $set },
    { new: true }
  );

  if (!callback) {
    throw new ApiError(404, 'Callback not found for your account.');
  }

  // Keep linked lead follow-up phase flags in sync (never flip both at once)
  if (callback.leadId && Object.keys($set).length > 0) {
    const leadSet = {};
    if (typeof fiveMinFired === 'boolean') {
      leadSet['followUp.alerts.fiveMinFired'] = fiveMinFired;
    }
    if (typeof exactTimeFired === 'boolean') {
      leadSet['followUp.alerts.exactTimeFired'] = exactTimeFired;
    }
    if (Object.keys(leadSet).length > 0) {
      await Lead.updateOne(
        {
          _id: callback.leadId,
          stage: 'active',
          'followUp.callbackAt': { $exists: true },
          $or: [{ closerId: req.user._id }],
        },
        { $set: leadSet }
      );
    }
  }

  res
    .status(200)
    .json(new ApiResponse(200, { callback }, 'Closer callback alert flags updated'));
});

/**
 * Read-only team agenda: an agent's scheduled callbacks tagged to this closer.
 * Returns rows shaped for BUSINESS / WEBSITE / EMAIL / SCHEDULED TIME (PKT).
 */
export const getCloserTeamAgentCallbacks = asyncHandler(async (req, res) => {
  const closerId = req.user._id;
  const { agentId } = req.params;

  if (!agentId || !mongoose.Types.ObjectId.isValid(agentId)) {
    throw new ApiError(400, 'Valid agentId is required');
  }

  // Leads this closer owns that belong to the selected agent
  const linkedLeadIds = await Lead.find({
    closerId,
    agentId,
  }).distinct('_id');

  const callbacks = await Callback.find({
    agentId,
    status: { $in: ['pending', 'attended'] },
    $or: [
      { assignedCloserId: closerId },
      ...(linkedLeadIds.length ? [{ leadId: { $in: linkedLeadIds } }] : []),
    ],
  })
    .populate('leadId', 'businessName websiteLink businessEmail personalEmail')
    .sort({ callbackAt: 1 })
    .lean();

  const rows = callbacks.map((cb) => {
    const lead = cb.leadId && typeof cb.leadId === 'object' ? cb.leadId : null;
    const email =
      lead?.businessEmail ||
      lead?.personalEmail ||
      null;
    const website =
      cb.businessLink ||
      lead?.websiteLink ||
      null;

    return {
      _id: cb._id,
      businessName: cb.businessName || lead?.businessName || '—',
      websiteLink: website,
      email,
      personalEmail: lead?.personalEmail || null,
      businessEmail: lead?.businessEmail || null,
      callbackAt: cb.callbackAt,
      createdAt: cb.createdAt,
      status: cb.status,
    };
  });

  res
    .status(200)
    .json(
      new ApiResponse(200, { callbacks: rows }, 'Team agent callbacks retrieved')
    );
});
