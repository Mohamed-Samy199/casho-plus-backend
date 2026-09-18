import mongoose from "mongoose";
import { PartyType, DebtDirection, DebtStatus } from "../utils/common/index.js";

const debtSchema = new mongoose.Schema(
  {
    // الطرف المرتبط بالدين (فرد / عميل رئيسي / شريك)
    partyType: { type: String, enum: Object.values(PartyType), required: true },
    partyId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "partyType" },

    // ديون عليا (owed_by_me) أو ديون ليا (owed_to_me)
    direction: { type: String, enum: Object.values(DebtDirection), required: true },

    amount: { type: Number, required: true, min: 1 }, // بالقرش — القيمة الأصلية للدين
    remainingAmount: { type: Number, required: true }, // بيقل مع كل تسديد جزئي

    status: { type: String, enum: Object.values(DebtStatus), default: DebtStatus.OPEN },

    description: { type: String, trim: true },
    dueDate: { type: Date },
    settledAt: { type: Date },

    // إيصالات/مستندات إثبات مرفقة بالدين (اختياري)
    receiptUrls: { type: [String], default: [] },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

debtSchema.pre("validate", function (next) {
  if (this.isNew && this.remainingAmount === undefined) {
    this.remainingAmount = this.amount;
  }
  next();
});

debtSchema.index({ partyType: 1, partyId: 1, status: 1 });
debtSchema.index({ direction: 1, status: 1 });

export default mongoose.model("Debt", debtSchema);