import mongoose from 'mongoose';

/**
 * Locked Lead schema — Agent intake + Closer/CST/Tech pipeline.
 * Legacy `phone`, `workEmail`, `servicesArea`, `serviceOffered`,
 * and `lastAgentActivityAt` are removed (see purgeLegacyLeadCallbackFields).
 */
const leadSchema = new mongoose.Schema(
  {
    // ── Agent intake ──────────────────────────────────────────────
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
    websiteLink: {
      type: String,
      required: true,
      trim: true,
    },
    closerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Null for closer-sourced Direct Contact → Lead promotions. */
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    clientName: {
      type: String,
      default: null,
      trim: true,
    },
    businessEmail: {
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
    gmbLink: {
      type: String,
      default: null,
      trim: true,
    },
    /**
     * Social profile URLs (Facebook, Instagram, LinkedIn, TikTok, YouTube, …).
     * Freeform multi-line / comma-separated text preserved as entered.
     */
    socialLinks: {
      type: String,
      default: null,
      trim: true,
    },
    serviceAreas: {
      type: String,
      default: null,
      trim: true,
    },
    servicesOffered: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * Multi-month contract on the base deal.
     * When enabled, servicesOffered is labeled e.g. "SEO Contract (3 Months)"
     * and CST retention is deferred by contractMonths (not +30 days).
     */
    contractEnabled: {
      type: Boolean,
      default: false,
    },
    contractMonths: {
      type: Number,
      default: null,
      min: 1,
      max: 120,
    },
    /** Total contract / upfront amount — syncs with paymentOffered when set. */
    contractAmount: {
      type: Number,
      default: null,
      min: 0,
    },
    /** Deal value offered to the client (agent intake). */
    paymentOffered: {
      type: Number,
      required: true,
      min: 0,
    },
    /** Amount collected so far (agent intake; defaults to 0). */
    paymentReceived: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    /** Auto: max(0, paymentOffered - paymentReceived). Persisted for queries/UI. */
    paymentPending: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    notes: {
      type: String,
      default: null,
      trim: true,
    },

    // ── CST profile context (optional; used on Client Detail) ─────
    yelpLink: {
      type: String,
      default: null,
      trim: true,
    },
    niche: {
      type: String,
      default: null,
      trim: true,
    },
    locationAddress: {
      type: String,
      default: null,
      trim: true,
    },
    leadSource: {
      type: String,
      default: null,
      trim: true,
    },

    // ── System & pipeline ─────────────────────────────────────────
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
        /** Cardholder name — safe to store; never store PAN / CVV / expiry. */
        cardHolderName: {
          type: String,
          default: null,
          trim: true,
        },
        /** Billing ZIP / postal code — safe to store with card metadata. */
        billingZip: {
          type: String,
          default: null,
          trim: true,
        },
        /** Card expiry MM/YY — stored for vault display; never store CVC. */
        cardExpiry: {
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
    /**
     * Accumulating card vault for this business/lead.
     * SECURITY: Never store raw PAN or CVC. Display uses masked last4 + expiry;
     * cvcOnFile indicates CVC was collected at capture time.
     */
    savedCards: {
      type: [
        {
          cardId: { type: String, required: true, trim: true },
          cardLast4: { type: String, required: true, trim: true },
          cardBrand: { type: String, default: null, trim: true },
          cardReferenceToken: { type: String, default: null, trim: true },
          expiry: { type: String, default: null, trim: true },
          nameOnCard: { type: String, default: null, trim: true },
          billingZipCode: { type: String, default: null, trim: true },
          cvcOnFile: { type: Boolean, default: true },
          addedAt: { type: Date, default: Date.now },
          source: {
            type: String,
            enum: ['close_sale', 'move_to_cst', 'cst_upsell'],
            default: 'close_sale',
          },
        },
      ],
      default: [],
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
            'ongoing_seo',
            'completed',
          ],
          default: 'awaiting_handover',
        },
        /** When CST clicked Onboard Client (entered Onboard tab). */
        onboardedAt: {
          type: Date,
          default: null,
        },
        /**
         * Permanent Tech Department project number (#1, #2, …).
         * Assigned on onboard; never reused or renumbered.
         */
        projectNumber: {
          type: Number,
          default: null,
          min: 1,
        },
        assignedTechId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        /**
         * One or more Tech specialists assigned by Tech Head.
         * Regular tech_team visibility is scoped to this list (or legacy assignedTechId).
         */
        assignedTechIds: {
          type: [
            {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'User',
            },
          ],
          default: undefined,
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
        /** Upsell captured at CST handoff (legacy field name `upscale` kept). */
        upscale: {
          type: {
            enabled: { type: Boolean, default: false },
            itemName: { type: String, default: null, trim: true },
            /** @deprecated Prefer offered — kept as alias of offered. */
            price: { type: Number, default: null },
            offered: { type: Number, default: null, min: 0 },
            received: { type: Number, default: null, min: 0 },
            pending: { type: Number, default: null, min: 0 },
            paymentMethod: {
              type: String,
              enum: ['old_card', 'new_card', 'via_link', 'other'],
              default: undefined,
            },
            selectedCardId: { type: String, default: null, trim: true },
            paymentReference: { type: String, default: null, trim: true },
          },
          default: undefined,
        },
        /** Free-text context for upsell (visible for both yes/no). */
        upscaleNotes: {
          type: String,
          default: null,
          trim: true,
        },
        /** Closer → CST handover instructions. */
        handoverNotes: {
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
            /**
             * Monthly recurring retention payments (never mixed into base paymentReceived).
             * Each Mark Retention Paid appends one entry and advances `at` by +30 days.
             */
            history: {
              type: [
                {
                  entryId: { type: String, required: true, trim: true },
                  monthLabel: { type: String, default: '', trim: true },
                  /** Product / service renewed this cycle (e.g. SEO, GMB). */
                  serviceName: { type: String, default: null, trim: true },
                  amount: { type: Number, default: 0, min: 0 },
                  paidAt: { type: Date, default: null },
                  previousAmount: { type: Number, default: null },
                  delta: { type: Number, default: 0 },
                  note: { type: String, default: null, trim: true },
                  createdBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    default: null,
                  },
                },
              ],
              default: undefined,
            },
            lastPaidAt: {
              type: Date,
              default: null,
            },
            lastPaidAmount: {
              type: Number,
              default: null,
              min: 0,
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
         * Separate from base paymentOffered / paymentReceived — never mixed.
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
              service: {
                type: String,
                enum: ['seo', 'web', 'citation_pages', 'other'],
                default: null,
              },
              serviceOther: {
                type: String,
                default: null,
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
              paymentOption: {
                type: String,
                enum: ['new_card', 'old_card', 'link', 'others'],
                default: null,
              },
              selectedCardId: {
                type: String,
                default: null,
                trim: true,
              },
              paymentReference: {
                type: String,
                default: null,
                trim: true,
              },
              notes: {
                type: String,
                default: null,
                trim: true,
              },
              /** When this upsell row was added (PKT month scoping). */
              createdAt: {
                type: Date,
                default: Date.now,
              },
              /** Last payment logged against this upsell. */
              paidAt: {
                type: Date,
                default: null,
              },
              /**
               * Incremental payment log for month-scoped Collected Amount.
               * [{ amount, at }]
               */
              paymentEvents: {
                type: [
                  {
                    amount: { type: Number, default: 0, min: 0 },
                    at: { type: Date, default: Date.now },
                  },
                ],
                default: undefined,
              },
            },
          ],
          default: undefined,
        },
        /**
         * Cumulative paid = paymentReceived (base) + sum(upsell paid).
         * Never overwrites paymentReceived — recomputed on portfolio save.
         */
        totalCollectedAmount: {
          type: Number,
          default: null,
          min: 0,
        },
        /**
         * Contract value = paymentOffered (base) + sum(upsell totals).
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
              updatedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null,
              },
              updatedByName: { type: String, default: null, trim: true },
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
              /** Display month e.g. "November 2026" */
              reportMonth: { type: String, default: null, trim: true },
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
              uploadedByName: { type: String, default: null, trim: true },
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
                // Legacy social_media / other kept so existing rows still validate
                enum: [
                  'seo',
                  'web',
                  'citation_pages',
                  'others',
                  'other',
                  'social_media',
                ],
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
        /**
         * Client Detail → Comments tab (@mentions + file attachments).
         * Shared CST Manager ↔ Tech Team thread only.
         */
        comments: {
          type: [
            {
              commentId: { type: String, required: true, trim: true },
              body: { type: String, required: true, trim: true },
              /**
               * Lane privacy: cst = CST↔Tech Head, tech = Tech Head↔Specialists,
               * both = visible to CST and Tech Team.
               */
              visibility: {
                type: String,
                enum: ['cst', 'tech', 'both'],
                default: 'both',
              },
              mentions: {
                type: [
                  {
                    userId: {
                      type: mongoose.Schema.Types.ObjectId,
                      ref: 'User',
                      required: true,
                    },
                    fullName: { type: String, default: null, trim: true },
                    username: { type: String, default: null, trim: true },
                    role: { type: String, default: null, trim: true },
                  },
                ],
                default: [],
              },
              attachments: {
                type: [
                  {
                    originalName: { type: String, default: null },
                    storedFilename: { type: String, required: true },
                    mimeType: { type: String, default: null },
                    sizeBytes: { type: Number, default: null },
                    relativePath: { type: String, required: true },
                  },
                ],
                default: [],
              },
              createdAt: { type: Date, default: Date.now },
              createdBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null,
              },
            },
          ],
          default: undefined,
        },
        /** Per-user last-read watermark for unread comment badges / bell. */
        commentReads: {
          type: [
            {
              userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true,
              },
              lastReadAt: { type: Date, required: true },
            },
          ],
          default: [],
        },
        /** Tech execution: assigned(Pending) → in_progress → ongoing_seo → completed. */
        techStatus: {
          type: String,
          enum: ['assigned', 'in_progress', 'ongoing_seo', 'completed'],
          default: null,
        },
        /**
         * Tech Head operational trackers (editable by Tech Head only).
         * Visible read-only to assigned Tech specialists.
         */
        clientOpsStatus: {
          type: String,
          enum: ['Running', 'Paused', 'Stopped / Out', 'Pending'],
          default: null,
        },
        gmbOpsStatus: {
          type: String,
          enum: [
            'Verified',
            'Pending Verification',
            'Suspended',
            'Not Applicable',
          ],
          default: null,
        },
        websiteSeoOpsStatus: {
          type: String,
          enum: [
            'Running',
            'In Progress',
            'Paused',
            'Completed',
            'Not Applicable',
          ],
          default: null,
        },
        /**
         * Tech Head forwards of CST @Tech Head escalations to specialists.
         */
        techTaskNotes: {
          type: [
            {
              noteId: { type: String, required: true, trim: true },
              commentId: { type: String, default: null, trim: true },
              /** Links to the single Comments-thread handoff bubble (prevents duplicates). */
              forwardCommentId: { type: String, default: null, trim: true },
              body: { type: String, required: true, trim: true },
              guidance: { type: String, default: null, trim: true },
              assignedToUserId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true,
              },
              assignedToName: { type: String, default: null, trim: true },
              createdBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null,
              },
              createdByName: { type: String, default: null, trim: true },
              createdAt: { type: Date, default: Date.now },
            },
          ],
          default: undefined,
        },
        /**
         * Silent Intern → Tech Head activity copies (mentor never sees this channel).
         */
        internActivity: {
          type: [
            {
              activityId: { type: String, required: true, trim: true },
              type: {
                type: String,
                enum: ['status', 'keyword', 'report', 'work_log'],
                default: 'work_log',
              },
              summary: { type: String, required: true, trim: true },
              internId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true,
              },
              internName: { type: String, default: null, trim: true },
              mentorId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null,
              },
              mentorName: { type: String, default: null, trim: true },
              createdAt: { type: Date, default: Date.now },
            },
          ],
          default: undefined,
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

leadSchema.pre('validate', function syncPaymentPending() {
  const offered = Math.max(0, Number(this.paymentOffered) || 0);
  const received = Math.max(0, Number(this.paymentReceived) || 0);
  this.paymentOffered = offered;
  this.paymentReceived = received;
  this.paymentPending = Math.max(0, offered - received);
});

leadSchema.index({ agentId: 1, stage: 1 });
leadSchema.index({ closerId: 1, stage: 1 });
leadSchema.index({ status: 1, stage: 1, closerId: 1 });
leadSchema.index({ 'followUp.callbackAt': 1 });
leadSchema.index({ 'handover.assignedTechId': 1, 'handover.cstStatus': 1 });
leadSchema.index({ 'handover.assignedTechIds': 1, 'handover.cstStatus': 1 });
leadSchema.index({ status: 1, createdAt: 1 });
leadSchema.index(
  { 'handover.projectNumber': 1 },
  { unique: true, sparse: true }
);

export default mongoose.model('Lead', leadSchema);
