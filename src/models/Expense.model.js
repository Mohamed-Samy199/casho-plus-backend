import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["asset", "outflow", "advance"],
      required: true,
    },
    description: { type: String, trim: true, maxlength: 500, required: true },
    assetName: { type: String, trim: true, maxlength: 200 },
    sourceOwnerType: { type: String, enum: ["User", "Partner"], required: true },
    sourceOwner: { type: mongoose.Schema.Types.ObjectId, refPath: "sourceOwnerType", required: true },
    sourceWallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
    sourcePhoneNumber: { type: String, required: true, trim: true },
    balanceType: { type: String, enum: ["liquidity", "wallet"], required: true },
    amount: { type: Number, required: true, min: 1 },
    returnedAmount: { type: Number, default: 0, min: 0 },
    soldAmount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    borrowerType: { type: String, enum: ["User", "Partner"] },
    borrower: { type: mongoose.Schema.Types.ObjectId, refPath: "borrowerType" },
    borrowerName: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "sold", "partially_repaid", "repaid"],
      default: "active",
    },
    soldAt: { type: Date },
    repaidAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    movements: [{
      type: { type: String, enum: ["outflow", "inflow"], required: true },
      amount: { type: Number, required: true, min: 1 },
      createdAt: { type: Date, default: Date.now },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      notes: { type: String, trim: true, maxlength: 500 },
    }],
  },
  { timestamps: true }
);

expenseSchema.index({ category: 1, status: 1, createdAt: -1 });
expenseSchema.index({ sourceOwnerType: 1, sourceOwner: 1, createdAt: -1 });

export default mongoose.model("Expense", expenseSchema);
