import mongoose from "mongoose";
import crypto from "crypto";
import { Channel, OperationStage, PartyType } from "../utils/common/index.js";

function createReferenceNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CP-${date}-${suffix}`;
}

const transactionSchema = new mongoose.Schema(
  {
    referenceNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      default: createReferenceNumber,
    },
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

    // Reversals are new transactions; these fields keep the audit trail on the original.
    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    correctionOf: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    reversedAt: { type: Date },
    reversalTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    correctedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    correctionStage: { type: String, enum: Object.values(OperationStage) },
    reversalReason: { type: String, trim: true, maxlength: 500 },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// حماية إضافية: حتى لو أُنشئت العملية من مسار آخر غير service، لا نسمح
// بحفظ عملية جديدة بدون رقم مرجعي قابل للعرض والبحث.
transactionSchema.pre("validate", function ensureReferenceNumber() {
  if (!this.referenceNumber) this.referenceNumber = createReferenceNumber();
});

transactionSchema.index({ partyType: 1, partyId: 1, createdAt: -1 });
transactionSchema.index({ partner: 1, channel: 1, phoneNumber: 1, createdAt: -1 });
transactionSchema.index({ reversalOf: 1 }, { unique: true, sparse: true });

export default mongoose.model("Transaction", transactionSchema);
