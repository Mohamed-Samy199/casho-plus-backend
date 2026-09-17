import mongoose from "mongoose";
import { BalanceType } from "../utils/common/index.js";

const debtPaymentSchema = new mongoose.Schema(
  {
    debt: { type: mongoose.Schema.Types.ObjectId, ref: "Debt", required: true },
    amount: { type: Number, required: true, min: 1 }, // بالقرش
    remainingAfter: { type: Number, required: true },
    notes: { type: String, trim: true },

    // ── أثر السداد على رأس المال (اختياري) ──────────────────
    // لو affectsCapital=false، السداد بيتسجل كـ "حصل" فقط من غير ما يأثر
    // على أي رصيد فعلي (مثلاً فلوس شخصية بره النظام)
    affectsCapital: { type: Boolean, default: false },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet" },
    balanceType: { type: String, enum: Object.values(BalanceType) },
    balanceAfter: { type: Number }, // Snapshot لو أثر فعلي حصل

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

debtPaymentSchema.index({ debt: 1, createdAt: -1 });

export default mongoose.model("DebtPayment", debtPaymentSchema);