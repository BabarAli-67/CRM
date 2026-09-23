import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import Lead from '../models/lead.model.js';
import { resolveCallbacksForLead } from '../utils/callbackResolve.util.js';

const refId = (ref) => {
  if (!ref) return null;
  if (typeof ref === 'object' && ref._id != null) return String(ref._id);
  return String(ref);
};

const canAccessLead = (lead, user) => {
  if (
    user.role === 'super_admin' ||
    user.role === 'admin' ||
    user.role === 'cst_manager'
  ) {
    return true;
  }

  const userId = String(user._id);
  const isOwningAgent = refId(lead.agentId) === userId;
  const isAssignedCloser = refId(lead.closerId) === userId;
  const isPoolLead =
    user.role === 'closer' &&
    lead.stage === 'active' &&
    lead.status === 'pending_closer_claim' &&
    !lead.closerId;

  // Agent-closed sales awaiting CST review are visible to any closer
  const cst = lead.handover?.cstStatus;
  const isUnassignedClosedForCloser =
    user.role === 'closer' &&
    lead.stage === 'closed_sale' &&
    !lead.closerId &&
    (!cst || cst === 'awaiting_handover');

  // Tech may only see leads assigned specifically to them
  const isAssignedTech =
    user.role === 'tech_team' &&
    refId(lead.handover?.assignedTechId) === userId;

  return (
    isOwningAgent ||
    isAssignedCloser ||
    isPoolLead ||
    isUnassignedClosedForCloser ||
    isAssignedTech
  );
};

/** Shared filter: closed sales for closer review / ownership. */
const closerClosedSalesFilter = (closerId) => ({
  stage: 'closed_sale',
  $or: [
    { closerId },
    {
      $and: [
        { $or: [{ closerId: null }, { closerId: { $exists: false } }] },
        {
          $or: [
            { 'handover.cstStatus': 'awaiting_handover' },
            { 'handover.cstStatus': { $exists: false } },
            { handover: { $exists: false } },
          ],
        },
      ],
    },
  ],
});

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
  'notes',
];

export const createLead = asyncHandler(async (req, res) => {
  const { businessName, phone } = req.body;

  if (!businessName || !phone) {
    throw new ApiError(400, 'businessName and phone are required');
  }

  const sendToCloserPool = Boolean(req.body.sendToCloserPool);

  const payload = {
    businessName: String(businessName).trim(),
    phone: String(phone).trim(),
    agentId: req.user._id,
    status: sendToCloserPool ? 'pending_closer_claim' : 'with_agent',
    stage: 'active',
  };

  if (!sendToCloserPool) {
    payload.closerId = null;
  }

  if (req.body.websiteLink !== undefined) {
    payload.websiteLink =
      req.body.websiteLink === '' ? null : req.body.websiteLink;
  }
  if (req.body.notes !== undefined) {
    payload.notes = req.body.notes === '' ? null : req.body.notes;
  }

  // Allow optional legacy fields if still posted (edit paths / promote)
  for (const field of UPDATABLE_FIELDS) {
    if (
      field === 'businessName' ||
      field === 'phone' ||
      field === 'websiteLink' ||
      field === 'notes'
    ) {
      continue;
    }
    if (req.body[field] !== undefined) {
      payload[field] = req.body[field] === '' ? null : req.body[field];
    }
  }

  if (req.body.followUp !== undefined) {
    payload.followUp = req.body.followUp;
  }

  const lead = await Lead.create(payload);

  // Ensure pool leads have no closer assignment (null or omitted both OK for query)
  if (sendToCloserPool && lead.closerId) {
    lead.closerId = undefined;
    await lead.save();
  }

  await lead.populate('agentId', 'fullName username role');

  res.status(201).json(
    new ApiResponse(
      201,
      { lead },
      sendToCloserPool
        ? 'Lead created and sent to closer pool'
        : 'Lead created successfully'
    )
  );
});

export const getMyLeads = asyncHandler(async (req, res) => {
  // Agent desk: only leads still with the agent (pool / claimed vanish from this list)
  const leads = await Lead.find({
    agentId: req.user._id,
    stage: 'active',
    status: 'with_agent',
  })
    .populate('closerId', 'fullName username role')
    .sort({ updatedAt: -1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'My active leads retrieved'));
});

export const getAssignedLeads = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    closerId: req.user._id,
    stage: 'active',
    status: 'in_progress',
  })
    .populate('agentId', 'fullName username role')
    .sort({ updatedAt: -1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'Assigned active leads retrieved'));
});

export const getCloserPool = asyncHandler(async (req, res) => {
  // Unclaimed pool: any closer may fetch. Match null OR missing closerId
  // (Mongoose / legacy docs can omit the field after $unset).
  const leads = await Lead.find({
    stage: 'active',
    status: 'pending_closer_claim',
    $or: [{ closerId: null }, { closerId: { $exists: false } }],
  })
    .populate('agentId', 'fullName username role')
    .sort({ updatedAt: -1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'Closer pool retrieved'));
});

/** Closed sales for closer review — own closed sales + agent-closed (no closer yet). */
export const getCloserClosedSales = asyncHandler(async (req, res) => {
  const leads = await Lead.find(closerClosedSalesFilter(req.user._id))
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .sort({ closedAt: -1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'Closer closed sales retrieved'));
});

/**
 * Closer hands a closed sale to CST (pending_review → CST handover queue).
 * Also covers agent-closed sales with no closerId yet — closer claims on handover.
 */
export const moveLeadToCst = asyncHandler(async (req, res) => {
  let lead;

  if (req.user.role === 'super_admin') {
    lead = await Lead.findOne({ _id: req.params.id, stage: 'closed_sale' });
  } else {
    lead = await Lead.findOne({
      _id: req.params.id,
      ...closerClosedSalesFilter(req.user._id),
    });
  }

  if (!lead) {
    throw new ApiError(404, 'Closed sale not found or not available to you.');
  }

  const current = lead.handover?.cstStatus;
  if (
    current === 'pending_review' ||
    current === 'assigned' ||
    current === 'in_progress' ||
    current === 'completed'
  ) {
    throw new ApiError(409, 'This lead has already been handed over to CST.');
  }

  if (!lead.handover) {
    lead.handover = {};
  }

  // Agent-closed with no closer: claim ownership when handing to CST
  if (!lead.closerId && req.user.role === 'closer') {
    lead.closerId = req.user._id;
  }

  lead.handover.cstStatus = 'pending_review';
  lead.handover.handedOverAt = new Date();
  await lead.save();

  await lead.populate([
    { path: 'agentId', select: 'fullName username role' },
    { path: 'closerId', select: 'fullName username role' },
    { path: 'closedBy', select: 'fullName username role' },
  ]);

  res
    .status(200)
    .json(
      new ApiResponse(200, { lead }, 'Lead handed over to CST successfully')
    );
});

export const sendLeadToCloserPool = asyncHandler(async (req, res) => {
  const lead = await Lead.findOneAndUpdate(
    {
      _id: req.params.id,
      agentId: req.user._id,
      stage: 'active',
      status: { $in: ['with_agent', 'pending_closer_claim'] },
    },
    {
      $set: {
        status: 'pending_closer_claim',
        stage: 'active',
        // Silence agent follow-up chimes — lead left the agent's desk
        'followUp.alerts.fiveMinFired': true,
        'followUp.alerts.exactTimeFired': true,
      },
      // Prefer $unset so pool query matches both null and missing closerId
      $unset: { closerId: 1 },
    },
    { new: true, runValidators: true }
  );

  if (!lead) {
    throw new ApiError(
      404,
      'Lead not found, already claimed, or no longer active.'
    );
  }

  await resolveCallbacksForLead(lead._id, 'transferred');
  await lead.populate('agentId', 'fullName username role');

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Lead sent to closer pool'));
});

export const claimLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findOneAndUpdate(
    {
      _id: req.params.id,
      stage: 'active',
      status: 'pending_closer_claim',
      $or: [{ closerId: null }, { closerId: { $exists: false } }],
    },
    {
      $set: {
        closerId: req.user._id,
        status: 'in_progress',
      },
    },
    { new: true, runValidators: true }
  );

  if (!lead) {
    throw new ApiError(
      409,
      'This lead is no longer available — another closer may have claimed it.'
    );
  }

  await lead.populate([
    { path: 'agentId', select: 'fullName username role' },
    { path: 'closerId', select: 'fullName username role' },
  ]);

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Lead claimed successfully'));
});

export const getAllLeads = asyncHandler(async (req, res) => {
  const leads = await Lead.find()
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .populate('handover.assignedTechId', 'fullName username role')
    .sort({ updatedAt: -1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'All leads retrieved'));
});

export const getLeadById = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id)
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .populate('handover.assignedTechId', 'fullName username role');

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (!canAccessLead(lead, req.user)) {
    throw new ApiError(403, 'You can only view leads you own or are assigned to');
  }

  // Full document including payment + creator fields (authorized roles only)
  res.status(200).json(new ApiResponse(200, { lead }, 'Lead retrieved'));
});

export const updateLead = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const isDepartment =
    req.user.role === 'sales_agent' || req.user.role === 'closer';

  let lead;

  if (req.user.role === 'closer') {
    // Own active/closed OR unassigned agent-closed awaiting CST handover
    lead = await Lead.findOne({
      _id: req.params.id,
      $or: [
        {
          closerId: userId,
          $or: [
            { stage: 'active' },
            {
              stage: 'closed_sale',
              'handover.cstStatus': 'awaiting_handover',
            },
          ],
        },
        {
          stage: 'closed_sale',
          'handover.cstStatus': 'awaiting_handover',
          $or: [{ closerId: null }, { closerId: { $exists: false } }],
        },
      ],
    });
  } else if (req.user.role === 'sales_agent') {
    lead = await Lead.findOne({
      _id: req.params.id,
      agentId: userId,
      stage: 'active',
    });
  } else {
    lead = await Lead.findById(req.params.id);
  }

  if (!lead) {
    throw new ApiError(
      404,
      isDepartment
        ? 'Lead not found or no longer editable.'
        : 'Lead not found'
    );
  }

  // Super Admin may edit any stage; Auditor (admin) is read-only via middleware
  if (!isDepartment && !canAccessLead(lead, req.user)) {
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

  await lead.populate([
    { path: 'agentId', select: 'fullName username role' },
    { path: 'closerId', select: 'fullName username role' },
    { path: 'closedBy', select: 'fullName username role' },
  ]);

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Lead updated successfully'));
});

export const disqualifyLead = asyncHandler(async (req, res) => {
  const { disqualifiedReason } = req.body;

  if (!disqualifiedReason || !String(disqualifiedReason).trim()) {
    throw new ApiError(400, 'disqualifiedReason is required');
  }

  const userId = req.user._id;
  // Super Admin may disqualify any active lead; agents/closers must own/be assigned
  const filter =
    req.user.role === 'super_admin'
      ? { _id: req.params.id, stage: 'active' }
      : {
          _id: req.params.id,
          stage: 'active',
          $or: [{ agentId: userId }, { closerId: userId }],
        };

  const lead = await Lead.findOneAndUpdate(
    filter,
    {
      $set: {
        stage: 'disqualified',
        disqualifiedReason: String(disqualifiedReason).trim(),
        'followUp.alerts.fiveMinFired': true,
        'followUp.alerts.exactTimeFired': true,
      },
    },
    { returnDocument: 'after' }
  );

  if (!lead) {
    throw new ApiError(
      409,
      'This lead is no longer active — it may have just been closed or disqualified.'
    );
  }

  await resolveCallbacksForLead(lead._id, 'cancelled');

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Lead disqualified successfully'));
});

export const setFollowUp = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'active',
    $or: [{ agentId: userId }, { closerId: userId }],
  });

  if (!lead) {
    // Flat 404 — do not reveal closed vs missing (also covers non-owners)
    throw new ApiError(404, 'Lead not found or no longer editable.');
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
  const { payment } = req.body;

  if (!payment?.method) {
    throw new ApiError(400, 'payment is required');
  }

  const paymentDoc = {
    method: payment.method,
    linkUrl: null,
    cardLast4: null,
    cardBrand: null,
    cardReferenceToken: null,
    otherDetails: null,
  };

  if (payment.method === 'via_link') {
    paymentDoc.linkUrl = payment.linkUrl || null;
  } else if (payment.method === 'via_card') {
    paymentDoc.cardLast4 = payment.cardLast4;
    paymentDoc.cardBrand = payment.cardBrand || null;
    paymentDoc.cardReferenceToken = payment.cardReferenceToken;
  } else if (payment.method === 'other') {
    paymentDoc.otherDetails = String(payment.otherDetails || '').trim() || null;
  }

  const userId = req.user._id;

  const lead = await Lead.findOneAndUpdate(
    {
      _id: req.params.id,
      stage: 'active',
      $or: [{ agentId: userId }, { closerId: userId }],
    },
    {
      $set: {
        stage: 'closed_sale',
        closedAt: new Date(),
        closedBy: userId,
        payment: paymentDoc,
        // Stays with Closers for review — CST only after explicit Move to CST
        'handover.cstStatus': 'awaiting_handover',
        'followUp.alerts.fiveMinFired': true,
        'followUp.alerts.exactTimeFired': true,
      },
    },
    { new: true, runValidators: true }
  );

  if (!lead) {
    throw new ApiError(
      409,
      'This lead is no longer active — it may have just been closed or disqualified.'
    );
  }

  await resolveCallbacksForLead(lead._id, 'completed');

  // Vanishing Rule: do not return the lead document — only a minimal ack
  res.status(200).json(new ApiResponse(200, { closedCount: 1 }, 'Lead closed'));
});
