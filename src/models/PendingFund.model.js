import mongoose from "mongoose";
import { Channel } from "../utils/common/index.js";

const pendingFundSchema = new mongoose.Schema(
  {
    sourceOwnerType: { type: String, enum: ["User", "Partner"], required: true },
    sourceOwner: { type: mongoose.Schema.Types.ObjectId, refPath: "sourceOwnerType", required: true },
    sourceWallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
    channel: { type: String, enum: Object.values(Channel), required: true },
    phoneNumber: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    returnedAmount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    reason: {
      type: String,
      enum: ["customer_mistake", "provider_issue", "wrong_transfer", "technical_issue", "other"],
      required: true,
    },
    recoveryOwner: { type: String, enum: ["customer", "provider", "none"], required: true },
    expectedReturnAt: { type: Date },
    transactionReference: { type: String, trim: true, maxlength: 100 },
    notes: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["pending", "partially_returned", "returned", "written_off"], default: "pending" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    closedAt: { type: Date },
    movements: [{
      type: { type: String, enum: ["inflow", "outflow"], required: true },
      amount: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      notes: { type: String, trim: true, maxlength: 500 },
    }],
  },
  { timestamps: true }
);

pendingFundSchema.index({ status: 1, expectedReturnAt: 1 });
pendingFundSchema.index({ sourceOwnerType: 1, sourceOwner: 1, createdAt: -1 });

export default mongoose.model("PendingFund", pendingFundSchema);
