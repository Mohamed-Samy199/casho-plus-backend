import rateLimit from "express-rate-limit";

// هذا النظام يعمل محليًا داخل المكتب، لذلك لا نريد إيقاف الموظفين أثناء التشغيل المحلي.
// تظل الحماية مفعلة تلقائيًا عند تشغيل NODE_ENV=production.
const isProduction = process.env.NODE_ENV === "production";
const noLimit = (_req, _res, next) => next();

// ── General API ───────────────────────────────────────────────
export const generalLimiter = isProduction ? rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: "طلبات كتيرة جدًا، حاول بعد شوية." },
  standardHeaders: true,
  legacyHeaders: false,
}) : noLimit;

// ── Auth endpoints ────────────────────────────────────────────
export const authLimiter = isProduction ? rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "محاولات دخول كتيرة جدًا، حاول بعد شوية." },
  standardHeaders: true,
  legacyHeaders: false,
}) : noLimit;

// ── Upload (جاهز للمرحلة الجاية لما نفعّل رفع صور الإيصالات) ────
export const uploadLimiter = isProduction ? rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: "محاولات رفع ملفات كتيرة جدًا." },
  standardHeaders: true,
  legacyHeaders: false,
}) : noLimit;
