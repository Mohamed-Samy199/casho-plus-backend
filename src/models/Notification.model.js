import mongoose from "mongoose";
import { NotificationType, NotificationSeverity } from "../utils/common/index.js";

const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.values(NotificationType), required: true },
    severity: {
      type: String,
      enum: Object.values(NotificationSeverity),
      default: NotificationSeverity.WARNING,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    // ربط اختياري بالكيان اللي سبب التنبيه (شريك، محفظة، دين...)
    relatedEntityType: { type: String, trim: true },
    relatedEntityId: { type: mongoose.Schema.Types.ObjectId },

    isRead: { type: Boolean, default: false },
    readBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    readAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ isRead: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);