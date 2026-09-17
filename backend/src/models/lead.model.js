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
    // should be stored. If no real payment processor is integrated yet, store the
    // token field as an opaque placeholder string — see TESTING.md follow-up before
    // any real card data is entered.
    payment: {
      type: {
        method: {
          type: String,
          enum: ['via_link', 'via_card'],
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
          enum: ['pending_review', 'assigned', 'in_progress', 'completed'],
          default: 'pending_review',
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
leadSchema.index({ 'followUp.callbackAt': 1 });

export default mongoose.model('Lead', leadSchema);
