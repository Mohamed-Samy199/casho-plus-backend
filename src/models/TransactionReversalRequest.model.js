import mongoose from "mongoose";

const transactionReversalRequestSchema = new mongoose.Schema(
  {
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 128 },
    operation: { type: String, enum: ["reverse", "update"], default: "reverse" },
    originalTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
    reversalTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },
    correctedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    targetStage: { type: String, trim: true },
    correction: { type: mongoose.Schema.Types.Mixed },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    updatedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    history: { type: [mongoose.Schema.Types.Mixed], default: [] },
    reason: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

transactionReversalRequestSchema.index({ idempotencyKey: 1 }, { unique: true });
transactionReversalRequestSchema.index({ originalTransaction: 1, operation: 1 });

export default mongoose.model(
  "TransactionReversalRequest",
  transactionReversalRequestSchema
);
