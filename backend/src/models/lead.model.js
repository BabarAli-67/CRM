import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema(
  {
    clientName: {
      type: String,
      default: null,
      trim: true,
    },
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
    workEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    personalEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    yelpLink: {
      type: String,
      default: null,
      trim: true,
    },
    websiteLink: {
      type: String,
      default: null,
      trim: true,
    },
    gmbLink: {
      type: String,
      default: null,
      trim: true,
    },
    servicesArea: {
      type: String,
      default: null,
      trim: true,
    },
    serviceOffered: {
      type: String,
      default: null,
      trim: true,
    },
    salesAmount: {
      type: Number,
      default: null,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    closerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    notes: {
      type: String,
      default: null,
      trim: true,
    },
    /**
     * Closer pool pipeline (stage stays `active` until closed/disqualified).
     * with_agent → agent working; pending_closer_claim → unassigned pool;
     * in_progress → claimed by a closer.
     */
    status: {
      type: String,
      enum: ['with_agent', 'pending_closer_claim', 'in_progress'],
      default: 'with_agent',
      index: true,
    },
    sourceCallbackId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Callback',
      default: null,
    },
    followUp: {
      type: {
        callbackAt: {
          type: Date,
          default: null,
        },
        notes: {
          type: String,
          default: null,
          trim: true,
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
      default: undefined,
    },
    stage: {
      type: String,
      enum: ['active', 'disqualified', 'closed_sale'],
      default: 'active',
      index: true,
    },
    disqualifiedReason: {
      type: String,
      default: null,
      trim: true,
    },
    // SECURITY: Raw card numbers / CVV must never be persisted; only cardLast4,
    // cardBrand, and a cardReferenceToken from a PCI-compliant processor/tokenizer
    // (or opaque local placeholder) should be stored.
    payment: {
      type: {
        method: {
          type: String,
          enum: ['via_link', 'via_card', 'other'],
          default: null,
        },
        linkUrl: {
          type: String,
          default: null,
          trim: true,
        },
        cardLast4: {
          type: String,
          default: null,
          trim: true,
        },
        cardBrand: {
          type: String,
          default: null,
          trim: true,
        },
        cardReferenceToken: {
          type: String,
          default: null,
          trim: true,
        },
        /** Free-text payment source when method is `other` (cash, bank transfer, …). */
        otherDetails: {
          type: String,
          default: null,
          trim: true,
        },
      },
      default: undefined,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    handover: {
      type: {
        cstStatus: {
          type: String,
          enum: [
            'awaiting_handover',
            'pending_review',
            'assigned',
            'in_progress',
            'completed',
          ],
          default: 'awaiting_handover',
        },
        assignedTechId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        assignedAt: {
          type: Date,
          default: null,
        },
        handedOverAt: {
          type: Date,
          default: null,
        },
        completedAt: {
          type: Date,
          default: null,
        },
        overrideLog: {
          type: [
            {
              by: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true,
              },
              reason: {
                type: String,
                required: true,
                trim: true,
              },
              at: {
                type: Date,
                default: Date.now,
              },
            },
          ],
          default: [],
        },
      },
      default: undefined,
    },
  },
  { timestamps: true }
);

leadSchema.index({ agentId: 1, stage: 1 });
leadSchema.index({ closerId: 1, stage: 1 });
leadSchema.index({ status: 1, stage: 1, closerId: 1 });
leadSchema.index({ 'followUp.callbackAt': 1 });

export default mongoose.model('Lead', leadSchema);
