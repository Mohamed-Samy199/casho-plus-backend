import mongoose from "mongoose";
import { Channel, OperationStage, PartyType } from "../utils/common/index.js";

const transactionSchema = new mongoose.Schema(
  {
    // صاحب المحفظة التي تأثرت: شريك أو أدمن/مستخدم
    partner: { type: mongoose.Schema.Types.ObjectId, ref: "Partner" },
    ownerType: { type: String, enum: ["Partner", "User"], default: "Partner" },
    owner: { type: mongoose.Schema.Types.ObjectId, refPath: "ownerType" },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true },
    channel: { type: String, enum: Object.values(Channel), required: true },
    // الرقم/الشريحة المحددة اللي اتنفذت العملية من خلالها
    phoneNumber: { type: String, required: true, trim: true },

    // الطرف التاني في العملية (فرد / عميل رئيسي / عميل عابر بدون بيانات)
    partyType: { type: String, enum: Object.values(PartyType), required: true },
    partyId: { type: mongoose.Schema.Types.ObjectId, refPath: "partyType" },

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
    // قيمة العمولة لكل شريحة 1000 جنيه عن كل يوم، محفوظة وقت العملية.
    lateCommissionPerThousand: { type: Number, default: 0, min: 0 },
    lateCommission: { type: Number, default: 0, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0, min: 0 },
    payments: [
      {
        amount: { type: Number, required: true, min: 1 },
        lateCommission: { type: Number, default: 0, min: 0 },
        paidAt: { type: Date, default: Date.now },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],

    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

transactionSchema.index({ partyType: 1, partyId: 1, createdAt: -1 });
transactionSchema.index({ partner: 1, channel: 1, phoneNumber: 1, createdAt: -1 });

export default mongoose.model("Transaction", transactionSchema);
