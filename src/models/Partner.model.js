import mongoose from "mongoose";

const partnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // نفس فكرة الموظفين والعملاء — ممكن يكون للشريك أكتر من رقم تلفون
    // (أكتر من شريحة فودافون كاش أو أكتر من حساب)
    phoneNumbers: {
      type: [{ type: String, trim: true }],
    },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// نفس رقم التلفون مينفعش يتكرر بين شريكين مختلفين
partnerSchema.index({ phoneNumbers: 1 }, { unique: true, sparse: true });

export default mongoose.model("Partner", partnerSchema);