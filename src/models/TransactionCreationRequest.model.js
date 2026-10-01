import mongoose from "mongoose";

const transactionCreationRequestSchema = new mongoose.Schema(
  {
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 128,
    },
    requestHash: { type: String, required: true, index: true },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// A key is globally unique so it cannot accidentally be reused for another operation.
transactionCreationRequestSchema.index({ idempotencyKey: 1 }, { unique: true });

export default mongoose.model(
  "TransactionCreationRequest",
  transactionCreationRequestSchema
);
