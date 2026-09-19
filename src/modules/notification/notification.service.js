import Notification from "../../models/Notification.model.js";
import Debt from "../../models/Debt.model.js";
import Transaction from "../../models/Transaction.model.js";
import Partner from "../../models/Partner.model.js";
import {
  NotificationType,
  NotificationSeverity,
  DebtStatus,
} from "../../utils/common/index.js";
import { LOW_BALANCE_THRESHOLD } from "../../config/env.config.js";

// افتراضي 1000 جنيه (بالقرش) لو مفيش قيمة في الـ .env
const THRESHOLD = Number(LOW_BALANCE_THRESHOLD) || 100000;

/**
 * بتتنفذ جوه نفس الـ MongoDB session بتاعة createTransaction —
 * لو الرصيد بعد العملية تحت الحد الأدنى، بتسجل تنبيه.
 */
export async function checkLowBalanceAndNotify(
  {
    partnerId,
    accountName,
    wallet,
    channel,
    phoneNumber,
    newLiquidityBalance,
    newWalletBalance,
  },
  session
) {
  const alerts = [];
  const partner = partnerId
    ? await Partner.findById(partnerId).select("name").session(session).lean()
    : null;
  const accountLabel = accountName || partner?.name;
  const partnerLabel = accountLabel ? `${accountLabel} - ${phoneNumber}` : phoneNumber;

  if (newLiquidityBalance < THRESHOLD) {
    alerts.push({
      type: NotificationType.LOW_LIQUIDITY,
      severity: NotificationSeverity.WARNING,
      title: "رصيد سيولة منخفض",
      message: `سيولة ${partnerLabel} وصلت لـ ${(newLiquidityBalance / 100).toLocaleString(
        "ar-EG"
      )} جنيه.`,
      relatedEntityType: "Wallet",
      relatedEntityId: wallet,
    });
  }

  if (newWalletBalance < THRESHOLD) {
    alerts.push({
      type: NotificationType.LOW_WALLET_BALANCE,
      severity: NotificationSeverity.WARNING,
      title: "رصيد محفظة منخفض",
      message: `رصيد محفظة ${partnerLabel} وصل لـ ${(newWalletBalance / 100).toLocaleString(
        "ar-EG"
      )} جنيه.`,
      relatedEntityType: "Wallet",
      relatedEntityId: wallet,
    });
  }

  if (alerts.length) {
    await Notification.create(alerts, { session });
  }
}

/**
 * تنبيهات ديون متجاوزة الموعد المحدد — محسوبة حيًا، مش متخزنة
 */
async function getOverdueDebtAlerts() {
  const overdueDebts = await Debt.find({
    status: DebtStatus.OPEN,
    dueDate: { $lt: new Date() },
  })
    .sort({ dueDate: -1 })
    .limit(20)
    .lean();

  return overdueDebts.map((debt) => ({
    _id: `debt-${debt._id}`,
    type: "debt_overdue",
    severity: NotificationSeverity.WARNING,
    title: "دين تجاوز الموعد المحدد",
    message: `دين بقيمة ${(debt.remainingAmount / 100).toLocaleString("ar-EG")} جنيه تجاوز موعد السداد.`,
    createdAt: debt.dueDate,
    isLive: true,
  }));
}

/**
 * تنبيهات عمليات عملاء رئيسيين اتأخرت عن الميعاد المتفق عليه ولسه مش متسواة —
 * محسوبة حيًا، مش متخزنة
 */
async function getLateKeyClientAlerts() {
  const lateTransactions = await Transaction.find({
    agreedDueAt: { $lt: new Date() },
    settledAt: null,
  })
    .sort({ agreedDueAt: -1 })
    .limit(20)
    .lean();

  return lateTransactions.map((t) => ({
    _id: `late-tx-${t._id}`,
    type: "late_key_client_transaction",
    severity: NotificationSeverity.WARNING,
    title: "تأخير عن الميعاد المتفق عليه",
    message: `عملية بقيمة ${(t.amount / 100).toLocaleString("ar-EG")} جنيه اتأخرت عن الميعاد المتفق عليه.`,
    createdAt: t.agreedDueAt,
    isLive: true,
  }));
}

/**
 * بيرجع كل التنبيهات (المخزّنة + المحسوبة حيًا) مرتبة بالأحدث الأول
 */
export async function getNotifications({ limit = 20 } = {}) {
  const [stored, overdueDebts, lateTransactions] = await Promise.all([
    Notification.find().sort({ createdAt: -1 }).limit(limit).lean(),
    getOverdueDebtAlerts(),
    getLateKeyClientAlerts(),
  ]);

  const merged = [...stored, ...overdueDebts, ...lateTransactions].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  return merged.slice(0, limit);
}

export async function getUnreadCount() {
  return Notification.countDocuments({ isRead: false });
}

export async function markAsRead(id, userId) {
  return Notification.findByIdAndUpdate(
    id,
    { isRead: true, readBy: userId, readAt: new Date() },
    { new: true }
  );
}

export async function markAllAsRead(userId) {
  return Notification.updateMany(
    { isRead: false },
    { isRead: true, readBy: userId, readAt: new Date() }
  );
}