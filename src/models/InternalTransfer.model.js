import mongoose from "mongoose";

const ownerType = { type: String, enum: ["Partner", "User"], required: true };
const internalTransferSchema = new mongoose.Schema(
  {
    sourceOwnerType: ownerType,
    sourceOwner: { type: mongoose.Schema.Types.ObjectId, refPath: "sourceOwnerType", required: true },
    sourceWallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
    sourcePhoneNumber: { type: String, required: true },
    targetOwnerType: { ...ownerType },
    targetOwner: { type: mongoose.Schema.Types.ObjectId, refPath: "targetOwnerType", required: true },
    targetWallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
    targetPhoneNumber: { type: String, required: true },
    asset: { type: String, enum: ["liquidity", "wallet"], required: true },
    amount: { type: Number, required: true, min: 1 },
    sourceBalanceBefore: { type: Number, required: true },
    sourceBalanceAfter: { type: Number, required: true },
    targetBalanceBefore: { type: Number, required: true },
    targetBalanceAfter: { type: Number, required: true },
    notes: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

internalTransferSchema.index({ createdAt: -1 });
internalTransferSchema.index({ sourceOwnerType: 1, sourceOwner: 1, createdAt: -1 });
internalTransferSchema.index({ targetOwnerType: 1, targetOwner: 1, createdAt: -1 });

export default mongoose.model("InternalTransfer", internalTransferSchema);
