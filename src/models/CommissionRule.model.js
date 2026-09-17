import mongoose from "mongoose";
import { Channel, OperationStage } from "../utils/common/index.js";

const commissionRuleSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: Object.values(Channel), required: true },
    stage: { type: String, enum: Object.values(OperationStage), required: true },

    // flat: مبلغ ثابت على العملية
    // proportional: نسبة لكل 1000 جنيه، مع فلات تحت حد أدنى معين
    type: { type: String, enum: ["flat", "proportional"], required: true },

    // بالقرش — تستخدم لو type=flat، أو كقيمة تحت الحد الأدنى لو type=proportional
    flatAmount: { type: Number, default: 0 },

    // بالقرش لكل 1000 جنيه (100000 بالقرش) — تستخدم لو type=proportional
    proportionalRate: { type: Number, default: 0 },

    // الحد اللي فوقه بيتطبق النسبي بدل الفلات (بالقرش) — تستخدم لو type=proportional
    proportionalThreshold: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// قاعدة واحدة بس نشطة لكل (قناة + مرحلة)
commissionRuleSchema.index({ channel: 1, stage: 1 }, { unique: true });

export default mongoose.model("CommissionRule", commissionRuleSchema);