import mongoose from "mongoose";

const transactionSettlementRequestSchema = new mongoose.Schema(
  {
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 128,
    },
    amount: { type: Number, required: true, min: 1 },
    commission: { type: Number, default: 0, min: 0 },
    paymentMethod: { type: String, enum: ["liquidity", "vodafone_cash", "instapay"], required: true },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet" },
    ownerType: { type: String, enum: ["Partner", "User"] },
    owner: { type: mongoose.Schema.Types.ObjectId, refPath: "ownerType" },
    phoneNumber: { type: String, trim: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    lateCommission: { type: Number, required: true, min: 0 },
    daysLate: { type: Number, required: true, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// A key can be used only once for one transaction, even under concurrent requests.
transactionSettlementRequestSchema.index(
  { transaction: 1, idempotencyKey: 1 },
  { unique: true }
);

export default mongoose.model(
  "TransactionSettlementRequest",
  transactionSettlementRequestSchema
);
