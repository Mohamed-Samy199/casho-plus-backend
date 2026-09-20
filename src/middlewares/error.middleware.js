import { ApiError } from "../utils/ApiError.js";

/**
 * Global error handler — لازم يتسجل آخر حاجة في app.bootstrap.js.
 * بيمسك أي error متبعت عن طريق next(err).
 */
const errorMiddleware = (err, req, res, next) => {
  let error = err;

  // MongoDB transactions تحتاج Replica Set أو MongoDB Atlas.
  if (
    err?.message?.includes("Transaction numbers are only allowed") ||
    err?.message?.includes("replica set member")
  ) {
    error = ApiError.internal(
      "تعذر تنفيذ العملية لأن اتصال قاعدة البيانات لا يدعم المعاملات الآمنة. استخدم MongoDB Atlas أو فعّل Replica Set ثم أعد المحاولة."
    );
  }

  // ── أخطاء Mongoose المعروفة ────────────────────────────

  // duplicate key (مثلاً رقم تلفون مسجّل قبل كده)
  if (err.code === 11000) {
    const duplicateFields = err.keyValue || err.keyPattern || {};
    const field = Object.keys(duplicateFields)[0] || "البيانات";
    error = ApiError.conflict(`القيمة الخاصة بـ ${field} مستخدمة بالفعل.`);
  }

  // ObjectId غير صحيح
  if (err.name === "CastError") {
    error = ApiError.badRequest(`قيمة غير صحيحة للحقل: ${err.path}`);
  }

  // أخطاء الـ validation على مستوى الـ schema
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = ApiError.badRequest("فشل التحقق من البيانات", errors);
  }

  // ── أي خطأ غير متوقع ────────────────────────────────────

  const statusCode = error.statusCode || 500;
  const message = error.isOperational
    ? error.message
    : "حدث خطأ ما. حاول مرة أخرى.";

  if (statusCode === 500) {
    console.error("[ SERVER ERROR ]", err);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    errors: error.errors || [],
    ...(process.env.NODE_ENV === process.env.DEVELOPMENT && { stack: err.stack }),
  });
};

export default errorMiddleware;
