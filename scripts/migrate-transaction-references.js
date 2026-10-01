import mongoose from "mongoose";
import crypto from "crypto";
import { MONGODB_URI } from "../src/config/env.config.js";
import Transaction from "../src/models/Transaction.model.js";

function createReferenceNumber(createdAt) {
  const date = new Date(createdAt || Date.now()).toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CP-${date}-${suffix}`;
}

async function migrate() {
  await mongoose.connect(MONGODB_URI);

  const missingReferenceFilter = {
    $or: [
      { referenceNumber: { $exists: false } },
      { referenceNumber: null },
      { referenceNumber: "" },
    ],
  };
  const total = await Transaction.collection.countDocuments(missingReferenceFilter);
  console.log(`Transactions missing references: ${total}`);

  let updated = 0;
  const cursor = Transaction.collection.find(missingReferenceFilter, { projection: { _id: 1, createdAt: 1 } });
  for await (const transaction of cursor) {
    let referenceNumber;
    let result;
    do {
      referenceNumber = createReferenceNumber(transaction.createdAt);
      result = await Transaction.collection.updateOne(
        { _id: transaction._id, ...missingReferenceFilter },
        { $set: { referenceNumber } },
        { bypassDocumentValidation: false }
      );
    } while (result.matchedCount === 0);
    updated += result.modifiedCount === 1 ? 1 : 0;
    if (updated % 100 === 0 || updated === total) {
      console.log(`Backfilled ${updated}/${total}`);
    }
  }

  // Build/verify the unique index only after all legacy documents have a value.
  await Transaction.syncIndexes();
  const remaining = await Transaction.collection.countDocuments(missingReferenceFilter);
  if (remaining !== 0) {
    throw new Error(`Migration verification failed: ${remaining} transactions still have no reference.`);
  }
  console.log(`Done. Updated: ${updated}. Remaining without references: ${remaining}`);
}

migrate()
  .catch((error) => {
    console.error("Transaction reference migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
