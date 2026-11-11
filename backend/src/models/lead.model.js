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
     * Active pipeline (stage stays `active` until closed/disqualified).
     * with_agent → agent working (closer pre-assigned via closerId);
     * with_closer → handed/escalated to the assigned closer.
     * Legacy: pending_closer_claim / in_progress kept for older documents.
     */
    status: {
      type: String,
      enum: [
        'with_agent',
        'with_closer',
        'pending_closer_claim',
        'in_progress',
      ],
      default: 'with_agent',
      index: true,
    },
    /**
     * @deprecated 24h escalation uses immutable `createdAt` only.
     * Kept nullable so Mongoose never injects Date.now on find/read.
     */
    lastAgentActivityAt: {
      type: Date,
      default: null,
    },
    escalatedAt: {
      type: Date,
      default: null,
    },
    /** When agent/closer handoff completed (manual force or auto escalate). */
    handedOverAt: {
      type: Date,
      default: null,
    },
    /** 'auto' = 24h timeout; 'forced' = agent Hand to Closer */
    escalationType: {
      type: String,
      enum: ['auto', 'forced', 'manual'],
      default: null,
    },
    escalatedReason: {
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
        /** Agent/closer viewed the ring — clears OVERDUE on My Leads. */
        acknowledged: {
          type: Boolean,
          default: false,
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
        /** CST intake notes for tech execution. */
        onboardingNotes: {
          type: String,
          default: null,
          trim: true,
        },
        /** Closer confirmed signed document at CST handoff. */
        documentSigned: {
          type: Boolean,
          default: null,
        },
        /** Uploaded signed document (when documentSigned is true). */
        signedDocument: {
          type: {
            originalName: { type: String, default: null },
            storedFilename: { type: String, default: null },
            mimeType: { type: String, default: null },
            sizeBytes: { type: Number, default: null },
            relativePath: { type: String, default: null },
          },
          default: undefined,
        },
        /** Upsell / upscale captured at CST handoff. */
        upscale: {
          type: {
            enabled: { type: Boolean, default: false },
            itemName: { type: String, default: null, trim: true },
            price: { type: Number, default: null },
          },
          default: undefined,
        },
        /** Free-text context for CST (visible for both upscale yes/no). */
        upscaleNotes: {
          type: String,
          default: null,
          trim: true,
        },
        /** Tech execution progress (mirrors assigned → in_progress → completed). */
        techStatus: {
          type: String,
          enum: ['assigned', 'in_progress', 'completed'],
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
leadSchema.index({ 'handover.assignedTechId': 1, 'handover.cstStatus': 1 });
leadSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model('Lead', leadSchema);
