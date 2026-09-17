import mongoose from "mongoose";
import { Channel } from "../utils/common/index.js";

const walletSchema = new mongoose.Schema(
  {
    partner: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", required: true },
    channel: { type: String, enum: Object.values(Channel), required: true },

    // رقم التلفون/الشريحة المرتبط بالرصيد ده تحديدًا — كل رقم ليه رصيده الخاص
    phoneNumber: { type: String, required: true, trim: true },

    liquidityBalance: { type: Number, default: 0 }, // بالقرش
    walletBalance: { type: Number, default: 0 }, // بالقرش
  },
  { timestamps: true }
);

// رصيد واحد بس لكل (شريك + قناة + رقم تلفون)
walletSchema.index({ partner: 1, channel: 1, phoneNumber: 1 }, { unique: true });

export default mongoose.model("Wallet", walletSchema);