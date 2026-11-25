import path from 'path';
import fs from 'fs';
import asyncHandler from '../utils/asyncHandler.util.js';
import { ApiError } from '../utils/apiError.util.js';
import { ApiResponse } from '../utils/apiResponse.util.js';
import MockupRequest, {
  MOCKUP_STATUS_LABEL,
} from '../models/mockupRequest.model.js';
import User from '../models/user.model.js';
import { emitToUser } from '../sockets/ioInstance.util.js';
import { emitToAllTechHeads } from '../utils/techTeam.util.js';
import { UPLOAD_ROOT } from '../middlewares/mockupUpload.middleware.js';

const ROLE_LABEL = {
  closer: 'Closer',
  cst_manager: 'CST',
};

const toPublicMockup = (doc) => {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  return {
    _id: obj._id,
    businessName: obj.businessName,
    description: obj.description,
    logo: obj.logo
      ? {
          originalName: obj.logo.originalName,
          mimeType: obj.logo.mimeType,
          sizeBytes: obj.logo.sizeBytes,
          hasFile: true,
        }
      : null,
    videoUrl: obj.videoUrl || null,
    videoFile: obj.videoFile
      ? {
          originalName: obj.videoFile.originalName,
          mimeType: obj.videoFile.mimeType,
          sizeBytes: obj.videoFile.sizeBytes,
          hasFile: true,
        }
      : null,
    requestedBy: obj.requestedBy,
    requestedByLabel: obj.requestedBy
      ? `${obj.requestedBy.name} (${ROLE_LABEL[obj.requestedBy.role] || obj.requestedBy.role})`
      : null,
    assignedTo: obj.assignedTo?.userId
      ? {
          userId: obj.assignedTo.userId,
          name: obj.assignedTo.name,
          jd: obj.assignedTo.jd,
        }
      : null,
    mockupUrl: obj.mockupUrl || null,
    status: obj.status,
    statusLabel: MOCKUP_STATUS_LABEL[obj.status] || obj.status,
    assignedAt: obj.assignedAt,
    submittedAt: obj.submittedAt,
    deliveredAt: obj.deliveredAt,
    requesterViewedAt: obj.requesterViewedAt || null,
    unreadForRequester:
      obj.status === 'delivered' &&
      obj.deliveredAt &&
      (!obj.requesterViewedAt ||
        new Date(obj.requesterViewedAt).getTime() <
          new Date(obj.deliveredAt).getTime()),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
};

const isUnreadDeliveredForRequester = (mockup) =>
  mockup?.status === 'delivered' &&
  mockup?.deliveredAt &&
  (!mockup.requesterViewedAt ||
    new Date(mockup.requesterViewedAt).getTime() <
      new Date(mockup.deliveredAt).getTime());

const buildFileAsset = (file, folderId) => {
  if (!file) return null;
  return {
    originalName: file.originalname || null,
    storedFilename: file.filename,
    mimeType: file.mimetype || null,
    sizeBytes: file.size ?? null,
    relativePath: path
      .join('uploads', 'mockups', folderId, file.filename)
      .replace(/\\/g, '/'),
  };
};

const assertCanViewMockup = (mockup, user) => {
  const role = user.role;
  const uid = String(user._id);

  if (role === 'super_admin' || role === 'tech_head') return true;
  if (
    (role === 'closer' || role === 'cst_manager') &&
    String(mockup.requestedBy?.userId) === uid
  ) {
    return true;
  }
  if (
    role === 'tech_team' &&
    mockup.assignedTo?.userId &&
    String(mockup.assignedTo.userId) === uid
  ) {
    return true;
  }
  return false;
};

/**
 * POST /mockups — Closer / CST create request (multipart).
 */
export const createMockupRequest = asyncHandler(async (req, res) => {
  const role = req.user.role;
  if (role !== 'closer' && role !== 'cst_manager') {
    throw new ApiError(403, 'Only Closers and CST Managers can request mockups');
  }

  const businessName = String(req.body?.businessName || '').trim();
  const description = String(req.body?.description || '').trim();
  const videoUrlRaw = String(req.body?.videoUrl || '').trim();

  if (!businessName) throw new ApiError(400, 'Business Name is required');
  if (!description) throw new ApiError(400, 'Description is required');

  const logoFile = req.files?.logo?.[0];
  const folderId = req.mockupUploadFolder;
  const logo = logoFile ? buildFileAsset(logoFile, folderId) : undefined;
  const videoFile = req.files?.video?.[0]
    ? buildFileAsset(req.files.video[0], folderId)
    : undefined;

  let videoUrl = null;
  if (videoUrlRaw) {
    try {
      // eslint-disable-next-line no-new
      new URL(videoUrlRaw);
      videoUrl = videoUrlRaw;
    } catch {
      throw new ApiError(400, 'Video URL must be a valid URL');
    }
  }

  const mockup = await MockupRequest.create({
    businessName,
    description,
    logo,
    videoUrl,
    videoFile,
    requestedBy: {
      userId: req.user._id,
      name: req.user.fullName || req.user.username || 'Requester',
      role,
    },
    status: 'pending_assignment',
  });

  await emitToAllTechHeads(User, 'mockup:new', {
    mockupId: String(mockup._id),
    businessName: mockup.businessName,
    requestedByName: mockup.requestedBy.name,
    requestedByRole: mockup.requestedBy.role,
    at: mockup.createdAt,
  });

  res.status(201).json(
    new ApiResponse(
      201,
      { mockup: toPublicMockup(mockup) },
      'Mockup request submitted to Tech Head'
    )
  );
});

/**
 * GET /mockups/mine — requester tracker.
 */
export const listMyMockups = asyncHandler(async (req, res) => {
  const role = req.user.role;
  if (role !== 'closer' && role !== 'cst_manager') {
    throw new ApiError(403, 'Not allowed');
  }

  const rows = await MockupRequest.find({
    'requestedBy.userId': req.user._id,
  }).sort({ createdAt: -1 });

  res.status(200).json(
    new ApiResponse(
      200,
      { mockups: rows.map(toPublicMockup) },
      'My mockup requests retrieved'
    )
  );
});

/**
 * GET /mockups/tech-head — incoming + in-flight for Tech Head.
 */
export const listTechHeadMockups = asyncHandler(async (req, res) => {
  const rows = await MockupRequest.find({})
    .sort({
      status: 1,
      createdAt: -1,
    })
    .limit(300);

  // Prefer actionable first: pending → ready → in progress → delivered
  const rank = {
    pending_assignment: 0,
    ready_for_review: 1,
    in_progress: 2,
    delivered: 3,
  };
  rows.sort(
    (a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
      new Date(b.createdAt) - new Date(a.createdAt)
  );

  res.status(200).json(
    new ApiResponse(
      200,
      { mockups: rows.map(toPublicMockup) },
      'Tech Head mockups retrieved'
    )
  );
});

/**
 * GET /mockups/assigned — Tech member assigned mockups.
 */
export const listAssignedMockups = asyncHandler(async (req, res) => {
  if (req.user.role !== 'tech_team') {
    throw new ApiError(403, 'Tech team only');
  }

  const rows = await MockupRequest.find({
    'assignedTo.userId': req.user._id,
    status: { $in: ['in_progress', 'ready_for_review', 'delivered'] },
  }).sort({ assignedAt: -1, createdAt: -1 });

  res.status(200).json(
    new ApiResponse(
      200,
      { mockups: rows.map(toPublicMockup) },
      'Assigned mockups retrieved'
    )
  );
});

/**
 * GET /mockups/badges — role-scoped counts for sidebar badges.
 */
export const getMockupBadges = asyncHandler(async (req, res) => {
  const role = req.user.role;

  if (role === 'tech_head' || role === 'super_admin') {
    const [pendingAssignment, readyForReview] = await Promise.all([
      MockupRequest.countDocuments({ status: 'pending_assignment' }),
      MockupRequest.countDocuments({ status: 'ready_for_review' }),
    ]);
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          pendingAssignment,
          readyForReview,
          actionable: pendingAssignment + readyForReview,
        },
        'Mockup badges retrieved'
      )
    );
  }

  if (role === 'tech_team') {
    const assignedActive = await MockupRequest.countDocuments({
      'assignedTo.userId': req.user._id,
      status: 'in_progress',
    });
    return res.status(200).json(
      new ApiResponse(
        200,
        { assignedActive },
        'Mockup badges retrieved'
      )
    );
  }

  if (role === 'closer' || role === 'cst_manager') {
    const deliveredUnread = await MockupRequest.countDocuments({
      'requestedBy.userId': req.user._id,
      status: 'delivered',
      deliveredAt: { $ne: null },
      $or: [
        { requesterViewedAt: null },
        { requesterViewedAt: { $exists: false } },
        { $expr: { $lt: ['$requesterViewedAt', '$deliveredAt'] } },
      ],
    });
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          deliveredUnread,
          actionable: deliveredUnread,
        },
        'Mockup badges retrieved'
      )
    );
  }

  res.status(200).json(
    new ApiResponse(
      200,
      { actionable: 0, assignedActive: 0, deliveredUnread: 0 },
      'Mockup badges'
    )
  );
});

/**
 * GET /mockups/notifications — unread delivered mockups for CST / Closer bell.
 */
export const getMockupNotifications = asyncHandler(async (req, res) => {
  const role = req.user.role;
  if (role !== 'closer' && role !== 'cst_manager') {
    throw new ApiError(403, 'Only Closer and CST Manager can view mockup notifications');
  }

  const rows = await MockupRequest.find({
    'requestedBy.userId': req.user._id,
    status: 'delivered',
    deliveredAt: { $ne: null },
  })
    .sort({ deliveredAt: -1 })
    .limit(50);

  const notifications = rows
    .filter((m) => isUnreadDeliveredForRequester(m))
    .map((m) => ({
      mockupId: String(m._id),
      businessName: m.businessName || 'Business',
      mockupUrl: m.mockupUrl || null,
      deliveredAt: m.deliveredAt,
      preview: `Mockup ready for ${m.businessName || 'Business'} — click to view`,
    }));

  res.status(200).json(
    new ApiResponse(
      200,
      {
        notifications,
        totalUnread: notifications.length,
      },
      'Mockup notifications retrieved'
    )
  );
});

/**
 * PATCH /mockups/:id/viewed — mark a delivered mockup as viewed by requester.
 */
export const markMockupViewed = asyncHandler(async (req, res) => {
  const mockup = await MockupRequest.findById(req.params.id);
  if (!mockup) throw new ApiError(404, 'Mockup request not found');

  if (!assertCanViewMockup(mockup, req.user)) {
    throw new ApiError(403, 'You can only mark your own mockups as viewed');
  }

  const role = req.user.role;
  if (role !== 'closer' && role !== 'cst_manager') {
    throw new ApiError(403, 'Only the original requester can mark a mockup viewed');
  }

  mockup.requesterViewedAt = new Date();
  await mockup.save();

  res.status(200).json(
    new ApiResponse(
      200,
      { mockup: toPublicMockup(mockup) },
      'Mockup marked as viewed'
    )
  );
});

/**
 * PATCH /mockups/mine/viewed — mark all of requester's delivered mockups viewed.
 */
export const markMyMockupsViewed = asyncHandler(async (req, res) => {
  const role = req.user.role;
  if (role !== 'closer' && role !== 'cst_manager') {
    throw new ApiError(403, 'Only Closer and CST Manager can mark mockups viewed');
  }

  const now = new Date();
  const result = await MockupRequest.updateMany(
    {
      'requestedBy.userId': req.user._id,
      status: 'delivered',
      deliveredAt: { $ne: null },
      $or: [
        { requesterViewedAt: null },
        { requesterViewedAt: { $exists: false } },
        { $expr: { $lt: ['$requesterViewedAt', '$deliveredAt'] } },
      ],
    },
    { $set: { requesterViewedAt: now } }
  );

  res.status(200).json(
    new ApiResponse(
      200,
      { modifiedCount: result.modifiedCount || 0 },
      'Delivered mockups marked as viewed'
    )
  );
});

/**
 * PATCH /mockups/:id/assign — Tech Head assigns any Tech member.
 */
export const assignMockup = asyncHandler(async (req, res) => {
  const techId = String(req.body?.techId || '').trim();
  if (!techId) throw new ApiError(400, 'Select a Tech team member');

  const tech = await User.findOne({
    _id: techId,
    role: 'tech_team',
    status: 'approved',
  }).select('_id fullName username jd');

  if (!tech) {
    throw new ApiError(400, 'Assignee must be an approved Tech team member');
  }

  const mockup = await MockupRequest.findById(req.params.id);
  if (!mockup) throw new ApiError(404, 'Mockup request not found');

  if (mockup.assignedTo?.userId || mockup.status !== 'pending_assignment') {
    throw new ApiError(
      409,
      'This mockup is already assigned and cannot be reassigned from here'
    );
  }

  mockup.assignedTo = {
    userId: tech._id,
    name: tech.fullName || tech.username || 'Tech',
    jd: tech.jd || null,
  };
  mockup.status = 'in_progress';
  mockup.assignedAt = new Date();
  // Clear any prior URL when (re)assigning before delivery
  mockup.mockupUrl = null;
  mockup.submittedAt = null;
  await mockup.save();

  emitToUser(String(tech._id), 'mockup:assigned', {
    mockupId: String(mockup._id),
    businessName: mockup.businessName,
    at: mockup.assignedAt,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      { mockup: toPublicMockup(mockup) },
      'Mockup assigned to Tech member'
    )
  );
});

/**
 * PATCH /mockups/:id/submit-url — Tech member submits completed URL.
 */
export const submitMockupUrl = asyncHandler(async (req, res) => {
  if (req.user.role !== 'tech_team') {
    throw new ApiError(403, 'Only assigned Tech members can submit a mockup URL');
  }

  const mockupUrl = String(req.body?.mockupUrl || '').trim();
  if (!mockupUrl) throw new ApiError(400, 'Mockup URL is required');
  try {
    // eslint-disable-next-line no-new
    new URL(mockupUrl);
  } catch {
    throw new ApiError(400, 'Mockup URL must be a valid URL');
  }

  const mockup = await MockupRequest.findById(req.params.id);
  if (!mockup) throw new ApiError(404, 'Mockup request not found');

  if (String(mockup.assignedTo?.userId) !== String(req.user._id)) {
    throw new ApiError(403, 'This mockup is not assigned to you');
  }
  if (mockup.status !== 'in_progress') {
    throw new ApiError(409, 'Mockup is not awaiting your submission');
  }

  mockup.mockupUrl = mockupUrl;
  mockup.status = 'ready_for_review';
  mockup.submittedAt = new Date();
  await mockup.save();

  await emitToAllTechHeads(User, 'mockup:ready', {
    mockupId: String(mockup._id),
    businessName: mockup.businessName,
    mockupUrl,
    submittedBy: mockup.assignedTo?.name,
    at: mockup.submittedAt,
  });

  res.status(200).json(
    new ApiResponse(
      200,
      { mockup: toPublicMockup(mockup) },
      'Mockup URL submitted to Tech Head'
    )
  );
});

/**
 * PATCH /mockups/:id/forward — Tech Head forwards URL to original sender.
 */
export const forwardMockupToSender = asyncHandler(async (req, res) => {
  const mockup = await MockupRequest.findById(req.params.id);
  if (!mockup) throw new ApiError(404, 'Mockup request not found');

  if (mockup.status !== 'ready_for_review' && mockup.status !== 'delivered') {
    throw new ApiError(
      409,
      'Mockup must be ready for review before forwarding to sender'
    );
  }

  let nextUrl = String(req.body?.mockupUrl || mockup.mockupUrl || '').trim();
  if (!nextUrl) throw new ApiError(400, 'Mockup URL is required');
  try {
    // eslint-disable-next-line no-new
    new URL(nextUrl);
  } catch {
    throw new ApiError(400, 'Mockup URL must be a valid URL');
  }

  mockup.mockupUrl = nextUrl;
  mockup.status = 'delivered';
  mockup.deliveredAt = new Date();
  // Re-open unread state for the original CST / Closer requester
  mockup.requesterViewedAt = null;
  await mockup.save();

  const requesterId = mockup.requestedBy?.userId;
  if (requesterId) {
    emitToUser(String(requesterId), 'mockup:delivered', {
      mockupId: String(mockup._id),
      businessName: mockup.businessName || 'Business',
      mockupUrl: mockup.mockupUrl,
      at: mockup.deliveredAt,
      preview: `Mockup ready for ${mockup.businessName || 'Business'} — click to view`,
    });
  }

  res.status(200).json(
    new ApiResponse(
      200,
      { mockup: toPublicMockup(mockup) },
      'Mockup URL forwarded to original sender'
    )
  );
});

/**
 * GET /mockups/:id/files/:field — authenticated logo/video download.
 */
export const serveMockupFile = asyncHandler(async (req, res) => {
  const field = String(req.params.field || '').toLowerCase();
  if (field !== 'logo' && field !== 'video') {
    throw new ApiError(400, 'Invalid file field');
  }

  const mockup = await MockupRequest.findById(req.params.id);
  if (!mockup) throw new ApiError(404, 'Mockup request not found');
  if (!assertCanViewMockup(mockup, req.user)) {
    throw new ApiError(403, 'You cannot access this mockup file');
  }

  const asset = field === 'logo' ? mockup.logo : mockup.videoFile;
  if (!asset?.storedFilename || !asset?.relativePath) {
    throw new ApiError(404, 'File not found');
  }

  const absolutePath = path.resolve(process.cwd(), asset.relativePath);
  const root = path.resolve(UPLOAD_ROOT);
  if (!absolutePath.startsWith(root) || !fs.existsSync(absolutePath)) {
    throw new ApiError(404, 'File not found on disk');
  }

  if (asset.mimeType) res.type(asset.mimeType);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(asset.originalName || asset.storedFilename)}"`
  );
  res.sendFile(absolutePath);
});
