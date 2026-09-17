// ── User Roles ──────────────────────────────────────────────
export const UserRole = Object.freeze({
  ADMIN: "admin",
  EMPLOYEE: "employee",
});

// ── Client Type ─────────────────────────────────────────────
export const ClientType = Object.freeze({
  INDIVIDUAL: "individual", // فرد
  KEY_CLIENT: "key_client", // عميل رئيسي
});

// ── Payment Channel (فودافون كاش بس دلوقتي، والباقي هيتضاف لاحقًا) ──
export const Channel = Object.freeze({
  VODAFONE_CASH: "vodafone_cash",
  // INSTAPAY: "instapay",       // لاحقًا
  // WALLET: "wallet",           // لاحقًا
});

// ── الأربع مراحل ────────────────────────────────────────────
export const OperationStage = Object.freeze({
  WITHDRAW_LIQUIDITY: "withdraw_liquidity", // سحب خارج سيولة
  DEPOSIT_LIQUIDITY: "deposit_liquidity", // إيداع داخل سيولة
  WITHDRAW_WALLET_BALANCE: "withdraw_wallet_balance", // سحب خارج رصيد محفظة
  DEPOSIT_WALLET_BALANCE: "deposit_wallet_balance", // إيداع داخل رصيد محفظة
});

// ── نوع الرصيد (بيتستخدم في تحديد أثر السداد على رأس المال) ───
export const BalanceType = Object.freeze({
  LIQUIDITY: "liquidity",
  WALLET_BALANCE: "wallet_balance",
});

// ── طرف العملية (Polymorphic reference) ──────────────────────
export const PartyType = Object.freeze({
  PARTNER: "Partner",
  CLIENT: "Client",
});

// ── الديون ───────────────────────────────────────────────────
export const DebtDirection = Object.freeze({
  OWED_BY_ME: "owed_by_me", // ديون عليا
  OWED_TO_ME: "owed_to_me", // ديون ليا
});

export const DebtStatus = Object.freeze({
  OPEN: "open",
  SETTLED: "settled",
});

// ── التنبيهات ───────────────────────────────────────────────
export const NotificationType = Object.freeze({
  SYSTEM: "system", // تنبيه عام من النظام
  PARTNER: "partner", // تنبيه مرتبط بشريك
  WALLET: "wallet", // تنبيه مرتبط بمحفظة
  DEBT: "debt", // تنبيه مرتبط بدين
});

export const NotificationSeverity = Object.freeze({
  INFO: "info", // معلومات
  WARNING: "warning", // تحذير
  ERROR: "error", // خطأ
});
