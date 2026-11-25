import mongoose from 'mongoose';

const MOCKUP_STATUSES = [
  'pending_assignment',
  'in_progress',
  'ready_for_review',
  'delivered',
];

const REQUESTER_ROLES = ['closer', 'cst_manager'];

const fileAssetSchema = new mongoose.Schema(
  {
    originalName: { type: String, default: null },
    storedFilename: { type: String, required: true },
    mimeType: { type: String, default: null },
    sizeBytes: { type: Number, default: null },
    relativePath: { type: String, required: true },
  },
  { _id: false }
);

const mockupRequestSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    /** Optional logo asset — requests may omit a logo file. */
    logo: {
      type: fileAssetSchema,
      default: undefined,
    },
    /** Optional external video link (YouTube / Drive / etc.). */
    videoUrl: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
    },
    /** Optional uploaded video file (alternative to videoUrl). */
    videoFile: {
      type: fileAssetSchema,
      default: undefined,
    },
    requestedBy: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      name: { type: String, required: true, trim: true },
      role: {
        type: String,
        enum: REQUESTER_ROLES,
        required: true,
      },
    },
    assignedTo: {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      name: { type: String, default: null, trim: true },
      jd: { type: String, default: null, trim: true },
    },
    mockupUrl: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: MOCKUP_STATUSES,
      default: 'pending_assignment',
      index: true,
    },
    assignedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

mockupRequestSchema.index({ 'requestedBy.userId': 1, createdAt: -1 });
mockupRequestSchema.index({ 'assignedTo.userId': 1, status: 1 });
mockupRequestSchema.index({ status: 1, createdAt: -1 });

export const MOCKUP_STATUS_LABEL = {
  pending_assignment: 'Pending Assignment',
  in_progress: 'In Progress',
  ready_for_review: 'Ready for Tech Head Review',
  delivered: 'Delivered',
};

export { MOCKUP_STATUSES, REQUESTER_ROLES };
export default mongoose.model('MockupRequest', mockupRequestSchema);
