import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import Callback from '../models/callback.model.js';
import Lead from '../models/lead.model.js';
import { healStaleAgentCallbacks } from '../utils/callbackResolve.util.js';

const isOwnerOrSuperAdmin = (callback, user) => {
  if (user.role === 'super_admin') return true;
  return callback.agentId.toString() === user._id.toString();
};

export const createCallback = asyncHandler(async (req, res) => {
  const { businessName, phone, businessLink, callbackAt, notes, leadId } =
    req.body;

  if (!callbackAt) {
    throw new ApiError(400, 'callbackAt is required');
  }

  const callbackAtDate = new Date(callbackAt);
  if (Number.isNaN(callbackAtDate.getTime())) {
    throw new ApiError(400, 'callbackAt must be a valid date');
  }

  let resolvedName = businessName;
  let resolvedPhone = phone;
  let resolvedLink = businessLink || null;
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

    resolvedName = lead.businessName;
    resolvedPhone = lead.phone;
    resolvedLink = lead.websiteLink || null;
    linkedLeadId = lead._id;
  }

  if (!resolvedName || !resolvedPhone) {
    throw new ApiError(
      400,
      leadId
        ? 'Linked lead is missing business name or phone'
        : 'businessName, phone, and callbackAt are required'
    );
  }

  if (!leadId && !businessLink) {
    throw new ApiError(
      400,
      'businessName, phone, businessLink, and callbackAt are required'
    );
  }

  const callback = await Callback.create({
    businessName: resolvedName,
    phone: resolvedPhone,
    businessLink: resolvedLink,
    callbackAt: callbackAtDate,
    notes: notes || null,
    agentId: req.user._id,
    leadId: linkedLeadId,
  });

  // Keep lead Follow-up (PKT) column in sync when scheduling from a lead
  if (lead) {
    const prevAt = lead.followUp?.callbackAt
      ? new Date(lead.followUp.callbackAt).getTime()
      : null;
    const nextAt = callbackAtDate.getTime();

    lead.followUp = {
      callbackAt: callbackAtDate,
      notes: notes || lead.followUp?.notes || null,
      alerts: {
        fiveMinFired:
          nextAt !== prevAt
            ? false
            : lead.followUp?.alerts?.fiveMinFired || false,
        exactTimeFired:
          nextAt !== prevAt
            ? false
            : lead.followUp?.alerts?.exactTimeFired || false,
      },
    };
    await lead.save();
  }

  res
    .status(201)
    .json(new ApiResponse(201, { callback }, 'Callback created successfully'));
});

export const getMyCallbacks = asyncHandler(async (req, res) => {
  const includeResolved = req.query.includeResolved === 'true';

  // Heal any stale pending callbacks whose leads left the agent
  await healStaleAgentCallbacks(req.user._id);

  const filter = { agentId: req.user._id };

  if (!includeResolved) {
    // Active agenda only — resolved / transferred / cancelled / promoted excluded
    filter.status = 'pending';
  }

  const callbacks = await Callback.find(filter)
    .populate(
      'leadId',
      'businessName phone websiteLink status stage agentId'
    )
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
    .populate(
      'leadId',
      'businessName phone websiteLink status stage agentId closerId'
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
    .populate(
      'leadId',
      'businessName phone websiteLink status stage'
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

  const { businessName, phone, businessLink, callbackAt, notes, status } =
    req.body;

  if (businessName !== undefined) callback.businessName = businessName;
  if (phone !== undefined) callback.phone = phone;
  if (businessLink !== undefined) callback.businessLink = businessLink;
  if (callbackAt !== undefined) {
    callback.callbackAt = new Date(callbackAt);
    // Reschedule clears prior alert firings so reminders can fire for the new time
    callback.alerts.fiveMinFired = false;
    callback.alerts.exactTimeFired = false;
  }
  if (notes !== undefined) callback.notes = notes || null;
  if (status !== undefined) callback.status = status;

  await callback.save();

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

  const lead = await Lead.create({
    businessName: callback.businessName,
    phone: callback.phone,
    websiteLink: callback.businessLink,
    notes: callback.notes,
    agentId: callback.agentId,
    sourceCallbackId: callback._id,
  });

  callback.status = 'promoted';
  callback.promotedLeadId = lead._id;
  await callback.save();

  res
    .status(201)
    .json(new ApiResponse(201, { lead }, 'Callback promoted to lead'));
});
