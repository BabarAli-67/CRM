import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import path from 'path';
import Lead from '../models/lead.model.js';
import User from '../models/user.model.js';
import Callback from '../models/callback.model.js';
import {
  resolveCallbacksForLead,
  transferPendingCallbacksToCloser,
} from '../utils/callbackResolve.util.js';
import { escalateStaleAgentLeads, AGENT_HOLD_MS } from '../utils/leadEscalation.util.js';
import {
  parseLeadPaymentFields,
  parseNonNegativeAmount,
  computePaymentPending,
} from '../utils/leadPayment.util.js';
import {
  appendSavedCard,
  buildSavedCardEntry,
  syncLegacyCardsIntoVault,
} from '../utils/savedCard.util.js';
import { buildAlertFlagsForSchedule } from '../utils/alertTiming.util.js';
import { resolvePktMonthRange } from '../utils/shiftTime.util.js';
import { applyContractFieldsToLead } from '../utils/contract.util.js';
import {
  filterCommentsForViewerRole,
  isExpiredClient,
  isSeoWaitingForDeveloper,
  resolveTechWorkspaceJd,
  toTechSafeClient,
} from '../utils/techTeam.util.js';
import { randomUUID } from 'crypto';

/** Parse ?month=YYYY-MM for closed-sales scoping. Defaults to current PKT month. */
const closedSalesMonthRange = (monthQuery) => {
  try {
    return resolvePktMonthRange(monthQuery);
  } catch {
    throw new ApiError(400, 'month must be YYYY-MM');
  }
};

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

  // Tech specialists: only leads where their id is in assignedTechIds (or legacy assignedTechId)
  const assignedTechIds = Array.isArray(lead.handover?.assignedTechIds)
    ? lead.handover.assignedTechIds.map((id) => refId(id)).filter(Boolean)
    : [];
  const legacyTech = refId(lead.handover?.assignedTechId);
  if (legacyTech && !assignedTechIds.includes(legacyTech)) {
    assignedTechIds.push(legacyTech);
  }
  const isAssignedTech =
    user.role === 'tech_team' && assignedTechIds.includes(userId);

  // Tech Head may view onboarded + assigned fulfillment leads (no financial projection here)
  const techHeadStatuses = new Set([
    'onboarded',
    'assigned',
    'in_progress',
    'ongoing_seo',
    'completed',
  ]);
  const isTechHeadVisible =
    user.role === 'tech_head' &&
    lead.stage === 'closed_sale' &&
    techHeadStatuses.has(lead.handover?.cstStatus);

  return (
    isOwningAgent ||
    isCloserOnRecord ||
    isCloserClosedSaleVisible ||
    isAssignedTech ||
    isTechHeadVisible
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
  'personalPhone',
  'businessPhone',
  'businessEmail',
  'personalEmail',
  'yelpLink',
  'websiteLink',
  'gmbLink',
  'socialLinks',
  'serviceAreas',
  'servicesOffered',
  'paymentOffered',
  'paymentReceived',
  'notes',
  'niche',
  'locationAddress',
  'leadSource',
];

const PAYMENT_SKIP_FIELDS = new Set(['paymentOffered', 'paymentReceived']);
const CONTRACT_SKIP_FIELDS = new Set([
  'contractEnabled',
  'contractMonths',
  'contractAmount',
  'servicesOffered',
]);

const applyContractOrThrow = (lead, body) => {
  try {
    applyContractFieldsToLead(lead, body);
  } catch (err) {
    throw new ApiError(400, err?.message || 'Invalid contract fields');
  }
};

const trimOrNull = (value) => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s || null;
};

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

const applyPaymentFieldsToLead = (lead, body, { requireOffered = false } = {}) => {
  const hasOffered = body.paymentOffered !== undefined;
  const hasReceived = body.paymentReceived !== undefined;
  if (!hasOffered && !hasReceived) {
    if (requireOffered) {
      throw new ApiError(400, 'Payment Offered is required');
    }
    return;
  }

  const offered = hasOffered
    ? parseNonNegativeAmount(body.paymentOffered, 'Payment Offered')
    : Math.max(0, Number(lead.paymentOffered) || 0);
  const received = hasReceived
    ? body.paymentReceived === '' || body.paymentReceived === null
      ? 0
      : parseNonNegativeAmount(body.paymentReceived, 'Payment Received')
    : Math.max(0, Number(lead.paymentReceived) || 0);

  lead.paymentOffered = offered;
  lead.paymentReceived = received;
  lead.paymentPending = computePaymentPending(offered, received);
};

export const createLead = asyncHandler(async (req, res) => {
  const { businessName, closerId } = req.body;

  if (!businessName || !String(businessName).trim()) {
    throw new ApiError(400, 'Business Name is required');
  }

  const websiteLink = trimOrNull(req.body.websiteLink);
  if (!websiteLink) {
    throw new ApiError(400, 'Website Link is required');
  }

  const servicesOffered = trimOrNull(req.body.servicesOffered);
  if (!servicesOffered) {
    throw new ApiError(400, 'Services Offered is required');
  }

  const closer = await resolveApprovedCloser(closerId);
  const payment = parseLeadPaymentFields(req.body, { requireOffered: true });

  const personalPhone = trimOrNull(req.body.personalPhone);
  const businessPhone = trimOrNull(req.body.businessPhone);

  const contractDraft = {
    servicesOffered,
    paymentOffered: payment.paymentOffered,
    paymentReceived: payment.paymentReceived,
    paymentPending: payment.paymentPending,
    contractEnabled: false,
    contractMonths: null,
    contractAmount: null,
  };
  applyContractOrThrow(contractDraft, {
    ...req.body,
    servicesOffered,
  });

  const payload = {
    businessName: String(businessName).trim(),
    personalPhone,
    businessPhone,
    websiteLink,
    servicesOffered: contractDraft.servicesOffered,
    agentId: req.user._id,
    closerId: closer._id,
    paymentOffered: contractDraft.paymentOffered,
    paymentReceived: contractDraft.paymentReceived,
    paymentPending: contractDraft.paymentPending,
    contractEnabled: Boolean(contractDraft.contractEnabled),
    contractMonths: contractDraft.contractMonths ?? null,
    contractAmount:
      contractDraft.contractAmount != null
        ? contractDraft.contractAmount
        : null,
    status: 'with_agent',
    stage: 'active',
  };

  if (req.body.notes !== undefined) {
    payload.notes = trimOrNull(req.body.notes);
  }

  // Allow optional intake fields if posted (edit paths / promote / full form)
  for (const field of UPDATABLE_FIELDS) {
    if (
      field === 'businessName' ||
      field === 'personalPhone' ||
      field === 'businessPhone' ||
      field === 'websiteLink' ||
      field === 'servicesOffered' ||
      field === 'notes' ||
      PAYMENT_SKIP_FIELDS.has(field)
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

  // Promote-from-callback: link + mark the source callback promoted after review
  const sourceCallbackId = req.body.sourceCallbackId;
  if (sourceCallbackId) {
    payload.sourceCallbackId = sourceCallbackId;
  }

  const lead = await Lead.create(payload);

  if (sourceCallbackId) {
    const callback = await Callback.findOne({
      _id: sourceCallbackId,
      agentId: req.user._id,
    });
    if (callback && callback.status !== 'promoted') {
      callback.status = 'promoted';
      callback.promotedLeadId = lead._id;
      if (!callback.alerts) {
        callback.alerts = { fiveMinFired: false, exactTimeFired: false };
      }
      callback.alerts.fiveMinFired = true;
      callback.alerts.exactTimeFired = true;
      await callback.save();
    }
  }

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

/** Closed sales awaiting CST handoff for this closer (+ unassigned agent-closed).
 * Scoped to ?month=YYYY-MM (PKT); defaults to the current Asia/Karachi month.
 * Historical deals stay in MongoDB — only the active desk view is month-scoped.
 */
export const getCloserClosedSales = asyncHandler(async (req, res) => {
  const closerId = req.user._id;
  const range = closedSalesMonthRange(req.query.month);
  const leads = await Lead.find({
    stage: 'closed_sale',
    closedAt: { $gte: range.start, $lt: range.end },
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

  res.status(200).json(
    new ApiResponse(
      200,
      { leads, month: range.month, timezone: 'Asia/Karachi' },
      'Closer closed sales retrieved'
    )
  );
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
 * Restore a disqualified lead back to the Closer's active Leads desk.
 * Clears DQ reason and sets stage/status so it appears in assigned-to-me.
 */
export const restoreDisqualifiedLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    throw new ApiError(404, 'Lead not found');
  }

  if (lead.stage !== 'disqualified') {
    throw new ApiError(400, 'Only disqualified leads can be moved back to Leads');
  }

  const isSuperAdmin = req.user.role === 'super_admin';
  const isCloserOwner =
    req.user.role === 'closer' &&
    lead.closerId &&
    String(lead.closerId) === String(req.user._id);

  if (!isSuperAdmin && !isCloserOwner) {
    throw new ApiError(403, 'You can only restore your own disqualified leads');
  }

  // Ensure the closer desk list (`with_closer` / `in_progress`) will include it
  if (req.user.role === 'closer' && !lead.closerId) {
    lead.closerId = req.user._id;
  }

  lead.stage = 'active';
  lead.status = 'with_closer';
  lead.disqualifiedReason = null;

  await lead.save();
  await lead.populate([
    { path: 'agentId', select: 'fullName username role' },
    { path: 'closerId', select: 'fullName username role' },
  ]);

  res
    .status(200)
    .json(
      new ApiResponse(200, { lead }, 'Lead restored to active Leads successfully')
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

  // Closers cannot permanently delete — Super Admin only
  if (req.user.role !== 'super_admin') {
    throw new ApiError(
      403,
      'Only Super Admin can permanently delete disqualified leads'
    );
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

/** Sales agent — closed sales for ?month=YYYY-MM (PKT); defaults to current month.
 * Does not delete history — only scopes the active dashboard/list view.
 */
export const getMyClosedSales = asyncHandler(async (req, res) => {
  const range = closedSalesMonthRange(req.query.month);
  const leads = await Lead.find({
    agentId: req.user._id,
    stage: 'closed_sale',
    closedAt: { $gte: range.start, $lt: range.end },
  })
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .sort({ closedAt: -1 });

  res.status(200).json(
    new ApiResponse(
      200,
      { leads, month: range.month, timezone: 'Asia/Karachi' },
      'My closed sales retrieved'
    )
  );
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
    current === 'onboarded' ||
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

  const upscaleEnabled = parseBool(body.upscale ?? body.upsell);
  if (upscaleEnabled === null) {
    throw new ApiError(400, 'Upsell selection (Yes/No) is required');
  }

  if (documentSigned && !req.file) {
    throw new ApiError(
      400,
      'Upload Signed Document is required when Document Sign is Yes'
    );
  }

  let upscaleItemName = null;
  let upsellOffered = null;
  let upsellReceived = null;
  let upsellPending = null;
  let upsellPaymentMethod = null;
  let selectedCardId = null;
  let paymentReference = null;

  if (upscaleEnabled) {
    upscaleItemName = String(
      body.upscaleItemName || body.upsellServiceName || ''
    ).trim();
    if (!upscaleItemName) {
      throw new ApiError(400, 'Service Name is required when Upsell is Yes');
    }

    // Optional multi-month contract on upsell — extends retention deferral only
    // (does not rewrite base servicesOffered / paymentOffered)
    const upsellContractOn =
      body.contractEnabled === true ||
      body.contractEnabled === 'true' ||
      body.contractEnabled === '1' ||
      body.contractEnabled === 'yes';
    if (upsellContractOn) {
      const months = Number(body.contractMonths);
      if (!Number.isFinite(months) || months < 1) {
        throw new ApiError(
          400,
          'Contract Timeframe (months) is required when Upsell Contract is Yes'
        );
      }
      const existingMonths = lead.contractEnabled
        ? Number(lead.contractMonths) || 0
        : 0;
      if (months > existingMonths) {
        lead.contractEnabled = true;
        lead.contractMonths = Math.min(120, Math.floor(months));
      }
    }

    // Prefer Offered / Received split; fall back to legacy single price
    const offeredRaw =
      body.upsellOffered ?? body.upscaleOffered ?? body.upscalePrice ?? body.upsellPrice;
    const receivedRaw =
      body.upsellReceived ?? body.upscaleReceived ?? '0';

    const offered = Number(offeredRaw);
    if (
      offeredRaw === '' ||
      offeredRaw == null ||
      Number.isNaN(offered) ||
      offered < 0
    ) {
      throw new ApiError(
        400,
        'Price Offered must be a valid non-negative number'
      );
    }

    const received = Number(receivedRaw === '' || receivedRaw == null ? 0 : receivedRaw);
    if (Number.isNaN(received) || received < 0) {
      throw new ApiError(
        400,
        'Price Received must be a valid non-negative number'
      );
    }
    if (received > offered) {
      throw new ApiError(
        400,
        'Price Received cannot exceed Price Offered'
      );
    }

    upsellOffered = offered;
    upsellReceived = received;
    // Server-authoritative pending (client also sends for clarity)
    const pendingRaw = body.upsellPending ?? body.upscalePending;
    const pendingFromClient =
      pendingRaw === '' || pendingRaw == null ? null : Number(pendingRaw);
    upsellPending = Math.max(0, offered - received);
    if (
      pendingFromClient != null &&
      !Number.isNaN(pendingFromClient) &&
      Math.abs(pendingFromClient - upsellPending) > 0.009
    ) {
      // Prefer server calc; ignore minor client drift
      upsellPending = Math.max(0, offered - received);
    }

    upsellPaymentMethod = String(body.upsellPaymentMethod || '').trim();
    const allowedPay = new Set(['old_card', 'new_card', 'other']);
    if (!allowedPay.has(upsellPaymentMethod)) {
      throw new ApiError(
        400,
        'Upsell Payment Method must be Old Card, New Card, Link, or Others'
      );
    }

    if (upsellPaymentMethod === 'old_card') {
      selectedCardId = String(body.selectedCardId || '').trim();
      const cards = Array.isArray(lead.savedCards) ? lead.savedCards : [];
      const found = cards.find((c) => String(c.cardId) === selectedCardId);
      if (!found) {
        throw new ApiError(
          400,
          'Select a previously saved card for Old Card payment'
        );
      }
    } else if (upsellPaymentMethod === 'new_card') {
      const last4 = String(body.newCardLast4 || '').replace(/\D/g, '').slice(-4);
      const brand = String(body.newCardBrand || '').trim() || 'other';
      const token = String(body.newCardReferenceToken || '').trim();
      const expiry = String(body.newCardExpiry || '').trim();
      const nameOnCard = String(body.newCardHolderName || '').trim();
      const billingZip = String(body.newCardBillingZip || '').trim();
      if (last4.length !== 4 || !token) {
        throw new ApiError(400, 'New Card details are incomplete');
      }
      if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        throw new ApiError(400, 'New Card expiry must be MM/YY');
      }
      if (!nameOnCard) {
        throw new ApiError(400, 'Name on Card is required for New Card');
      }
      if (!billingZip) {
        throw new ApiError(400, 'Billing Zip Code is required for New Card');
      }
      const entry = buildSavedCardEntry({
        cardLast4: last4,
        cardBrand: brand,
        cardReferenceToken: token,
        expiry,
        nameOnCard,
        billingZipCode: billingZip,
        source: 'move_to_cst',
        cvcCollected: true,
      });
      appendSavedCard(lead, entry);
      selectedCardId = entry.cardId;
    } else {
      paymentReference = String(
        body.upsellPaymentReference || body.paymentReference || ''
      ).trim();
      if (!paymentReference) {
        throw new ApiError(
          400,
          'Payment reference / details are required for Link or Others'
        );
      }
    }
  }

  const upscaleNotes = String(body.upscaleNotes || body.upsellNotes || '').trim() || null;
  const handoverNotes =
    String(body.handoverNotes || '').trim() || null;
  if (Object.prototype.hasOwnProperty.call(body, 'socialLinks')) {
    const social = String(body.socialLinks || '').trim();
    lead.socialLinks = social || null;
  }

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
        price: upsellOffered,
        offered: upsellOffered,
        received: upsellReceived,
        pending: upsellPending,
        paymentMethod: upsellPaymentMethod,
        selectedCardId,
        paymentReference,
      }
    : {
        enabled: false,
        itemName: null,
        price: null,
        offered: null,
        received: null,
        pending: null,
        paymentMethod: undefined,
        selectedCardId: null,
        paymentReference: null,
      };
  lead.handover.upscaleNotes = upscaleNotes;
  lead.handover.handoverNotes = handoverNotes;

  // Seed CST upsell ledger so Base / Collected / Pending roll up seamlessly
  if (upscaleEnabled) {
    const payOptionMap = {
      old_card: 'old_card',
      new_card: 'new_card',
      other: 'others',
    };
    const ledgerRow = {
      entryId: randomUUID(),
      title: upscaleItemName,
      service: null,
      serviceOther: null,
      totalAmount: upsellOffered,
      paidAmount: upsellReceived,
      paymentOption: payOptionMap[upsellPaymentMethod] || null,
      selectedCardId,
      paymentReference,
      notes: upscaleNotes,
    };
    const existingLedger = Array.isArray(lead.handover.upsellLedger)
      ? lead.handover.upsellLedger
      : [];
    lead.handover.upsellLedger = [...existingLedger, ledgerRow];

    const baseOffered = Math.max(
      0,
      Number(lead.paymentOffered ?? lead.salesAmount) || 0
    );
    const baseReceived = Math.max(0, Number(lead.paymentReceived) || 0);
    let upsellTotal = 0;
    let upsellPaid = 0;
    for (const row of lead.handover.upsellLedger) {
      upsellTotal += Math.max(0, Number(row?.totalAmount) || 0);
      upsellPaid += Math.max(0, Number(row?.paidAmount) || 0);
    }
    lead.handover.totalCollectedAmount = baseReceived + upsellPaid;
    lead.handover.totalContractValue = baseOffered + upsellTotal;
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

  // Keep Follow-up (PKT) on closer Leads; re-arm alerts for upcoming times
  if (lead.followUp?.callbackAt) {
    lead.followUp.acknowledged = false;
    lead.followUp.alerts = buildAlertFlagsForSchedule(lead.followUp.callbackAt);
  }

  await lead.save();

  await transferPendingCallbacksToCloser(lead._id, lead.closerId);
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
  // Full lead document — no field projection. Preserves Agent intake, Closer
  // payment/handover (document sign, upscale), and CST metadata for Client Detail.
  const lead = await Lead.findById(req.params.id)
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .populate({
      path: 'handover.assignedTechId',
      select: 'fullName username role jd assignedMentorId',
      populate: { path: 'assignedMentorId', select: 'jd fullName' },
    })
    .populate({
      path: 'handover.assignedTechIds',
      select: 'fullName username role jd assignedMentorId',
      populate: { path: 'assignedMentorId', select: 'jd fullName' },
    })
    .populate({
      path: 'handover.comments.createdBy',
      select: 'fullName username role',
    })
    .populate({
      path: 'sourceCallbackId',
      select: 'businessName personalPhone businessPhone callbackAt notes status',
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

  // Expired clients are hidden from Tech Head / Tech Team (SA + CST keep access)
  if (
    (req.user.role === 'tech_team' || req.user.role === 'tech_head') &&
    isExpiredClient(lead)
  ) {
    throw new ApiError(404, 'Client not found');
  }

  // Merge legacy base-deal card into savedCards vault (append-only, never overwrite)
  if (syncLegacyCardsIntoVault(lead)) {
    await lead.save();
  }

  const leadObj =
    typeof lead.toObject === 'function' ? lead.toObject() : lead;
  if (
    req.user.role === 'cst_manager' ||
    req.user.role === 'tech_team' ||
    req.user.role === 'tech_head' ||
    req.user.role === 'super_admin'
  ) {
    const viewerRole =
      req.user.role === 'super_admin' ? 'tech_head' : req.user.role;
    const rawComments = Array.isArray(leadObj?.handover?.comments)
      ? leadObj.handover.comments
      : [];
    const comments = filterCommentsForViewerRole(rawComments, viewerRole);
    if (leadObj.handover) {
      leadObj.handover.comments = comments;
    }
    const reads = Array.isArray(leadObj?.handover?.commentReads)
      ? leadObj.handover.commentReads
      : [];
    const uid = String(req.user._id);
    const entry = reads.find((r) => String(r.userId) === uid);
    const lastReadMs = entry?.lastReadAt
      ? new Date(entry.lastReadAt).getTime()
      : 0;
    const watermark = Number.isNaN(lastReadMs) ? 0 : lastReadMs;
    leadObj.unreadCommentCount = comments.filter((c) => {
      const by = c?.createdBy;
      const authorId =
        by && typeof by === 'object' && by._id != null
          ? String(by._id)
          : by != null
            ? String(by)
            : null;
      if (authorId === uid) return false;
      const at = new Date(c.createdAt || 0).getTime();
      return !Number.isNaN(at) && at > watermark;
    }).length;
  }

  // Tech department: strip all pricing / payment / balance fields
  let payloadLead = leadObj;
  if (req.user.role === 'tech_team' || req.user.role === 'tech_head') {
    const safe = toTechSafeClient(leadObj);
    // Specialists only see task notes assigned to them; never internActivity.
    // Notes are shown inside Comments (not My Projects cards).
    if (req.user.role === 'tech_team') {
      const notes = Array.isArray(leadObj?.handover?.techTaskNotes)
        ? leadObj.handover.techTaskNotes
        : [];
      safe.handover.techTaskNotes = notes.filter(
        (n) => String(n.assignedToUserId) === String(req.user._id)
      );
      let actor = req.user;
      if (req.user.jd === 'Intern' && req.user.assignedMentorId) {
        actor = await User.findById(req.user._id)
          .populate('assignedMentorId', 'jd fullName')
          .select('fullName username role jd assignedMentorId');
      }
      const waiting =
        resolveTechWorkspaceJd(actor) === 'SEO Expert' &&
        isSeoWaitingForDeveloper(leadObj);
      safe.waitingForDeveloper = waiting;
      safe.seoActionsLocked = waiting;
    }
    payloadLead = {
      ...safe,
      unreadCommentCount: leadObj.unreadCommentCount,
    };
  }

  res
    .status(200)
    .json(new ApiResponse(200, { lead: payloadLead }, 'Lead retrieved'));
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
    if (req.body[field] === undefined) continue;
    if (PAYMENT_SKIP_FIELDS.has(field)) continue;
    if (CONTRACT_SKIP_FIELDS.has(field)) continue;
    lead[field] =
      req.body[field] === '' || req.body[field] === null
        ? null
        : req.body[field];
  }

  applyPaymentFieldsToLead(lead, req.body, { requireOffered: false });
  if (
    req.body.contractEnabled !== undefined ||
    req.body.contractMonths !== undefined ||
    req.body.contractAmount !== undefined ||
    req.body.servicesOffered !== undefined
  ) {
    if (
      req.body.servicesOffered !== undefined &&
      req.body.contractEnabled === undefined &&
      !lead.contractEnabled
    ) {
      lead.servicesOffered =
        req.body.servicesOffered === '' || req.body.servicesOffered === null
          ? null
          : req.body.servicesOffered;
    } else {
      applyContractOrThrow(lead, req.body);
    }
  }

  // Agents must always leave payment offered on save
  if (
    req.user.role === 'sales_agent' &&
    (lead.paymentOffered === null || lead.paymentOffered === undefined)
  ) {
    throw new ApiError(400, 'Payment Offered is required');
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

      // Reschedule: arm exact-time; skip 5-min warning if <5 minutes remain
      if (nextAt !== null && nextAt !== prevAt) {
        lead.followUp.alerts = buildAlertFlagsForSchedule(
          lead.followUp.callbackAt
        );
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
      cardHolderName: null,
      billingZip: null,
      otherDetails: null,
    };
    if (payment.method === 'via_card') {
      if (!payment.cardLast4 || !payment.cardReferenceToken || !payment.cardBrand) {
        throw new ApiError(
          400,
          'cardLast4, cardBrand, and cardReferenceToken are required for Card'
        );
      }
      paymentDoc.cardLast4 = payment.cardLast4;
      paymentDoc.cardBrand = payment.cardBrand;
      paymentDoc.cardReferenceToken = payment.cardReferenceToken;
      paymentDoc.cardHolderName =
        String(payment.cardHolderName || '').trim() || null;
      paymentDoc.billingZip = String(payment.billingZip || '').trim() || null;
    } else if (payment.method === 'other') {
      const details = String(payment.otherDetails || '').trim();
      if (!details) {
        throw new ApiError(400, 'otherDetails is required for Others');
      }
      paymentDoc.otherDetails = details;
    } else {
      throw new ApiError(
        400,
        "Invalid payment.method — use 'via_card' or 'other'"
      );
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
    alerts: timeChanged
      ? buildAlertFlagsForSchedule(callbackAt)
      : {
          fiveMinFired: lead.followUp?.alerts?.fiveMinFired || false,
          exactTimeFired: lead.followUp?.alerts?.exactTimeFired || false,
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
    cardHolderName: null,
    billingZip: null,
    cardExpiry: null,
    otherDetails: null,
  };

  if (payment.method === 'via_card') {
    paymentDoc.cardLast4 = payment.cardLast4;
    paymentDoc.cardBrand = payment.cardBrand || null;
    paymentDoc.cardReferenceToken = payment.cardReferenceToken;
    paymentDoc.cardHolderName =
      String(payment.cardHolderName || '').trim() || null;
    paymentDoc.billingZip = String(payment.billingZip || '').trim() || null;
    paymentDoc.cardExpiry = String(payment.cardExpiry || '').trim() || null;
  } else if (payment.method === 'other') {
    paymentDoc.otherDetails = String(payment.otherDetails || '').trim() || null;
  } else {
    throw new ApiError(
      400,
      "Invalid payment.method — use 'via_card' or 'other'"
    );
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

  // Active desk leads OR recovering a disqualified lead into Closed Sales
  const lead = await Lead.findOne({
    _id: req.params.id,
    stage: { $in: ['active', 'disqualified'] },
    $or: [{ agentId: userId }, { closerId: userId }],
  });

  if (!lead) {
    throw new ApiError(
      409,
      'This lead is no longer available to close — it may already be a closed sale.'
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

  // Payment Offered is required when closing
  applyPaymentFieldsToLead(lead, req.body, { requireOffered: true });

  // Optional last-pass intake corrections before lock
  for (const field of UPDATABLE_FIELDS) {
    if (req.body[field] === undefined) continue;
    if (PAYMENT_SKIP_FIELDS.has(field)) continue;
    if (CONTRACT_SKIP_FIELDS.has(field)) continue;
    lead[field] =
      req.body[field] === '' || req.body[field] === null
        ? null
        : req.body[field];
  }

  if (
    req.body.contractEnabled !== undefined ||
    req.body.contractMonths !== undefined ||
    req.body.contractAmount !== undefined ||
    req.body.servicesOffered !== undefined
  ) {
    applyContractOrThrow(lead, {
      ...req.body,
      servicesOffered:
        req.body.servicesOffered !== undefined
          ? req.body.servicesOffered
          : lead.servicesOffered,
    });
  }

  lead.stage = 'closed_sale';
  lead.disqualifiedReason = null;
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

  // Append card to vault (never overwrite prior cards)
  if (payment.method === 'via_card' && paymentDoc.cardLast4) {
    try {
      appendSavedCard(
        lead,
        buildSavedCardEntry({
          cardLast4: paymentDoc.cardLast4,
          cardBrand: paymentDoc.cardBrand,
          cardReferenceToken: paymentDoc.cardReferenceToken,
          expiry: paymentDoc.cardExpiry,
          nameOnCard: paymentDoc.cardHolderName,
          billingZipCode: paymentDoc.billingZip,
          source: 'close_sale',
          cvcCollected: true,
        })
      );
    } catch {
      /* ignore vault append failures — sale still closes */
    }
  }

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
