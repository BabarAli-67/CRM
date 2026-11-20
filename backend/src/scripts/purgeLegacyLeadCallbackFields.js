/**
 * One-time Mongo cleanup: rename locked Lead fields, fill required blanks,
 * and $unset legacy Callback/Lead keys so documents match the locked schemas.
 *
 * Run: npm run purge:legacy-fields
 */
import path from 'path';
import { pathToFileURL } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.config.js';

const LEAD_UNSET = {
  phone: 1,
  workEmail: 1,
  servicesArea: 1,
  serviceOffered: 1,
  lastAgentActivityAt: 1,
  // Extra vibe leftovers that may exist on older docs
  email: 1,
  companyName: 1,
  company: 1,
  contactName: 1,
  contactPhone: 1,
  mobile: 1,
  landline: 1,
  website: 1,
  url: 1,
  serviceArea: 1,
  services: 1,
  amount: 1,
  dealValue: 1,
};

const CALLBACK_UNSET = {
  phone: 1,
  email: 1,
  website: 1,
  websiteLink: 1,
  url: 1,
  contactPhone: 1,
  mobile: 1,
  landline: 1,
  companyName: 1,
  scheduledAt: 1,
  dueAt: 1,
  reminderSent: 1,
  fiveMinFired: 1,
  exactTimeFired: 1,
  isAttended: 1,
  attended: 1,
  completed: 1,
  transferred: 1,
  ownerId: 1,
  userId: 1,
  salesAgentId: 1,
};

const purge = async () => {
  const db = mongoose.connection.db;
  const leads = db.collection('leads');
  const callbacks = db.collection('callbacks');

  console.log('── Leads: rename legacy → locked field names ──');
  const renameWorkEmail = await leads.updateMany(
    { workEmail: { $exists: true }, businessEmail: { $exists: false } },
    [{ $set: { businessEmail: '$workEmail' } }]
  );
  const renameServiceAreas = await leads.updateMany(
    { servicesArea: { $exists: true }, serviceAreas: { $exists: false } },
    [{ $set: { serviceAreas: '$servicesArea' } }]
  );
  const renameServicesOffered = await leads.updateMany(
    { serviceOffered: { $exists: true }, servicesOffered: { $exists: false } },
    [{ $set: { servicesOffered: '$serviceOffered' } }]
  );
  console.log(
    `  renamed workEmail→businessEmail: ${renameWorkEmail.modifiedCount}`
  );
  console.log(
    `  renamed servicesArea→serviceAreas: ${renameServiceAreas.modifiedCount}`
  );
  console.log(
    `  renamed serviceOffered→servicesOffered: ${renameServicesOffered.modifiedCount}`
  );

  // Legacy alias → locked handoff timestamp
  const renameHanded = await leads.updateMany(
    {
      handedToCloserAt: { $exists: true },
      $or: [
        { handedOverAt: { $exists: false } },
        { handedOverAt: null },
      ],
    },
    [{ $set: { handedOverAt: '$handedToCloserAt' } }]
  );
  const unsetHandedAlias = await leads.updateMany(
    { handedToCloserAt: { $exists: true } },
    { $unset: { handedToCloserAt: 1 } }
  );
  console.log(
    `  renamed handedToCloserAt→handedOverAt: ${renameHanded.modifiedCount}`
  );
  console.log(
    `  unset leftover handedToCloserAt: ${unsetHandedAlias.modifiedCount}`
  );

  // Copy legacy phone into personal/business when those are empty
  const phoneMigrate = await leads.updateMany(
    {
      phone: { $exists: true, $nin: [null, ''] },
      $and: [
        {
          $or: [
            { personalPhone: { $exists: false } },
            { personalPhone: null },
            { personalPhone: '' },
          ],
        },
        {
          $or: [
            { businessPhone: { $exists: false } },
            { businessPhone: null },
            { businessPhone: '' },
          ],
        },
      ],
    },
    [{ $set: { businessPhone: '$phone' } }]
  );
  console.log(`  backfilled businessPhone from phone: ${phoneMigrate.modifiedCount}`);

  // Required blanks → safe defaults so schema validates
  const fillWebsite = await leads.updateMany(
    {
      $or: [
        { websiteLink: { $exists: false } },
        { websiteLink: null },
        { websiteLink: '' },
      ],
    },
    { $set: { websiteLink: 'https://' } }
  );
  const fillServices = await leads.updateMany(
    {
      $or: [
        { servicesOffered: { $exists: false } },
        { servicesOffered: null },
        { servicesOffered: '' },
      ],
    },
    { $set: { servicesOffered: 'TBD' } }
  );
  // Prefer locked payment triplet over legacy salesAmount
  const paymentBackfill = await leads
    .find({
      $or: [
        { salesAmount: { $exists: true } },
        { paymentOffered: { $exists: false } },
        { paymentOffered: null },
      ],
    })
    .project({ _id: 1, salesAmount: 1, paymentOffered: 1, paymentReceived: 1 })
    .toArray();
  let paymentFilled = 0;
  for (const row of paymentBackfill) {
    const offered = Math.max(
      0,
      Number(
        row.paymentOffered != null ? row.paymentOffered : row.salesAmount
      ) || 0
    );
    const received = Math.max(0, Number(row.paymentReceived) || 0);
    await leads.updateOne(
      { _id: row._id },
      {
        $set: {
          paymentOffered: offered,
          paymentReceived: received,
          paymentPending: Math.max(0, offered - received),
        },
        $unset: { salesAmount: 1 },
      }
    );
    paymentFilled += 1;
  }
  console.log(`  filled websiteLink: ${fillWebsite.modifiedCount}`);
  console.log(`  filled servicesOffered: ${fillServices.modifiedCount}`);
  console.log(`  backfilled payment triplet: ${paymentFilled}`);

  const unsetLeads = await leads.updateMany(
    {},
    { $unset: { ...LEAD_UNSET, salesAmount: 1 } }
  );
  console.log(`  $unset legacy lead keys: ${unsetLeads.modifiedCount}`);

  console.log('── Callbacks: backfill required + $unset legacy ──');

  // businessLink from linked lead website when missing
  const missingLink = await callbacks
    .find({
      $or: [
        { businessLink: { $exists: false } },
        { businessLink: null },
        { businessLink: '' },
      ],
    })
    .project({ _id: 1, leadId: 1 })
    .toArray();

  let linkFilled = 0;
  for (const row of missingLink) {
    let link = 'https://';
    if (row.leadId) {
      const lead = await leads.findOne(
        { _id: row.leadId },
        { projection: { websiteLink: 1 } }
      );
      if (lead?.websiteLink) link = lead.websiteLink;
    }
    await callbacks.updateOne(
      { _id: row._id },
      { $set: { businessLink: link } }
    );
    linkFilled += 1;
  }
  console.log(`  filled businessLink: ${linkFilled}`);

  // Agent rows without assignedCloserId → closerId, else lead.closerId, else first approved closer
  const missingAssigned = await callbacks
    .find({
      agentId: { $ne: null, $exists: true },
      $or: [
        { assignedCloserId: { $exists: false } },
        { assignedCloserId: null },
      ],
    })
    .project({ _id: 1, leadId: 1, closerId: 1 })
    .toArray();
  const fallbackCloser = await db.collection('users').findOne(
    { role: 'closer', status: 'approved' },
    { projection: { _id: 1 } }
  );
  let assignFilled = 0;
  for (const row of missingAssigned) {
    let aid = row.closerId || null;
    if (!aid && row.leadId) {
      const lead = await leads.findOne(
        { _id: row.leadId },
        { projection: { closerId: 1 } }
      );
      aid = lead?.closerId || null;
    }
    if (!aid && fallbackCloser) aid = fallbackCloser._id;
    if (!aid) continue;
    await callbacks.updateOne(
      { _id: row._id },
      { $set: { assignedCloserId: aid } }
    );
    assignFilled += 1;
  }
  console.log(`  backfilled assignedCloserId: ${assignFilled}`);

  // Leads missing closerId → first approved closer (schema requires it)
  if (fallbackCloser) {
    const orphanLeads = await leads.updateMany(
      {
        $or: [{ closerId: { $exists: false } }, { closerId: null }],
      },
      { $set: { closerId: fallbackCloser._id } }
    );
    console.log(
      `  backfilled lead.closerId (fallback closer): ${orphanLeads.modifiedCount}`
    );
  }

  // Legacy phone → personal/business
  const cbPhone = await callbacks.updateMany(
    {
      phone: { $exists: true, $nin: [null, ''] },
      $and: [
        {
          $or: [
            { personalPhone: { $exists: false } },
            { personalPhone: null },
            { personalPhone: '' },
          ],
        },
        {
          $or: [
            { businessPhone: { $exists: false } },
            { businessPhone: null },
            { businessPhone: '' },
          ],
        },
      ],
    },
    [{ $set: { businessPhone: '$phone' } }]
  );
  console.log(`  backfilled businessPhone from phone: ${cbPhone.modifiedCount}`);

  const unsetCbs = await callbacks.updateMany({}, { $unset: CALLBACK_UNSET });
  console.log(`  $unset legacy callback keys: ${unsetCbs.modifiedCount}`);

  console.log('── Done ──');
};

export default purge;

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  try {
    await connectDB();
    await purge();
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
