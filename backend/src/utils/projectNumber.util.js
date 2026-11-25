import Counter from '../models/counter.model.js';
import Lead from '../models/lead.model.js';

const COUNTER_ID = 'techProjectNumber';

const TECH_PIPELINE_STATUSES = [
  'onboarded',
  'assigned',
  'in_progress',
  'ongoing_seo',
  'completed',
];

/** Atomically allocate the next Tech project number (#1, #2, …). */
export const allocateTechProjectNumber = async () => {
  const doc = await Counter.findByIdAndUpdate(
    COUNTER_ID,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return Number(doc.seq) || 1;
};

/**
 * Ensure a lead in the Tech pipeline has a permanent projectNumber.
 * Safe to call repeatedly — never renumbers an existing value.
 */
export const ensureLeadProjectNumber = async (lead) => {
  if (!lead) return null;
  if (!lead.handover) lead.handover = {};
  if (
    typeof lead.handover.projectNumber === 'number' &&
    lead.handover.projectNumber > 0
  ) {
    return lead.handover.projectNumber;
  }
  const next = await allocateTechProjectNumber();
  lead.handover.projectNumber = next;
  await lead.save();
  return next;
};

/**
 * Backfill sequential project numbers for existing Tech clients (oldest first).
 * Syncs the counter to the highest assigned number first.
 */
export const backfillTechProjectNumbers = async () => {
  const maxDoc = await Lead.findOne({
    'handover.projectNumber': { $type: 'number', $gt: 0 },
  })
    .sort({ 'handover.projectNumber': -1 })
    .select('handover.projectNumber')
    .lean();

  const currentMax = Number(maxDoc?.handover?.projectNumber) || 0;
  const existing = await Counter.findById(COUNTER_ID).lean();
  const counterSeq = Number(existing?.seq) || 0;

  if (!existing) {
    try {
      await Counter.create({ _id: COUNTER_ID, seq: currentMax });
    } catch {
      if (currentMax > 0) {
        await Counter.findByIdAndUpdate(COUNTER_ID, {
          $max: { seq: currentMax },
        });
      }
    }
  } else if (currentMax > counterSeq) {
    await Counter.findByIdAndUpdate(COUNTER_ID, {
      $max: { seq: currentMax },
    });
  }

  const missing = await Lead.find({
    stage: 'closed_sale',
    'handover.cstStatus': { $in: TECH_PIPELINE_STATUSES },
    $or: [
      { 'handover.projectNumber': { $exists: false } },
      { 'handover.projectNumber': null },
      { 'handover.projectNumber': { $lte: 0 } },
    ],
  })
    .sort({ 'handover.onboardedAt': 1, createdAt: 1 })
    .select('_id handover');

  let assigned = 0;
  for (const lead of missing) {
    await ensureLeadProjectNumber(lead);
    assigned += 1;
  }

  if (assigned > 0) {
    console.log(
      `Tech project numbers: backfilled ${assigned} client(s) (prior max #${currentMax}).`
    );
  }

  return { backfilled: assigned, priorMax: currentMax };
};
