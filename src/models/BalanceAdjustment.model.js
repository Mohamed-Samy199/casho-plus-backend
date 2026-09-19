import mongoose from "mongoose";
import { Channel } from "../utils/common/index.js";

const balanceAdjustmentSchema = new mongoose.Schema(
  {
    partner: { type: mongoose.Schema.Types.ObjectId, ref: "Partner" },
    ownerType: { type: String, enum: ["Partner", "User"], default: "Partner" },
    owner: { type: mongoose.Schema.Types.ObjectId, refPath: "ownerType" },
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },
    channel: {
      type: String,
      enum: Object.values(Channel),
      required: true,
    },
    phoneNumber: { type: String, required: true, trim: true },
    mode: {
      type: String,
      enum: ["opening", "add"],
      required: true,
    },
    liquidityBefore: { type: Number, required: true, min: 0 },
    walletBefore: { type: Number, required: true, min: 0 },
    liquidityAmount: { type: Number, required: true, min: 0 },
    walletAmount: { type: Number, required: true, min: 0 },
    liquidityAfter: { type: Number, required: true, min: 0 },
    walletAfter: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, maxlength: 500 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

balanceAdjustmentSchema.index({ partner: 1, phoneNumber: 1, createdAt: -1 });
balanceAdjustmentSchema.index({ ownerType: 1, owner: 1, createdAt: -1 });

export default mongoose.model("BalanceAdjustment", balanceAdjustmentSchema);