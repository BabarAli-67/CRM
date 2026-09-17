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
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'promoted'],
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
