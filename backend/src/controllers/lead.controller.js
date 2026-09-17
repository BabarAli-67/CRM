import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import Lead from '../models/lead.model.js';

const refId = (ref) => {
  if (!ref) return null;
  if (typeof ref === 'object' && ref._id != null) return String(ref._id);
  return String(ref);
};

const canAccessLead = (lead, user) => {
  if (user.role === 'super_admin') return true;

  const userId = String(user._id);
  const isOwningAgent = refId(lead.agentId) === userId;
  const isAssignedCloser = refId(lead.closerId) === userId;

  return isOwningAgent || isAssignedCloser;
};

const UPDATABLE_FIELDS = [
  'clientName',
  'businessName',
  'phone',
  'workEmail',
  'personalEmail',
  'yelpLink',
  'websiteLink',
  'gmbLink',
  'servicesArea',
  'serviceOffered',
  'salesAmount',
  'closerId',
  'notes',
];

export const createLead = asyncHandler(async (req, res) => {
  const { businessName, phone } = req.body;

  if (!businessName || !phone) {
    throw new ApiError(400, 'businessName and phone are required');
  }

  const payload = {
    businessName,
    phone,
    agentId: req.user._id,
  };

  for (const field of UPDATABLE_FIELDS) {
    if (field === 'businessName' || field === 'phone') continue;
    if (req.body[field] !== undefined) {
      payload[field] = req.body[field] === '' ? null : req.body[field];
    }
  }

  if (req.body.followUp !== undefined) {
    payload.followUp = req.body.followUp;
  }

  const lead = await Lead.create(payload);

  res
    .status(201)
    .json(new ApiResponse(201, { lead }, 'Lead created successfully'));
});

export const getMyLeads = asyncHandler(async (req, res) => {
  // Vanishing Rule: never return closed/disqualified leads on this endpoint
  const leads = await Lead.find({
    agentId: req.user._id,
    stage: 'active',
  }).sort({ updatedAt: -1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'My active leads retrieved'));
});

export const getAssignedLeads = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    closerId: req.user._id,
    stage: 'active',
  }).sort({ updatedAt: -1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'Assigned active leads retrieved'));
});

export const getAllLeads = asyncHandler(async (req, res) => {
  const leads = await Lead.find()
    .populate('agentId', 'fullName email role')
    .populate('closerId', 'fullName email role')
    .populate('handover.assignedTechId', 'fullName email role')
    .sort({ updatedAt: -1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'All leads retrieved'));
});

export const getLeadById = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id)
    .populate('agentId', 'fullName email role')
    .populate('closerId', 'fullName email role');

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (!canAccessLead(lead, req.user)) {
    throw new ApiError(403, 'You can only view leads you own or are assigned to');
  }

  res.status(200).json(new ApiResponse(200, { lead }, 'Lead retrieved'));
});

export const updateLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (!canAccessLead(lead, req.user)) {
    throw new ApiError(
      403,
      'You can only update leads you own or are assigned to'
    );
  }

  for (const field of UPDATABLE_FIELDS) {
    if (req.body[field] !== undefined) {
      lead[field] =
        req.body[field] === '' || req.body[field] === null
          ? null
          : req.body[field];
    }
  }

  if (req.body.followUp !== undefined) {
    const nextFollowUp = req.body.followUp;

    if (nextFollowUp === null) {
      lead.followUp = undefined;
    } else {
      const prevAt = lead.followUp?.callbackAt
        ? new Date(lead.followUp.callbackAt).getTime()
        : null;
      const nextAt = nextFollowUp.callbackAt
        ? new Date(nextFollowUp.callbackAt).getTime()
        : null;

      lead.followUp = {
        callbackAt: nextFollowUp.callbackAt
          ? new Date(nextFollowUp.callbackAt)
          : lead.followUp?.callbackAt || null,
        notes:
          nextFollowUp.notes !== undefined
            ? nextFollowUp.notes || null
            : lead.followUp?.notes || null,
        alerts: {
          fiveMinFired: lead.followUp?.alerts?.fiveMinFired || false,
          exactTimeFired: lead.followUp?.alerts?.exactTimeFired || false,
        },
      };

      // Reschedule clears prior alert firings so reminders can fire for the new time
      if (nextAt !== null && nextAt !== prevAt) {
        lead.followUp.alerts.fiveMinFired = false;
        lead.followUp.alerts.exactTimeFired = false;
      }
    }
  }

  await lead.save();

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Lead updated successfully'));
});

export const disqualifyLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (!canAccessLead(lead, req.user)) {
    throw new ApiError(
      403,
      'You can only disqualify leads you own or are assigned to'
    );
  }

  const { disqualifiedReason } = req.body;

  if (!disqualifiedReason || !String(disqualifiedReason).trim()) {
    throw new ApiError(400, 'disqualifiedReason is required');
  }

  lead.stage = 'disqualified';
  lead.disqualifiedReason = String(disqualifiedReason).trim();
  await lead.save();

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Lead disqualified successfully'));
});

export const setFollowUp = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (!canAccessLead(lead, req.user)) {
    throw new ApiError(
      403,
      'You can only manage follow-ups on leads you own or are assigned to'
    );
  }

  const payload =
    req.body?.followUp !== undefined ? req.body.followUp : req.body;

  // Clear: null body, { followUp: null }, or { callbackAt: null }
  if (
    payload === null ||
    payload === undefined ||
    payload.callbackAt === null
  ) {
    lead.followUp = undefined;
    await lead.save();
    return res
      .status(200)
      .json(new ApiResponse(200, { lead }, 'Follow-up cleared'));
  }

  const { callbackAt, notes } = payload;

  if (!callbackAt) {
    throw new ApiError(400, 'callbackAt is required to set a follow-up');
  }

  const prevAt = lead.followUp?.callbackAt
    ? new Date(lead.followUp.callbackAt).getTime()
    : null;
  const nextAt = new Date(callbackAt).getTime();

  lead.followUp = {
    callbackAt: new Date(callbackAt),
    notes:
      notes !== undefined
        ? notes || null
        : lead.followUp?.notes || null,
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

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Follow-up updated successfully'));
});

export const markFollowUpAlert = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  // Owning agent OR assigned closer may flip the shared flag (whichever browser chimed)
  if (!canAccessLead(lead, req.user)) {
    throw new ApiError(
      403,
      'You can only update follow-up alerts on leads you own or are assigned to'
    );
  }

  if (!lead.followUp) {
    throw new ApiError(400, 'Lead has no follow-up scheduled');
  }

  const { fiveMinFired, exactTimeFired } = req.body;

  if (typeof fiveMinFired !== 'boolean' && typeof exactTimeFired !== 'boolean') {
    throw new ApiError(
      400,
      'Provide fiveMinFired and/or exactTimeFired as boolean'
    );
  }

  if (!lead.followUp.alerts) {
    lead.followUp.alerts = { fiveMinFired: false, exactTimeFired: false };
  }

  // Only flip once — do not unset a flag that already fired
  if (fiveMinFired === true) {
    lead.followUp.alerts.fiveMinFired = true;
  }
  if (exactTimeFired === true) {
    lead.followUp.alerts.exactTimeFired = true;
  }

  await lead.save();

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Follow-up alert flags updated'));
});

export const closeLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (!canAccessLead(lead, req.user)) {
    throw new ApiError(
      403,
      'You can only close leads you own or are assigned to'
    );
  }

  if (lead.stage === 'closed_sale') {
    throw new ApiError(400, 'Lead is already closed');
  }

  const { payment } = req.body;

  lead.payment = {
    method: payment.method,
    linkUrl: payment.method === 'via_link' ? payment.linkUrl : null,
    cardLast4: payment.method === 'via_card' ? payment.cardLast4 : null,
    cardBrand:
      payment.method === 'via_card' ? payment.cardBrand || null : null,
    cardReferenceToken:
      payment.method === 'via_card' ? payment.cardReferenceToken : null,
  };

  lead.stage = 'closed_sale';
  lead.closedAt = new Date();
  lead.closedBy = req.user._id;
  lead.handover = {
    cstStatus: 'pending_review',
    assignedTechId: lead.handover?.assignedTechId || null,
    assignedAt: lead.handover?.assignedAt || null,
    completedAt: lead.handover?.completedAt || null,
  };

  await lead.save();

  // Vanishing Rule: do not return the lead document — only a minimal ack
  res.status(200).json(new ApiResponse(200, { closedCount: 1 }, 'Lead closed'));
});
