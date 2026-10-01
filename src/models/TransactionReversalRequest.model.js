import mongoose from "mongoose";

const transactionReversalRequestSchema = new mongoose.Schema(
  {
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 128 },
    originalTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
    reversalTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
    correctedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    targetStage: { type: String, trim: true },
    reason: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

transactionReversalRequestSchema.index({ idempotencyKey: 1 }, { unique: true });
transactionReversalRequestSchema.index({ originalTransaction: 1 }, { unique: true });

export default mongoose.model(
  "TransactionReversalRequest",
  transactionReversalRequestSchema
);
