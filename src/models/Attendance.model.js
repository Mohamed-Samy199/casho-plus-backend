import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // بداية اليوم (00:00:00) — بيضمن سجل واحد بس لكل يوم لكل مستخدم
    date: { type: Date, required: true },

    checkInAt: { type: Date },
    checkOutAt: { type: Date },

    // لو الأدمن هو اللي سجّل/عدّل (لموظف نسي يسجل)، بنسجل مين عمل كده
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// سجل واحد بس لكل (مستخدم + يوم)
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema);