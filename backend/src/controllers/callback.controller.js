import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import Callback from '../models/callback.model.js';
import Lead from '../models/lead.model.js';

const isOwnerOrSuperAdmin = (callback, user) => {
  if (user.role === 'super_admin') return true;
  return callback.agentId.toString() === user._id.toString();
};

export const createCallback = asyncHandler(async (req, res) => {
  const { businessName, phone, businessLink, callbackAt, notes } = req.body;

  if (!businessName || !phone || !businessLink || !callbackAt) {
    throw new ApiError(
      400,
      'businessName, phone, businessLink, and callbackAt are required'
    );
  }

  const callback = await Callback.create({
    businessName,
    phone,
    businessLink,
    callbackAt: new Date(callbackAt),
    notes: notes || null,
    agentId: req.user._id,
  });

  res
    .status(201)
    .json(new ApiResponse(201, { callback }, 'Callback created successfully'));
});

export const getMyCallbacks = asyncHandler(async (req, res) => {
  const includePromoted = req.query.includePromoted === 'true';
  const filter = { agentId: req.user._id };

  if (!includePromoted) {
    filter.status = { $ne: 'promoted' };
  }

  const callbacks = await Callback.find(filter).sort({ callbackAt: 1 });

  res
    .status(200)
    .json(new ApiResponse(200, { callbacks }, 'My callbacks retrieved'));
});

export const getAllCallbacks = asyncHandler(async (req, res) => {
  const callbacks = await Callback.find()
    .populate('agentId', 'fullName email role')
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
  const callback = await Callback.findById(req.params.id);

  if (!callback) {
    throw new ApiError(404, 'Callback not found');
  }

  if (!isOwnerOrSuperAdmin(callback, req.user)) {
    throw new ApiError(403, 'You can only update alerts on your own callbacks');
  }

  const { fiveMinFired, exactTimeFired } = req.body;

  if (typeof fiveMinFired === 'boolean') {
    callback.alerts.fiveMinFired = fiveMinFired;
  }
  if (typeof exactTimeFired === 'boolean') {
    callback.alerts.exactTimeFired = exactTimeFired;
  }

  await callback.save();

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
