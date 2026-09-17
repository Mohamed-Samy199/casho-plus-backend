import Transaction from "../../models/Transaction.model.js";
import Debt from "../../models/Debt.model.js";
import { DebtStatus, UserRole } from "../../utils/common/index.js";
import * as capitalService from "../capital/capital.service.js";

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * عدد العمليات اليوم مقسّمة حسب المرحلة (زي "توزيع العمليات" في الداشبورد المرجعي)
 */
async function getTodayOperations() {
  const { start, end } = getTodayRange();
  const byStage = await Transaction.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: "$stage", count: { $sum: 1 }, totalAmount: { $sum: "$amount" } } },
  ]);
  const totalCount = byStage.reduce((sum, s) => sum + s.count, 0);
  return { byStage, totalCount };
}

/**
 * إجمالي المبالغ والعمولات المكسوبة اليوم — معلومة حساسة (أدمن بس)
 */
async function getTodayFinancials() {
  const { start, end } = getTodayRange();
  const agg = await Transaction.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
        totalCommission: { $sum: "$commission" },
      },
    },
  ]);
  return {
    totalAmount: agg[0]?.totalAmount || 0,
    totalCommission: agg[0]?.totalCommission || 0,
  };
}

async function getRecentTransactions(limit = 10) {
  return Transaction.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("partner", "name")
    .lean();
}

async function getDebtsOverview() {
  return Debt.aggregate([
    { $match: { status: DebtStatus.OPEN } },
    { $group: { _id: "$direction", count: { $sum: 1 }, total: { $sum: "$remainingAmount" } } },
  ]);
}

/**
 * ملخص لوحة التحكم — يختلف حسب الدور:
 * - الموظف: عمليات اليوم (عدد بس، من غير مبالغ/أرباح) + آخر العمليات + ملخص الديون
 * - الأدمن: كل ده بالإضافة للمبالغ الفعلية، إجمالي العمولات، وملخص رأس المال الكلي
 */
export async function getDashboard(user) {
  const isAdmin = user.role === UserRole.ADMIN;

  const [todayOperations, recentTransactions, debtsOverview] = await Promise.all([
    getTodayOperations(),
    getRecentTransactions(10),
    getDebtsOverview(),
  ]);

  const result = { todayOperations, recentTransactions, debtsOverview };

  if (isAdmin) {
    const [todayFinancials, capitalSummary] = await Promise.all([
      getTodayFinancials(),
      capitalService.getCapitalSummary(),
    ]);
    result.todayFinancials = todayFinancials;
    result.capitalSummary = capitalSummary;
  }

  return result;
}