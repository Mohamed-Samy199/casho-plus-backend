import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { UserRole } from "../utils/common/index.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // أول رقم في المصفوفة هو الرقم الأساسي — بيتسجل بيه الدخول
    // وهو اللي بتتربط بيه العمليات الخاصة بالموظف. ممكن يكون للموظف
    // أكتر من رقم عادي (بيتضافوا بعدين من خلال endpoint منفصل).
    phoneNumbers: {
      type: [{ type: String, trim: true }],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "لازم يكون فيه رقم تلفون واحد على الأقل.",
      },
    },

    email: { type: String, trim: true, lowercase: true }, // اختياري

    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.EMPLOYEE,
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// أي رقم تلفون مينفعش يتكرر بين مستخدمين مختلفين (multikey unique index)
userSchema.index({ phoneNumbers: 1 }, { unique: true });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// بيرجع بيانات المستخدم من غير الحقول الحساسة (زي password)
userSchema.methods.toSafeObject = function () {
  return {
    _id: this._id,
    name: this.name,
    phoneNumbers: this.phoneNumbers,
    primaryPhone: this.phoneNumbers?.[0],
    email: this.email,
    role: this.role,
    isActive: this.isActive,
    lastLoginAt: this.lastLoginAt,
  };
};

export default mongoose.model("User", userSchema);