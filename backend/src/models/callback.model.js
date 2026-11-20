import mongoose from 'mongoose';

/**
 * Locked Callback schema — agent + closer agenda rows only.
 * No legacy `phone` or duplicate contact fields.
 */
const callbackSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    personalPhone: {
      type: String,
      default: null,
      trim: true,
    },
    businessPhone: {
      type: String,
      default: null,
      trim: true,
    },
    businessLink: {
      type: String,
      required: true,
      trim: true,
    },
    callbackAt: {
      type: Date,
      required: true,
    },
    notes: {
      type: String,
      default: null,
      trim: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    closerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    /** Required for agent-owned callbacks (who receives promote + closer agenda). */
    assignedCloserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
      index: true,
    },
    promotedLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'attended',
        'promoted',
        'completed',
        'transferred',
        'cancelled',
      ],
      default: 'pending',
    },
    alerts: {
      fiveMinFired: {
        type: Boolean,
        default: false,
      },
      exactTimeFired: {
        type: Boolean,
        default: false,
      },
    },
  },
  { timestamps: true }
);

callbackSchema.pre('validate', function ensureOwnerAndCloser() {
  if (!this.agentId && !this.closerId) {
    throw new Error('agentId or closerId is required');
  }
  // Agent-owned rows must name an assigned closer
  if (this.agentId && !this.assignedCloserId) {
    throw new Error('assignedCloserId is required for agent callbacks');
  }
  if (!this.businessLink || !String(this.businessLink).trim()) {
    throw new Error('businessLink is required');
  }
});

callbackSchema.index({ agentId: 1, callbackAt: 1 });
callbackSchema.index({ closerId: 1, callbackAt: 1 });
callbackSchema.index({ assignedCloserId: 1, callbackAt: 1 });
callbackSchema.index({ callbackAt: 1, status: 1 });

export default mongoose.model('Callback', callbackSchema);
