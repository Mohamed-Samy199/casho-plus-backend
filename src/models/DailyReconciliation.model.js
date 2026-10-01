import mongoose from "mongoose";

const dailyReconciliationSchema = new mongoose.Schema(
  {
    dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    transactionCount: { type: Number, default: 0, min: 0 },
    openingLiquidity: { type: Number, required: true, min: 0 },
    openingWalletBalance: { type: Number, required: true, min: 0 },
    transactionLiquidityEffect: { type: Number, required: true },
    transactionWalletEffect: { type: Number, required: true },
    adjustmentLiquidityEffect: { type: Number, required: true },
    adjustmentWalletEffect: { type: Number, required: true },
    transferCount: { type: Number, default: 0, min: 0 },
    expectedLiquidity: { type: Number, required: true, min: 0 },
    expectedWalletBalance: { type: Number, required: true, min: 0 },
    actualLiquidity: { type: Number, min: 0 },
    actualWalletBalance: { type: Number, min: 0 },
    liquidityVariance: { type: Number },
    walletVariance: { type: Number },
    notes: { type: String, trim: true, maxlength: 1000 },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

dailyReconciliationSchema.index({ dateKey: 1 }, { unique: true });

export default mongoose.model("DailyReconciliation", dailyReconciliationSchema);
