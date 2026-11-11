import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import path from 'path';
import Lead from '../models/lead.model.js';
import User from '../models/user.model.js';
import Callback from '../models/callback.model.js';
import { resolveCallbacksForLead } from '../utils/callbackResolve.util.js';
import { escalateStaleAgentLeads, AGENT_HOLD_MS } from '../utils/leadEscalation.util.js';

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

  const cst = lead.handover?.cstStatus;
  const awaitingCst =
    !cst || cst === 'awaiting_handover';

  // Match Closed Sales list: own closed sales OR unassigned agent-closed awaiting CST
  const isCloserClosedSaleVisible =
    user.role === 'closer' &&
    lead.stage === 'closed_sale' &&
    awaitingCst &&
    (isAssignedCloser || !refId(lead.closerId));

  // Assigned closer may always view their closed/disqualified/active leads
  const isCloserOnRecord =
    user.role === 'closer' && isAssignedCloser;

  // Tech may only see leads assigned specifically to them
  const isAssignedTech =
    user.role === 'tech_team' &&
    refId(lead.handover?.assignedTechId) === userId;

  return (
    isOwningAgent ||
    isCloserOnRecord ||
    isCloserClosedSaleVisible ||
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

/** Validate closerId is an approved closer user. */
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

const parseRequiredSalesAmount = (value) => {
  if (value === undefined || value === '' || value === null) {
    throw new ApiError(400, 'Sales amount is required');
  }
  const n = Number(value);
  if (Number.isNaN(n) || n < 0) {
    throw new ApiError(400, 'salesAmount must be a non-negative number');
  }
  return n;
};

export const createLead = asyncHandler(async (req, res) => {
  const { businessName, phone, closerId } = req.body;

  if (!businessName || !phone) {
    throw new ApiError(400, 'businessName and phone are required');
  }

  const closer = await resolveApprovedCloser(closerId);
  const salesAmount = parseRequiredSalesAmount(req.body.salesAmount);

  const payload = {
    businessName: String(businessName).trim(),
    phone: String(phone).trim(),
    agentId: req.user._id,
    closerId: closer._id,
    salesAmount,
    status: 'with_agent',
    stage: 'active',
  };

  if (req.body.websiteLink !== undefined) {
    payload.websiteLink =
      req.body.websiteLink === '' ? null : req.body.websiteLink;
  }
  if (req.body.notes !== undefined) {
    payload.notes = req.body.notes === '' ? null : req.body.notes;
  }

  // Allow optional intake fields if posted (edit paths / promote / full form)
  for (const field of UPDATABLE_FIELDS) {
    if (
      field === 'businessName' ||
      field === 'phone' ||
      field === 'websiteLink' ||
      field === 'notes' ||
      field === 'salesAmount'
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

  await lead.populate([
    { path: 'agentId', select: 'fullName username role' },
    { path: 'closerId', select: 'fullName username role' },
  ]);

  res
    .status(201)
    .json(new ApiResponse(201, { lead }, 'Lead created successfully'));
});

export const getMyLeads = asyncHandler(async (req, res) => {
  // Auto-escalate expired leads only (status write) — never mutates timestamps on active rows
  await escalateStaleAgentLeads(req.user._id);

  const holdCutoff = new Date(Date.now() - AGENT_HOLD_MS);

  // Pure read — still with_agent AND within the 24h hold window
  const leads = await Lead.find({
    agentId: req.user._id,
    stage: 'active',
    status: 'with_agent',
    createdAt: { $gt: holdCutoff },
  })
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .sort({ createdAt: -1 })
    .lean();

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'My active leads retrieved'));
});

export const getAssignedLeads = asyncHandler(async (req, res) => {
  await escalateStaleAgentLeads();

  // Only this closer's pre-assigned / handed leads (no shared pool)
  const leads = await Lead.find({
    closerId: req.user._id,
    stage: 'active',
    status: { $in: ['with_closer', 'in_progress'] },
  })
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .sort({ updatedAt: -1 })
    .lean();

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'Assigned active leads retrieved'));
});

/** Closed sales awaiting CST handoff for this closer (+ unassigned agent-closed). */
export const getCloserClosedSales = asyncHandler(async (req, res) => {
  const closerId = req.user._id;
  const leads = await Lead.find({
    stage: 'closed_sale',
    $and: [
      {
        $or: [
          { closerId },
          {
            $or: [{ closerId: null }, { closerId: { $exists: false } }],
          },
        ],
      },
      {
        $or: [
          { 'handover.cstStatus': 'awaiting_handover' },
          { 'handover.cstStatus': { $exists: false } },
          { handover: { $exists: false } },
        ],
      },
    ],
  })
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .sort({ closedAt: -1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'Closer closed sales retrieved'));
});

/** Disqualified leads assigned to this closer. */
export const getCloserDisqualifiedLeads = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    closerId: req.user._id,
    stage: 'disqualified',
  })
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .sort({ updatedAt: -1 });

  res
    .status(200)
    .json(
      new ApiResponse(200, { leads }, 'Closer disqualified leads retrieved')
    );
});

/**
 * Permanently delete a disqualified lead.
 * Closers may only delete their own disqualified leads; super_admin may delete any.
 */
export const deleteLeadPermanently = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (lead.stage !== 'disqualified') {
    throw new ApiError(
      400,
      'Only disqualified leads can be permanently deleted'
    );
  }

  const isSuperAdmin = req.user.role === 'super_admin';
  const isCloserOwner =
    req.user.role === 'closer' &&
    lead.closerId &&
    String(lead.closerId) === String(req.user._id);

  if (!isSuperAdmin && !isCloserOwner) {
    throw new ApiError(403, 'You can only delete your own disqualified leads');
  }

  const leadId = lead._id;
  await Lead.deleteOne({ _id: leadId });
  await Callback.deleteMany({
    $or: [{ leadId }, { promotedLeadId: leadId }],
  });

  res
    .status(200)
    .json(new ApiResponse(200, { id: String(leadId) }, 'Lead permanently deleted'));
});

/**
 * Sales agents who have assigned leads or tagged callbacks to this closer.
 */
export const getCloserTeamAgents = asyncHandler(async (req, res) => {
  const closerId = req.user._id;

  const fromLeads = await Lead.distinct('agentId', {
    closerId,
    agentId: { $ne: null },
  });
  const fromCallbacks = await Callback.distinct('agentId', {
    assignedCloserId: closerId,
    agentId: { $ne: null },
  });

  const idSet = new Set(
    [...fromLeads, ...fromCallbacks]
      .filter(Boolean)
      .map((id) => String(id))
  );

  const agents = await User.find({
    _id: { $in: [...idSet] },
    role: 'sales_agent',
  })
    .select('fullName username role status')
    .sort({ fullName: 1 });

  res
    .status(200)
    .json(new ApiResponse(200, { agents }, 'Closer team agents retrieved'));
});

/** Sales agent — history of leads they closed (or that belong to them as agent). */
export const getMyClosedSales = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    agentId: req.user._id,
    stage: 'closed_sale',
  })
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .sort({ closedAt: -1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'My closed sales retrieved'));
});

/**
 * Closer hands a closed sale to CST (pending_review → CST handover queue).
 * Accepts multipart: documentSigned, signedDocument file, upscale fields, notes.
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

  const body = req.body || {};
  const parseBool = (v) => {
    if (v === true || v === 'true' || v === '1' || v === 'yes') return true;
    if (v === false || v === 'false' || v === '0' || v === 'no') return false;
    return null;
  };

  const documentSigned = parseBool(body.documentSigned);
  if (documentSigned === null) {
    throw new ApiError(400, 'Document Sign selection (Yes/No) is required');
  }

  const upscaleEnabled = parseBool(body.upscale);
  if (upscaleEnabled === null) {
    throw new ApiError(400, 'Upscale selection (Yes/No) is required');
  }

  if (documentSigned && !req.file) {
    throw new ApiError(
      400,
      'Upload Signed Document is required when Document Sign is Yes'
    );
  }

  let upscaleItemName = null;
  let upscalePrice = null;
  if (upscaleEnabled) {
    upscaleItemName = String(body.upscaleItemName || '').trim();
    if (!upscaleItemName) {
      throw new ApiError(400, 'Upscale Item Name is required when Upscale is Yes');
    }
    const priceRaw = body.upscalePrice;
    const price = Number(priceRaw);
    if (priceRaw === '' || priceRaw == null || Number.isNaN(price) || price < 0) {
      throw new ApiError(400, 'Upscale Price must be a valid non-negative number');
    }
    upscalePrice = price;
  }

  const upscaleNotes = String(body.upscaleNotes || '').trim() || null;

  if (!lead.handover) {
    lead.handover = {};
  }

  // Agent-closed with no closer: claim ownership when handing to CST
  if (!lead.closerId && req.user.role === 'closer') {
    lead.closerId = req.user._id;
  }

  lead.handover.documentSigned = documentSigned;
  if (documentSigned && req.file) {
    lead.handover.signedDocument = {
      originalName: req.file.originalname,
      storedFilename: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      relativePath: path
        .join('uploads', 'cst-handover', String(lead._id), req.file.filename)
        .replace(/\\/g, '/'),
    };
  } else {
    lead.handover.signedDocument = undefined;
  }

  lead.handover.upscale = upscaleEnabled
    ? {
        enabled: true,
        itemName: upscaleItemName,
        price: upscalePrice,
      }
    : {
        enabled: false,
        itemName: null,
        price: null,
      };
  lead.handover.upscaleNotes = upscaleNotes;

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

/**
 * Agent forced handoff — move lead to pre-assigned closer immediately.
 */
export const handLeadToCloser = asyncHandler(async (req, res) => {
  const lead = await Lead.findOne({
    _id: req.params.id,
    agentId: req.user._id,
    stage: 'active',
    status: 'with_agent',
  });

  if (!lead) {
    throw new ApiError(
      404,
      'Lead not found, already with closer, or no longer active.'
    );
  }

  if (!lead.closerId) {
    throw new ApiError(
      400,
      'Assign a closer on this lead before handing it over.'
    );
  }

  const now = new Date();
  lead.status = 'with_closer';
  lead.escalatedAt = now;
  lead.handedOverAt = now;
  lead.escalationType = 'forced';
  lead.escalatedReason = 'Forced Moved';
  if (!lead.followUp) lead.followUp = {};
  if (!lead.followUp.alerts) {
    lead.followUp.alerts = { fiveMinFired: false, exactTimeFired: false };
  }
  lead.followUp.alerts.fiveMinFired = true;
  lead.followUp.alerts.exactTimeFired = true;
  await lead.save();

  await resolveCallbacksForLead(lead._id, 'transferred');
  await lead.populate([
    { path: 'agentId', select: 'fullName username role' },
    { path: 'closerId', select: 'fullName username role' },
  ]);

  res
    .status(200)
    .json(new ApiResponse(200, { lead }, 'Lead handed to assigned closer'));
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
    .populate({
      path: 'handover.assignedTechId',
      select: 'fullName username role',
    });

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (!canAccessLead(lead, req.user)) {
    throw new ApiError(
      403,
      'You can only view leads you own or are assigned to'
    );
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
    // Own active/closed/disqualified OR unassigned agent-closed awaiting CST
    lead = await Lead.findOne({
      _id: req.params.id,
      $or: [
        { closerId: userId },
        {
          stage: 'closed_sale',
          $and: [
            {
              $or: [
                { closerId: null },
                { closerId: { $exists: false } },
              ],
            },
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
      if (field === 'salesAmount') {
        if (req.user.role === 'sales_agent') {
          lead[field] = parseRequiredSalesAmount(req.body[field]);
        } else if (req.body[field] === '' || req.body[field] === null) {
          lead[field] = null;
        } else {
          const n = Number(req.body[field]);
          if (Number.isNaN(n) || n < 0) {
            throw new ApiError(400, 'salesAmount must be a non-negative number');
          }
          lead[field] = n;
        }
      } else {
        lead[field] =
          req.body[field] === '' || req.body[field] === null
            ? null
            : req.body[field];
      }
    }
  }

  // Agents must always leave a sales amount on save (even if omitted from PATCH)
  if (
    req.user.role === 'sales_agent' &&
    (lead.salesAmount === null || lead.salesAmount === undefined)
  ) {
    throw new ApiError(400, 'Sales amount is required');
  }

  // Agents may reassign closer while the lead is still on their desk
  if (
    req.body.closerId !== undefined &&
    req.user.role === 'sales_agent' &&
    lead.status === 'with_agent' &&
    lead.stage === 'active'
  ) {
    const closer = await resolveApprovedCloser(req.body.closerId);
    lead.closerId = closer._id;
  } else if (
    req.user.role === 'sales_agent' &&
    lead.status === 'with_agent' &&
    lead.stage === 'active' &&
    !lead.closerId
  ) {
    throw new ApiError(400, 'Assign Closer is required');
  }

  let clearedFollowUp = false;

  if (req.body.followUp !== undefined) {
    const nextFollowUp = req.body.followUp;

    if (nextFollowUp === null) {
      clearedFollowUp = true;
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
        acknowledged:
          nextAt !== null && nextAt !== prevAt
            ? false
            : nextFollowUp.acknowledged === true
              ? true
              : lead.followUp?.acknowledged || false,
        alerts: {
          fiveMinFired: lead.followUp?.alerts?.fiveMinFired || false,
          exactTimeFired: lead.followUp?.alerts?.exactTimeFired || false,
        },
      };

      // Reschedule clears prior alert firings so reminders can fire for the new time
      if (nextAt !== null && nextAt !== prevAt) {
        lead.followUp.alerts.fiveMinFired = false;
        lead.followUp.alerts.exactTimeFired = false;
        lead.followUp.acknowledged = false;
      }
    }
  }

  // Agent edits must NOT reset the 24h clock — clock is immutable createdAt

  // Closers may correct payment on closed sales still awaiting CST handoff
  if (
    req.body.payment !== undefined &&
    req.user.role === 'closer' &&
    lead.stage === 'closed_sale'
  ) {
    const cst = lead.handover?.cstStatus;
    if (cst && cst !== 'awaiting_handover') {
      throw new ApiError(
        400,
        'Payment can only be edited before handing over to CST'
      );
    }
    const payment = req.body.payment;
    if (!payment?.method) {
      throw new ApiError(400, 'payment.method is required');
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
      paymentDoc.linkUrl = null;
    } else if (payment.method === 'via_card') {
      if (!payment.cardLast4 || !payment.cardReferenceToken || !payment.cardBrand) {
        throw new ApiError(
          400,
          'cardLast4, cardBrand, and cardReferenceToken are required for Card'
        );
      }
      paymentDoc.cardLast4 = payment.cardLast4;
      paymentDoc.cardBrand = payment.cardBrand;
      paymentDoc.cardReferenceToken = payment.cardReferenceToken;
    } else if (payment.method === 'other') {
      const details = String(payment.otherDetails || '').trim();
      if (!details) {
        throw new ApiError(400, 'otherDetails is required for Others');
      }
      paymentDoc.otherDetails = details;
    } else {
      throw new ApiError(400, 'Invalid payment.method');
    }
    lead.payment = paymentDoc;
  }

  // Claim unassigned agent-closed sales when a closer edits them
  if (
    req.user.role === 'closer' &&
    lead.stage === 'closed_sale' &&
    !lead.closerId
  ) {
    lead.closerId = userId;
  }

  await lead.save();

  if (clearedFollowUp) {
    await Lead.updateOne({ _id: lead._id }, { $unset: { followUp: 1 } });
    lead.followUp = undefined;
    await resolveCallbacksForLead(lead._id, 'cancelled');
  }

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
    await Lead.updateOne({ _id: lead._id }, { $unset: { followUp: 1 } });
    lead.followUp = undefined;
    await resolveCallbacksForLead(lead._id, 'cancelled');
    return res
      .status(200)
      .json(new ApiResponse(200, { lead }, 'Follow-up cleared'));
  }

  // Acknowledge only (View / Close on ringing alert) — no reschedule
  if (payload.acknowledged === true && payload.callbackAt === undefined) {
    if (!lead.followUp?.callbackAt) {
      throw new ApiError(400, 'No follow-up to acknowledge');
    }
    lead.followUp.acknowledged = true;
    if (!lead.followUp.alerts) {
      lead.followUp.alerts = {};
    }
    lead.followUp.alerts.fiveMinFired = true;
    lead.followUp.alerts.exactTimeFired = true;
    await lead.save();
    return res
      .status(200)
      .json(new ApiResponse(200, { lead }, 'Follow-up acknowledged'));
  }

  const { callbackAt, notes, acknowledged } = payload;

  if (!callbackAt) {
    throw new ApiError(400, 'callbackAt is required to set a follow-up');
  }

  const prevAt = lead.followUp?.callbackAt
    ? new Date(lead.followUp.callbackAt).getTime()
    : null;
  const nextAt = new Date(callbackAt).getTime();
  const timeChanged = nextAt !== prevAt;

  lead.followUp = {
    callbackAt: new Date(callbackAt),
    notes:
      notes !== undefined
        ? notes || null
        : lead.followUp?.notes || null,
    acknowledged: timeChanged
      ? false
      : acknowledged === true
        ? true
        : lead.followUp?.acknowledged || false,
    alerts: {
      fiveMinFired:
        timeChanged
          ? false
          : lead.followUp?.alerts?.fiveMinFired || false,
      exactTimeFired:
        timeChanged
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
  const { payment, closerId: bodyCloserId } = req.body;

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
    // Selection alone records the method — no URL / reference required
    paymentDoc.linkUrl = null;
  } else if (payment.method === 'via_card') {
    paymentDoc.cardLast4 = payment.cardLast4;
    paymentDoc.cardBrand = payment.cardBrand || null;
    paymentDoc.cardReferenceToken = payment.cardReferenceToken;
  } else if (payment.method === 'other') {
    paymentDoc.otherDetails = String(payment.otherDetails || '').trim() || null;
  }

  const userId = req.user._id;
  const isAgent = req.user.role === 'sales_agent';
  const isCloser = req.user.role === 'closer';

  // Resolve assigned closer for handover
  let assignedCloserId = bodyCloserId || null;
  if (isAgent) {
    // Fall back to pre-assigned closer on the lead when body omits it
    if (!assignedCloserId) {
      // lead not loaded yet — validated after fetch below
    } else {
      const closer = await resolveApprovedCloser(assignedCloserId);
      assignedCloserId = closer._id;
    }
  } else if (isCloser) {
    // Closer closing their own desk lead — stay assigned to them
    assignedCloserId = assignedCloserId || userId;
  }

  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: 'active',
    $or: [{ agentId: userId }, { closerId: userId }],
  });

  if (!lead) {
    throw new ApiError(
      409,
      'This lead is no longer active — it may have just been closed or disqualified.'
    );
  }

  if (isAgent) {
    if (!assignedCloserId) {
      assignedCloserId = lead.closerId || null;
    }
    if (!assignedCloserId) {
      throw new ApiError(400, 'closerId is required to close a sale');
    }
    const closer = await resolveApprovedCloser(assignedCloserId);
    assignedCloserId = closer._id;
  }

  // Sales amount is required when closing
  if (req.body.salesAmount === undefined || req.body.salesAmount === '' || req.body.salesAmount === null) {
    throw new ApiError(400, 'Sales Amount is required');
  }
  {
    const n = Number(req.body.salesAmount);
    if (Number.isNaN(n) || n < 0) {
      throw new ApiError(400, 'salesAmount must be a non-negative number');
    }
  }

  // Optional last-pass intake corrections before lock
  for (const field of UPDATABLE_FIELDS) {
    if (req.body[field] !== undefined) {
      if (field === 'salesAmount') {
        if (req.body[field] === '' || req.body[field] === null) {
          lead[field] = null;
        } else {
          const n = Number(req.body[field]);
          if (Number.isNaN(n) || n < 0) {
            throw new ApiError(400, 'salesAmount must be a non-negative number');
          }
          lead[field] = n;
        }
      } else {
        lead[field] =
          req.body[field] === '' || req.body[field] === null
            ? null
            : req.body[field];
      }
    }
  }

  lead.stage = 'closed_sale';
  lead.closedAt = new Date();
  lead.closedBy = userId;
  lead.payment = paymentDoc;
  if (assignedCloserId) {
    lead.closerId = assignedCloserId;
  }
  if (!lead.handover) {
    lead.handover = {};
  }
  lead.handover.cstStatus = 'awaiting_handover';

  // Silence follow-up chimes on the lead itself
  if (lead.followUp) {
    lead.followUp.alerts = {
      fiveMinFired: true,
      exactTimeFired: true,
    };
  }

  await lead.save();

  // Mark linked agent callbacks completed so they leave My Callbacks / stop ringing
  await resolveCallbacksForLead(lead._id, 'completed');

  await lead.populate([
    { path: 'agentId', select: 'fullName username role' },
    { path: 'closerId', select: 'fullName username role' },
    { path: 'closedBy', select: 'fullName username role' },
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      { closedCount: 1, lead },
      'Lead closed'
    )
  );
});
