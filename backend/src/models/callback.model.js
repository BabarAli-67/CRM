import mongoose from 'mongoose';

const callbackSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    businessLink: {
      type: String,
      default: null,
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
      required: true,
      index: true,
    },
    /** When set, callback is scheduled against an existing lead (no re-entry of lead fields). */
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'promoted',
        'completed',
        'transferred',
        'cancelled',
      ],
      default: 'pending',
    },
    promotedLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
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

callbackSchema.index({ agentId: 1, callbackAt: 1 });
callbackSchema.index({ callbackAt: 1, status: 1 });

export default mongoose.model('Callback', callbackSchema);
