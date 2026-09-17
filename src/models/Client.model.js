import mongoose from "mongoose";
import { ClientType } from "../utils/common/index.js";

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // نفس فكرة الموظفين — ممكن يكون للعميل أكتر من رقم تلفون
    // (خصوصًا إنه بيتعامل بيه في عمليات فودافون كاش من أرقام مختلفة أحيانًا)
    phoneNumbers: {
      type: [{ type: String, trim: true }],
      validate: {
        validator: (arr) => !arr || arr.length === 0 || arr.length > 0,
        message: "بيانات رقم التلفون غير صحيحة.",
      },
    },

    type: {
      type: String,
      enum: Object.values(ClientType),
      required: true,
      default: ClientType.INDIVIDUAL,
    },
    // إعدادات خاصة بالعملاء الرئيسيين بس
    keyClientSettings: {
      defaultAgreedHours: { type: Number, default: 24 },
      defaultLateCommission: { type: Number, default: 500 }, // بالقرش = 5 جنيه
    },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    // العميل الرئيسي مالوش أكونت دخول — الأدمن هو اللي بيدير بياناته
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// نفس رقم التلفون مينفعش يتكرر بين عميلين مختلفين
clientSchema.index(
  { phoneNumbers: 1 },
  { unique: true, sparse: true } // sparse عشان رقم التلفون مش إجباري 100%
);

export default mongoose.model("Client", clientSchema);