import rateLimit from "express-rate-limit";

// ── General API ───────────────────────────────────────────────
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: "طلبات كتيرة جدًا، حاول بعد شوية." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Auth endpoints ────────────────────────────────────────────
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "محاولات دخول كتيرة جدًا، حاول بعد شوية." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Upload (جاهز للمرحلة الجاية لما نفعّل رفع صور الإيصالات) ────
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: "محاولات رفع ملفات كتيرة جدًا." },
  standardHeaders: true,
  legacyHeaders: false,
});