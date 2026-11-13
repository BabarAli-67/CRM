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
    /** Optional niche / industry (CST profile context; may be blank). */
    niche: {
      type: String,
      default: null,
      trim: true,
    },
    /** Optional street / mailing address (CST profile context; may be blank). */
    locationAddress: {
      type: String,
      default: null,
      trim: true,
    },
    /** Lead source label (CST profile context; may be blank). */
    leadSource: {
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
            'onboarded',
            'assigned',
            'in_progress',
            'completed',
          ],
          default: 'awaiting_handover',
        },
        /** When CST clicked Onboard Client (entered Onboard tab). */
        onboardedAt: {
          type: Date,
          default: null,
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
        /**
         * CST activation call (set from Client Detail Section A).
         * Missing/undefined → treat as not completed (No).
         */
        activationCall: {
          type: {
            done: {
              type: Boolean,
              default: false,
            },
            at: {
              type: Date,
              default: null,
            },
          },
          default: undefined,
        },
        /**
         * Onboarding welcome email (Client Detail Section B via EmailJS).
         * Missing/undefined → treat as not sent (No).
         */
        welcomeEmail: {
          type: {
            sent: {
              type: Boolean,
              default: false,
            },
            at: {
              type: Date,
              default: null,
            },
            toEmail: {
              type: String,
              default: null,
              trim: true,
              lowercase: true,
            },
          },
          default: undefined,
        },
        /**
         * CST retention callback (Client Detail Section C).
         * Exact-time dashboard alert only (fiveMinFired always true to skip early warning).
         */
        retention: {
          type: {
            at: {
              type: Date,
              default: null,
            },
            status: {
              type: String,
              enum: ['scheduled', 'done'],
              default: null,
            },
            alerts: {
              fiveMinFired: {
                type: Boolean,
                default: true,
              },
              exactTimeFired: {
                type: Boolean,
                default: false,
              },
            },
            doneAt: {
              type: Date,
              default: null,
            },
          },
          default: undefined,
        },
        /**
         * Products / Services & Custom Scope (Client Detail Section D).
         * selected: seo | web | social_media | other
         */
        serviceScope: {
          type: {
            selected: {
              type: [
                {
                  type: String,
                  enum: ['seo', 'web', 'social_media', 'other'],
                },
              ],
              default: [],
            },
            otherNote: {
              type: String,
              default: null,
              trim: true,
            },
          },
          default: undefined,
        },
        /**
         * Upselling & Split Payment Ledger (Client Detail Section E).
         * Separate from base sale payment / salesAmount — never mixed.
         * Pending = max(0, totalAmount - paidAmount); computed on the client.
         */
        upsellLedger: {
          type: [
            {
              entryId: {
                type: String,
                required: true,
                trim: true,
              },
              title: {
                type: String,
                default: '',
                trim: true,
              },
              totalAmount: {
                type: Number,
                default: 0,
                min: 0,
              },
              paidAmount: {
                type: Number,
                default: 0,
                min: 0,
              },
            },
          ],
          default: undefined,
        },
        /**
         * Cumulative paid total = salesAmount (base) + sum(upsell paid).
         * Never overwrites salesAmount — recomputed on portfolio save.
         */
        totalCollectedAmount: {
          type: Number,
          default: null,
          min: 0,
        },
        /**
         * Contract value = salesAmount (base) + sum(upsell totals).
         * Recomputed on portfolio save alongside totalCollectedAmount.
         */
        totalContractValue: {
          type: Number,
          default: null,
          min: 0,
        },
        /**
         * Live Portfolio keywords (Section F) — Tech manages; CST view-only.
         * text = keyword phrase; position = ranking (e.g. "#3", "Page 1 - Pos 4").
         * Legacy rows without position remain valid (position defaults null).
         */
        portfolioKeywords: {
          type: [
            {
              keywordId: { type: String, required: true, trim: true },
              text: { type: String, required: true, trim: true },
              position: { type: String, default: null, trim: true },
              note: { type: String, default: null, trim: true },
              at: { type: Date, default: Date.now },
            },
          ],
          default: undefined,
        },
        /**
         * Monthly report PDFs (Section F) — Tech uploads; CST views/downloads.
         */
        monthlyReports: {
          type: [
            {
              reportId: { type: String, required: true, trim: true },
              title: { type: String, required: true, trim: true },
              originalName: { type: String, default: null },
              storedFilename: { type: String, required: true },
              mimeType: { type: String, default: 'application/pdf' },
              sizeBytes: { type: Number, default: null },
              relativePath: { type: String, required: true },
              uploadedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null,
              },
              at: { type: Date, default: Date.now },
            },
          ],
          default: undefined,
        },
        /**
         * Client change request log (Section F) — CST/Tech log; Tech updates status.
         */
        changeRequests: {
          type: [
            {
              requestId: { type: String, required: true, trim: true },
              category: {
                type: String,
                enum: ['seo', 'web', 'social_media', 'other'],
                required: true,
              },
              description: { type: String, required: true, trim: true },
              status: {
                type: String,
                enum: ['pending', 'in_progress', 'completed'],
                default: 'pending',
              },
              loggedAt: { type: Date, default: Date.now },
              loggedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null,
              },
              statusUpdatedAt: { type: Date, default: null },
              statusUpdatedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null,
              },
            },
          ],
          default: undefined,
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
