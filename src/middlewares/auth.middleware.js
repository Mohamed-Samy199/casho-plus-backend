import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import User from "../models/User.model.js";

/**
 * protect — بيتأكد من الـ JWT وبيربط المستخدم بـ req.user.
 * لازم يتحط قبل أي route محتاج تسجيل دخول.
 */
export const protect = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw ApiError.unauthorized("غير مصرح لك بالدخول.");
  }

  const token = authHeader.split(" ")[1];
  if (!token) throw ApiError.unauthorized("غير مصرح لك بالدخول.");

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw ApiError.unauthorized("انتهت صلاحية الجلسة، برجاء تسجيل الدخول مرة أخرى.");
    }
    throw ApiError.unauthorized("جلسة غير صالحة.");
  }

  const user = await User.findById(decoded.id).select("+role");
  if (!user || !user.isActive) {
    throw ApiError.unauthorized("الحساب غير موجود أو غير مفعّل.");
  }

  req.user = user;
  next();
});

/**
 * restrictTo — تقييد الوصول حسب الدور.
 * الاستخدام: router.delete("/x", protect, restrictTo("admin"), ...)
 */
export const restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw ApiError.forbidden("ليس لديك صلاحية للقيام بهذا الإجراء.");
  }
  next();
};