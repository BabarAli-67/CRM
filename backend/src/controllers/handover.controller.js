import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import Lead from '../models/lead.model.js';
import User from '../models/user.model.js';

export const getHandoverQueue = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    stage: 'closed_sale',
    'handover.cstStatus': 'pending_review',
  })
    .select(
      'stage status clientName businessName phone workEmail personalEmail yelpLink websiteLink gmbLink servicesArea serviceOffered salesAmount payment handover closedAt closedBy agentId closerId notes createdAt updatedAt'
    )
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .sort({ closedAt: 1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'Handover queue retrieved'));
});

/**
 * CST view of onboarded clients currently with Tech (or completed).
 * Surfaces live techStatus for Assigned / In Progress / Completed.
 */
export const getTechPipeline = asyncHandler(async (req, res) => {
  const leads = await Lead.find({
    stage: 'closed_sale',
    'handover.assignedTechId': { $ne: null },
    'handover.cstStatus': { $in: ['assigned', 'in_progress', 'completed'] },
  })
    .select(
      'stage status clientName businessName phone workEmail personalEmail yelpLink websiteLink gmbLink servicesArea serviceOffered salesAmount payment handover closedAt closedBy agentId closerId notes createdAt updatedAt'
    )
    .populate('agentId', 'fullName username role')
    .populate('closerId', 'fullName username role')
    .populate('closedBy', 'fullName username role')
    .populate('handover.assignedTechId', 'fullName username role')
    .sort({ 'handover.assignedAt': -1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'Tech pipeline retrieved'));
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
    workEmail,
    personalEmail,
    salesAmount,
    serviceOffered,
    servicesArea,
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
    'handover.cstStatus': 'pending_review',
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
  setIfProvided('workEmail', workEmail);
  setIfProvided('personalEmail', personalEmail);
  setIfProvided('serviceOffered', serviceOffered);
  setIfProvided('servicesArea', servicesArea);
  setIfProvided('gmbLink', gmbLink);
  setIfProvided('yelpLink', yelpLink);

  if (salesAmount !== undefined) {
    if (salesAmount === '' || salesAmount === null) {
      lead.salesAmount = null;
    } else {
      const n = Number(salesAmount);
      if (Number.isNaN(n) || n < 0) {
        throw new ApiError(400, 'salesAmount must be a non-negative number');
      }
      lead.salesAmount = n;
    }
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
      'stage status clientName businessName phone workEmail personalEmail yelpLink websiteLink gmbLink servicesArea serviceOffered salesAmount payment handover closedAt notes createdAt updatedAt'
    )
    .sort({ 'handover.assignedAt': 1 });

  res
    .status(200)
    .json(new ApiResponse(200, { leads }, 'My projects retrieved'));
});

const MILESTONE_ORDER = {
  pending_review: 0,
  assigned: 1,
  in_progress: 2,
  completed: 3,
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
