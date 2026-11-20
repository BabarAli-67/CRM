/**
 * One-time: salesAmount → paymentOffered / paymentReceived / paymentPending
 * Run: node src/scripts/migrateLeadPaymentFields.js
 */
import path from 'path';
import { pathToFileURL } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.config.js';

const migrate = async () => {
  const leads = mongoose.connection.db.collection('leads');

  const withLegacy = await leads
    .find({
      $or: [
        { salesAmount: { $exists: true } },
        { paymentOffered: { $exists: false } },
        { paymentOffered: null },
      ],
    })
    .project({ _id: 1, salesAmount: 1, paymentOffered: 1, paymentReceived: 1 })
    .toArray();

  let updated = 0;
  for (const row of withLegacy) {
    const offered = Math.max(
      0,
      Number(
        row.paymentOffered != null && row.paymentOffered !== ''
          ? row.paymentOffered
          : row.salesAmount
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
    updated += 1;
  }

  // Any remaining salesAmount keys
  const unsetRest = await leads.updateMany(
    { salesAmount: { $exists: true } },
    { $unset: { salesAmount: 1 } }
  );

  console.log(
    JSON.stringify(
      {
        migrated: updated,
        unsetLeftoverSalesAmount: unsetRest.modifiedCount,
      },
      null,
      2
    )
  );
};

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  try {
    await connectDB();
    await migrate();
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

export default migrate;
