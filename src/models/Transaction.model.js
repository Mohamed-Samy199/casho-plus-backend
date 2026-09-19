import mongoose from "mongoose";
import { Channel, OperationStage, PartyType } from "../utils/common/index.js";

const transactionSchema = new mongoose.Schema(
  {
    // الشريك اللي محفظته/سيولته اتأثرت
    partner: { type: mongoose.Schema.Types.ObjectId, ref: "Partner" },
    accountType: { type: String, enum: ["Partner", "User"], default: "Partner" },
    account: { type: mongoose.Schema.Types.ObjectId, refPath: "accountType" },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
    channel: { type: String, enum: Object.values(Channel), required: true },
    // الرقم/الشريحة المحددة اللي اتنفذت العملية من خلالها
    phoneNumber: { type: String, required: true, trim: true },

    // الطرف التاني في العملية (فرد / عميل رئيسي)
    partyType: { type: String, enum: Object.values(PartyType), required: true },
    partyId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "partyType" },

    stage: { type: String, enum: Object.values(OperationStage), required: true },

    amount: { type: Number, required: true, min: 1 },
    commission: { type: Number, default: 0, min: 0 },

    walletEffect: { type: Number, required: true },
    liquidityEffect: { type: Number, required: true },

    // Snapshot بعد العملية
    walletBalanceAfter: { type: Number, required: true },
    liquidityBalanceAfter: { type: Number, required: true },

    // تأخير العملاء الرئيسيين
    agreedDueAt: { type: Date },
    settledAt: { type: Date },
    lateCommission: { type: Number, default: 0 },

    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

transactionSchema.index({ partyType: 1, partyId: 1, createdAt: -1 });
transactionSchema.index({ partner: 1, channel: 1, phoneNumber: 1, createdAt: -1 });
transactionSchema.index({ accountType: 1, account: 1, createdAt: -1 });

export default mongoose.model("Transaction", transactionSchema);