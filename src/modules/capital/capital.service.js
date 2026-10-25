import mongoose from "mongoose";
import Wallet from "../../models/Wallet.model.js";
import Partner from "../../models/Partner.model.js";
import User from "../../models/User.model.js";
import Debt from "../../models/Debt.model.js";
import BalanceAdjustment from "../../models/BalanceAdjustment.model.js";
import InternalTransfer from "../../models/InternalTransfer.model.js";
import Transaction from "../../models/Transaction.model.js";
import DailyReconciliation from "../../models/DailyReconciliation.model.js";
import Expense from "../../models/Expense.model.js";
import PendingFund from "../../models/PendingFund.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { Channel, DebtDirection, DebtStatus } from "../../utils/common/index.js";

function getDayRange(dateKey) {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(`${dateKey}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime())) throw ApiError.badRequest("تاريخ التقفيل غير صحيح.");
  return { start, end };
}

async function buildDailyReconciliation(dateKey) {
  const { start, end } = getDayRange(dateKey);
  const dateFilter = { createdAt: { $gte: start, $lte: end } };
  const [walletTotals, walletChannelTotals, transactionTotals, adjustmentTotals, expenseTotals, expenseBreakdownTotals, pendingReturnTotals, pendingFundBreakdownTotals, transferCount] = await Promise.all([
    Wallet.aggregate([
      { $group: { _id: null, liquidity: { $sum: "$liquidityBalance" }, wallet: { $sum: "$walletBalance" } } },
    ]),
    Wallet.aggregate([
      { $group: { _id: "$channel", wallet: { $sum: "$walletBalance" } } },
    ]),
    Transaction.aggregate([
      { $match: dateFilter },
      { $group: {
        _id: null,
        count: { $sum: 1 },
        liquidity: { $sum: "$liquidityEffect" },
        wallet: { $sum: "$walletEffect" },
      } },
    ]),
    BalanceAdjustment.aggregate([
      { $match: dateFilter },
      { $group: {
        _id: null,
        liquidity: { $sum: "$liquidityAmount" },
        wallet: { $sum: "$walletAmount" },
      } },
    ]),
    Expense.aggregate([
      { $unwind: "$movements" },
      { $match: { "movements.createdAt": { $gte: start, $lte: end } } },
      { $group: {
        _id: null,
        liquidity: { $sum: { $cond: [{ $eq: ["$balanceType", "liquidity"] }, { $cond: [{ $eq: ["$movements.type", "inflow"] }, "$movements.amount", { $multiply: ["$movements.amount", -1] }] }, 0] } },
        wallet: { $sum: { $cond: [{ $eq: ["$balanceType", "wallet"] }, { $cond: [{ $eq: ["$movements.type", "inflow"] }, "$movements.amount", { $multiply: ["$movements.amount", -1] }] }, 0] } },
      } },
    ]),
    Expense.aggregate([
      { $unwind: "$movements" },
      { $match: { "movements.createdAt": { $gte: start, $lte: end } } },
      { $group: {
        _id: { category: "$category", balanceType: "$balanceType" },
        total: { $sum: { $cond: [{ $eq: ["$movements.type", "inflow"] }, "$movements.amount", { $multiply: ["$movements.amount", -1] }] } },
      } },
    ]),
    PendingFund.aggregate([
      { $unwind: "$movements" },
      { $match: { "movements.createdAt": { $gte: start, $lte: end } } },
      { $group: { _id: null, wallet: { $sum: { $cond: [{ $eq: ["$movements.type", "inflow"] }, "$movements.amount", { $multiply: ["$movements.amount", -1] }] } } } },
    ]),
    PendingFund.aggregate([
      { $unwind: "$movements" },
      { $match: { "movements.createdAt": { $gte: start, $lte: end } } },
      { $group: {
        _id: null,
        suspended: { $sum: { $cond: [{ $eq: ["$movements.type", "outflow"] }, "$movements.amount", 0] } },
        returned: { $sum: { $cond: [{ $eq: ["$movements.type", "inflow"] }, "$movements.amount", 0] } },
      } },
    ]),
    InternalTransfer.countDocuments(dateFilter),
  ]);

  const current = walletTotals[0] || { liquidity: 0, wallet: 0 };
  const walletByChannel = Object.fromEntries(walletChannelTotals.map((item) => [item._id, item.wallet || 0]));
  const transactions = transactionTotals[0] || { count: 0, liquidity: 0, wallet: 0 };
  const adjustments = adjustmentTotals[0] || { liquidity: 0, wallet: 0 };
  const expenses = expenseTotals[0] || { liquidity: 0, wallet: 0 };
  const pendingReturns = pendingReturnTotals[0] || { wallet: 0 };
  const pendingFunds = pendingFundBreakdownTotals[0] || { suspended: 0, returned: 0 };
  const expenseBreakdown = {};
  for (const item of expenseBreakdownTotals) {
    const category = item._id.category;
    const balanceType = item._id.balanceType;
    expenseBreakdown[category] ||= { liquidity: 0, wallet: 0, total: 0 };
    expenseBreakdown[category][balanceType] += item.total || 0;
    expenseBreakdown[category].total += item.total || 0;
  }
  const openingLiquidity = current.liquidity - transactions.liquidity - adjustments.liquidity - expenses.liquidity;
  const openingWalletBalance = current.wallet - transactions.wallet - adjustments.wallet - expenses.wallet - pendingReturns.wallet;

  return {
    dateKey,
    transactionCount: transactions.count,
    openingLiquidity,
    openingWalletBalance,
    transactionLiquidityEffect: transactions.liquidity,
    transactionWalletEffect: transactions.wallet,
    adjustmentLiquidityEffect: adjustments.liquidity,
    adjustmentWalletEffect: adjustments.wallet,
    expenseLiquidityEffect: expenses.liquidity,
    expenseWalletEffect: expenses.wallet,
    pendingReturnWalletEffect: pendingReturns.wallet,
    pendingFundsBreakdown: {
      suspended: pendingFunds.suspended || 0,
      returned: pendingFunds.returned || 0,
      netEffect: (pendingFunds.returned || 0) - (pendingFunds.suspended || 0),
    },
    expenseBreakdown,
    transferCount,
    expectedLiquidity: current.liquidity,
    expectedWalletBalance: current.wallet,
    expectedWalletBalanceByChannel: walletByChannel,
  };
}

export async function getDailyReconciliation(dateKey) {
  const existing = await DailyReconciliation.findOne({ dateKey }).populate("closedBy", "name").lean();
  if (existing?.status === "closed") {
    const currentReport = await buildDailyReconciliation(dateKey);
    return {
      ...existing,
      expectedWalletBalanceByChannel: existing.expectedWalletBalanceByChannel || currentReport.expectedWalletBalanceByChannel,
      expenseBreakdown: existing.expenseBreakdown || currentReport.expenseBreakdown,
      pendingFundsBreakdown: existing.pendingFundsBreakdown || currentReport.pendingFundsBreakdown,
    };
  }
  const report = await buildDailyReconciliation(dateKey);
  return { ...report, status: "open" };
}

export async function closeDailyReconciliation({ dateKey, date, actualLiquidity, actualWalletBalance, notes, userId }) {
  const effectiveDateKey = dateKey || date;
  const report = await buildDailyReconciliation(effectiveDateKey);
  const existing = await DailyReconciliation.findOne({ dateKey: effectiveDateKey }).lean();
  if (existing?.status === "closed") throw ApiError.conflict("تم تقفيل هذا اليوم بالفعل ولا يمكن تعديله.");

  const closed = await DailyReconciliation.findOneAndUpdate(
    { dateKey: effectiveDateKey },
    {
      ...report,
      status: "closed",
      actualLiquidity,
      actualWalletBalance,
      liquidityVariance: actualLiquidity - report.expectedLiquidity,
      walletVariance: actualWalletBalance - report.expectedWalletBalance,
      notes,
      closedBy: userId,
      closedAt: new Date(),
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  ).populate("closedBy", "name");

  return closed.toObject();
}

export async function listDailyReconciliations({ page = 1, size = 10 } = {}) {
  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(size) || 10));
  const [result, total] = await Promise.all([
    DailyReconciliation.find({ status: "closed" })
      .populate("closedBy", "name")
      .sort({ dateKey: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    DailyReconciliation.countDocuments({ status: "closed" }),
  ]);

  return {
    result,
    total,
    currentPage,
    pages: Math.ceil(total / pageSize),
    limit: pageSize,
  };

}

function getTreasuryRange(from, to) {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw ApiError.badRequest("فترة تقرير الخزينة غير صحيحة.");
  }
  return { start, end };
}

const TREASURY_STAGE_LABELS = {
  withdraw_liquidity: "سحب خارج السيولة",
  deposit_liquidity: "إيداع داخل السيولة",
  withdraw_wallet_balance: "سحب خارج رصيد المحفظة",
  deposit_wallet_balance: "إيداع داخل رصيد المحفظة",
};

export async function getTreasuryMovements({ from, to, asset = "liquidity", page = 1, size = 20 } = {}) {
  if (!["liquidity", "wallet"].includes(asset)) throw ApiError.badRequest("نوع الرصيد غير صحيح.");
  const { start, end } = getTreasuryRange(from, to);
  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(size) || 20));
  const periodFilter = { createdAt: { $gte: start, $lte: end } };
  const sinceStartFilter = { createdAt: { $gte: start } };
  const effectField = asset === "liquidity" ? "liquidityEffect" : "walletEffect";
  const adjustmentField = asset === "liquidity" ? "liquidityAmount" : "walletAmount";
  const balanceField = asset === "liquidity" ? "liquidity" : "wallet";
  const adjustmentAfterField = asset === "liquidity" ? "liquidityAfter" : "walletAfter";

  const [walletTotals, walletChannelTotals, allTransactions, allAdjustments, allExpenses, allPendingFunds, periodTransactions, periodAdjustments, periodExpenses, periodPendingFunds, periodTransfers] = await Promise.all([
    Wallet.aggregate([{ $group: { _id: null, [balanceField]: { $sum: `$${balanceField}Balance` } } }]),
    Wallet.aggregate([{ $group: { _id: "$channel", balance: { $sum: `$${balanceField}Balance` } } }]),
    Transaction.find(sinceStartFilter).select(`referenceNumber stage ${effectField} createdAt createdBy notes`).populate("createdBy", "name").lean(),
    BalanceAdjustment.find(sinceStartFilter).select(`mode ${adjustmentField} createdAt createdBy note`).populate("createdBy", "name").lean(),
    Expense.find({ balanceType: asset, "movements.createdAt": { $gte: start } }).select("category description assetName balanceType movements").populate("movements.createdBy", "name").lean(),
    asset === "wallet" ? PendingFund.find({ "movements.createdAt": { $gte: start } }).select("movements").populate("movements.createdBy", "name").lean() : [],
    Transaction.find(periodFilter).select(`referenceNumber stage ${effectField} createdAt createdBy notes`).populate("createdBy", "name").lean(),
    BalanceAdjustment.find(periodFilter).select(`mode ${adjustmentField} ${adjustmentAfterField} createdAt createdBy note`).populate("createdBy", "name").lean(),
    Expense.find({ balanceType: asset, "movements.createdAt": { $gte: start, $lte: end } }).select("category description assetName balanceType movements").populate("movements.createdBy", "name").lean(),
    asset === "wallet" ? PendingFund.find({ "movements.createdAt": { $gte: start, $lte: end } }).select("movements").populate("movements.createdBy", "name").lean() : [],
    InternalTransfer.find({ ...periodFilter, asset }).select("amount notes createdAt createdBy").populate("createdBy", "name").lean(),
  ]);

  const currentBalance = walletTotals[0]?.[balanceField] || 0;
  const channelBalances = Object.fromEntries(walletChannelTotals.map((item) => [item._id, item.balance || 0]));
  const expenseEffect = (items) => items.reduce((sum, item) => sum + item.movements.filter((movement) => new Date(movement.createdAt) >= start).reduce((inner, movement) => inner + (movement.type === "inflow" ? movement.amount : -movement.amount), 0), 0);
  const pendingReturnEffect = (items) => items.reduce((sum, item) => sum + item.movements.filter((movement) => new Date(movement.createdAt) >= start).reduce((inner, movement) => inner + (movement.type === "inflow" ? movement.amount : -movement.amount), 0), 0);
  const effectsSinceStart = allTransactions.reduce((sum, item) => sum + (item[effectField] || 0), 0) + allAdjustments.reduce((sum, item) => sum + (item[adjustmentField] || 0), 0) + expenseEffect(allExpenses) + pendingReturnEffect(allPendingFunds);
  const openingBalance = currentBalance - effectsSinceStart;
  const movements = [
    ...periodTransactions.map((item) => {
      const amount = item[effectField] || 0;
      return {
        id: String(item._id), createdAt: item.createdAt, referenceNumber: item.referenceNumber, kind: "transaction",
        description: item.notes || TREASURY_STAGE_LABELS[item.stage] || "عملية مالية",
        stage: item.stage, amount, inflow: Math.max(0, amount), outflow: Math.max(0, -amount), createdBy: item.createdBy,
      };
    }),
    ...periodAdjustments.map((item) => {
      const amount = item[adjustmentField] || 0;
      return {
        id: String(item._id), createdAt: item.createdAt, referenceNumber: null, kind: "adjustment",
        description: item.note || (item.mode === "opening" ? "رصيد افتتاحي" : "إضافة رصيد"),
        amount, inflow: Math.max(0, amount), outflow: Math.max(0, -amount), createdBy: item.createdBy,
      };
    }),
    ...periodExpenses.flatMap((item) => item.movements.filter((movement) => {
      const date = new Date(movement.createdAt);
      return date >= start && date <= end;
    }).map((movement, index) => {
      const amount = movement.type === "inflow" ? movement.amount : -movement.amount;
      const label = item.category === "asset" ? `بيع/شراء أصل: ${item.assetName || item.description}` : item.category === "advance" ? `سُلفة: ${item.description}` : `خارج: ${item.description}`;
      return {
        id: `${item._id}-expense-${index}`, createdAt: movement.createdAt, referenceNumber: null, kind: "expense",
        description: label, amount, inflow: Math.max(0, amount), outflow: Math.max(0, -amount), createdBy: movement.createdBy,
      };
    })),
    ...periodPendingFunds.flatMap((item) => item.movements.filter((movement) => {
      const date = new Date(movement.createdAt);
      return date >= start && date <= end;
    }).map((movement, index) => ({
      id: `${item._id}-pending-return-${index}`, createdAt: movement.createdAt, referenceNumber: null, kind: "pending_return",
      description: movement.type === "inflow" ? "إرجاع أموال معلقة" : "تسجيل أموال معلقة", amount: movement.type === "inflow" ? movement.amount : -movement.amount, inflow: movement.type === "inflow" ? movement.amount : 0, outflow: movement.type === "outflow" ? movement.amount : 0, createdBy: movement.createdBy,
    }))),
    ...periodTransfers.map((item) => ({
      id: String(item._id), createdAt: item.createdAt, referenceNumber: null, kind: "internal_transfer",
      description: item.notes || `تحويل داخلي لـ${asset === "liquidity" ? "السيولة" : "رصيد المحافظ"} — لا يغير إجمالي الرصيد`,
      amount: 0, inflow: 0, outflow: 0, transferAmount: item.amount || 0, createdBy: item.createdBy,
    })),
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  let runningBalance = openingBalance;
  const detailedMovements = movements.map((movement) => {
    runningBalance += movement.amount;
    return { ...movement, balanceAfter: runningBalance };
  });
  const inflow = detailedMovements.reduce((sum, item) => sum + item.inflow, 0);
  const outflow = detailedMovements.reduce((sum, item) => sum + item.outflow, 0);
  const offset = (currentPage - 1) * pageSize;
  return {
    from, to, asset, openingBalance, inflow, outflow, closingBalance: openingBalance + inflow - outflow, currentBalance,
    internalTransferCount: periodTransfers.length,
    internalTransferAmount: periodTransfers.reduce((sum, item) => sum + (item.amount || 0), 0),
    channelBalances,
    chart: detailedMovements.map(({ createdAt, balanceAfter }) => ({ createdAt, balanceAfter })),
    total: detailedMovements.length, currentPage, pages: Math.ceil(detailedMovements.length / pageSize), limit: pageSize,
    result: detailedMovements.slice(offset, offset + pageSize),
  };
}

/**
 * ملخص رأس المال الكلي:
 * - readyLiquidity: السيولة الفعلية (كاش) الجاهزة للشغل في المكتب دلوقتي
 * - totalWalletBalance: رصيد إلكتروني على المحافظ (مش كاش في الإيد، لكنه ملك للمكتب)
 * - owedToMe / owedByMe: صافي الديون المفتوحة بس (المسددة مبتتحسبش)
 * - totalCapital: كل حاجة مع بعض (السيولة + الرصيد الإلكتروني + صافي الديون)
 * - outsideCapital: كل حاجة مش سيولة فعلية جاهزة (رصيد إلكتروني + ديون ليا لسه مش متحصلة)
 */
export async function getCapitalSummary() {
  const walletsAgg = await Wallet.aggregate([
    {
      $group: {
        _id: null,
        totalLiquidity: { $sum: "$liquidityBalance" },
        totalWalletBalance: { $sum: "$walletBalance" },
      },
    },
  ]);
  const walletChannelsAgg = await Wallet.aggregate([
    { $group: { _id: "$channel", totalWalletBalance: { $sum: "$walletBalance" } } },
  ]);

  const totalLiquidity = walletsAgg[0]?.totalLiquidity || 0;
  const totalWalletBalance = walletsAgg[0]?.totalWalletBalance || 0;
  const walletBalanceByChannel = Object.fromEntries(
    walletChannelsAgg.map((item) => [item._id, item.totalWalletBalance || 0])
  );

  const debtsAgg = await Debt.aggregate([
    { $match: { status: DebtStatus.OPEN } },
    { $group: { _id: "$direction", total: { $sum: "$remainingAmount" } } },
  ]);

  const owedToMe = debtsAgg.find((d) => d._id === DebtDirection.OWED_TO_ME)?.total || 0;
  const owedByMe = debtsAgg.find((d) => d._id === DebtDirection.OWED_BY_ME)?.total || 0;
  const netDebts = owedToMe - owedByMe;

  const totalCapital = totalLiquidity + totalWalletBalance + netDebts;
  const outsideCapital = totalWalletBalance + owedToMe;

  const [wallets, openDebts] = await Promise.all([
    Wallet.find().populate("partner", "name").populate("owner", "name").lean(),
    Debt.find({ status: DebtStatus.OPEN }).populate("partyId", "name").lean(),
  ]);
  const sumByName = (items, amountKey, fallback) => {
    const totals = new Map();
    for (const item of items) {
      const name = item.partner?.name || item.owner?.name || item.partyId?.name || fallback;
      totals.set(name, (totals.get(name) || 0) + (item[amountKey] || item.remainingAmount || 0));
    }
    return Array.from(totals, ([name, amount]) => ({ name, amount }));
  };

  return {
    totalCapital,
    readyLiquidity: totalLiquidity,
    outsideCapital,
    breakdown: {
      totalWalletBalance,
      walletBalanceByChannel,
      owedToMe,
      owedByMe,
      netDebts,
    },
    contributors: {
      liquidity: sumByName(wallets, "liquidityBalance", "مساهم غير محدد"),
      walletBalance: sumByName(wallets, "walletBalance", "مساهم غير محدد"),
      walletVodafone: sumByName(wallets.filter((wallet) => wallet.channel === Channel.VODAFONE_CASH), "walletBalance", "مساهم غير محدد"),
      walletInstapay: sumByName(wallets.filter((wallet) => wallet.channel === Channel.INSTAPAY), "walletBalance", "مساهم غير محدد"),
      owedToMe: sumByName(
        openDebts.filter((debt) => debt.direction === DebtDirection.OWED_TO_ME),
        "remainingAmount",
        "طرف غير محدد"
      ),
      owedByMe: sumByName(
        openDebts.filter((debt) => debt.direction === DebtDirection.OWED_BY_ME),
        "remainingAmount",
        "طرف غير محدد"
      ),
    },
  };
}

/**
 * تفاصيل رأس المال مقسّمة لكل شريك وأدمن، ولكل رقم/شريحة على حدة
 */
export async function getCapitalByPartner() {
  const wallets = await Wallet.find()
    .populate("partner", "name phoneNumbers")
    .populate("owner", "name phoneNumbers email")
    .lean();

  const byAccount = new Map();

  for (const wallet of wallets) {
    const isAdminWallet = wallet.ownerType === "User" && wallet.owner?._id;
    const accountId = (isAdminWallet ? wallet.owner._id : wallet.partner?._id)?.toString();
    if (!accountId) continue;
    const accountType = isAdminWallet ? "User" : "Partner";
    const mapKey = `${accountType}:${accountId}`;

    if (!byAccount.has(mapKey)) {
      byAccount.set(mapKey, {
        accountType,
        account: isAdminWallet ? wallet.owner : wallet.partner,
        partner: isAdminWallet ? null : wallet.partner,
        totalLiquidity: 0,
        totalWalletBalance: 0,
        lines: [],
      });
    }

    const entry = byAccount.get(mapKey);
    entry.lines.push({
      channel: wallet.channel,
      phoneNumber: wallet.phoneNumber,
      liquidityBalance: wallet.liquidityBalance,
      walletBalance: wallet.walletBalance,
    });
    entry.totalLiquidity += wallet.liquidityBalance;
    entry.totalWalletBalance += wallet.walletBalance;
  }

  return Array.from(byAccount.values());
}

/**
 * تعيين الرصيد الافتتاحي لرقم شريك.
 * القيم هنا بالقرش، والعملية متاحة للأدمن فقط من خلال الـ route.
 */
export async function adjustBalance({
  partnerId,
  ownerType = "Partner",
  ownerId,
  channel = Channel.VODAFONE_CASH,
  phoneNumber,
  liquidityAmount,
  walletAmount,
  note,
  userId,
}) {
  if (liquidityAmount === 0 && walletAmount === 0) {
    throw ApiError.badRequest("يجب إدخال قيمة أكبر من صفر في السيولة أو رصيد المحفظة.");
  }
  const actualOwnerId = ownerId || partnerId;
  const ownerModel = ownerType === "User" ? User : Partner;
  const owner = await ownerModel.findById(actualOwnerId).lean();
  if (!owner) throw ApiError.notFound(ownerType === "User" ? "المستخدم غير موجود." : "الشريك غير موجود.");
  if (!owner.phoneNumbers?.includes(phoneNumber)) {
    throw ApiError.badRequest("رقم التلفون غير تابع لهذا الحساب.");
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const walletFilter =
        ownerType === "User"
          ? { ownerType: "User", owner: actualOwnerId, channel, phoneNumber }
          : { partner: actualOwnerId, channel, phoneNumber };
      let wallet = await Wallet.findOne(walletFilter).session(session);
      if (!wallet) {
        throw ApiError.badRequest("القناة غير مضافة لهذا الرقم. أضف القناة أولًا من تفاصيل الرقم.");
      }

      // السجلات القديمة كانت تحفظ ownerType فقط للشريك؛ نكمل owner تلقائيًا.
      if (ownerType !== "User") {
        wallet.ownerType = "Partner";
        wallet.owner = actualOwnerId;
        wallet.partner = actualOwnerId;
      }

      const liquidityBefore = wallet.liquidityBalance || 0;
      const walletBefore = wallet.walletBalance || 0;
      const hasPreviousHistory = await BalanceAdjustment.exists({
        ...(ownerType === "User"
          ? { ownerType: "User", owner: actualOwnerId }
          : { partner: actualOwnerId }),
        channel,
        phoneNumber,
      }).session(session);
      const mode = hasPreviousHistory ? "add" : "opening";
      const liquidityAfter = liquidityBefore + liquidityAmount;
      const walletAfter = walletBefore + walletAmount;

      wallet.liquidityBalance = liquidityAfter;
      wallet.walletBalance = walletAfter;
      await wallet.save({ session });

      const [history] = await BalanceAdjustment.create(
        [
          {
            ...(ownerType === "User"
              ? { ownerType: "User", owner: actualOwnerId }
              : { partner: actualOwnerId, ownerType: "Partner", owner: actualOwnerId }),
            wallet: wallet._id,
            channel,
            phoneNumber,
            mode,
            liquidityBefore,
            walletBefore,
            liquidityAmount,
            walletAmount,
            liquidityAfter,
            walletAfter,
            note,
            createdBy: userId,
          },
        ],
        { session }
      );

      result = { wallet: wallet.toObject(), history: history.toObject() };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function addWalletChannel({ ownerType, ownerId, channel, phoneNumber }) {
  const ownerModel = ownerType === "User" ? User : Partner;
  const owner = await ownerModel.findById(ownerId).select("name phoneNumbers").lean();
  if (!owner) throw ApiError.notFound(ownerType === "User" ? "المستخدم غير موجود." : "الشريك غير موجود.");
  if (!owner.phoneNumbers?.includes(phoneNumber)) {
    throw ApiError.badRequest("الرقم لا يتبع الحساب المختار.");
  }

  const walletFilter = ownerType === "User"
    ? { ownerType: "User", owner: ownerId, channel, phoneNumber }
    : { ownerType: "Partner", partner: ownerId, channel, phoneNumber };
  const existing = await Wallet.findOne(walletFilter).lean();
  if (existing) throw ApiError.conflict("هذه القناة مضافة بالفعل لهذا الرقم.");

  const wallet = await Wallet.create(ownerType === "User"
    ? { ownerType: "User", owner: ownerId, channel, phoneNumber }
    : { ownerType: "Partner", partner: ownerId, owner: ownerId, channel, phoneNumber });
  return { ...wallet.toObject(), ownerName: owner.name, message: "تمت إضافة القناة برصيد ابتدائي صفر." };
}

export async function getBalanceHistory({ partnerId, phoneNumber, limit = 100 } = {}) {
  const filter = {};
  if (partnerId) filter.partner = partnerId;
  if (phoneNumber) filter.phoneNumber = phoneNumber;

  return BalanceAdjustment.find(filter)
    .populate("partner", "name")
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .lean();
}

export async function getMyCapital(userId) {
  const wallets = await Wallet.find({ ownerType: "User", owner: userId }).lean();
  if (wallets.length) {
    return wallets.reduce(
      (summary, wallet) => ({
        liquidity: summary.liquidity + (wallet.liquidityBalance || 0),
        walletBalance: summary.walletBalance + (wallet.walletBalance || 0),
        walletBalanceByChannel: {
          ...summary.walletBalanceByChannel,
          [wallet.channel]: (summary.walletBalanceByChannel[wallet.channel] || 0) + (wallet.walletBalance || 0),
        },
        lines: [
          ...summary.lines,
          {
            channel: wallet.channel,
            phoneNumber: wallet.phoneNumber,
            liquidityBalance: wallet.liquidityBalance || 0,
            walletBalance: wallet.walletBalance || 0,
          },
        ],
      }),
      { liquidity: 0, walletBalance: 0, walletBalanceByChannel: {}, lines: [] }
    );
  }

  // توافق مع الإضافات القديمة التي سُجلت في السجل، قبل ربط Wallet بالمستخدم.
  const history = await BalanceAdjustment.find({
    $or: [
      { ownerType: "User", owner: userId },
      { createdBy: userId },
    ],
  })
    .sort({ createdAt: -1 })
    .lean();
  const latestByLine = new Map();
  for (const item of history) {
    const key = `${item.channel}:${item.phoneNumber}`;
    if (!latestByLine.has(key)) latestByLine.set(key, item);
  }

  return Array.from(latestByLine.values()).reduce(
    (summary, item) => ({
      liquidity: summary.liquidity + (item.liquidityAfter || 0),
      walletBalance: summary.walletBalance + (item.walletAfter || 0),
      walletBalanceByChannel: {
        ...summary.walletBalanceByChannel,
        [item.channel]: (summary.walletBalanceByChannel[item.channel] || 0) + (item.walletAfter || 0),
      },
      lines: [
        ...summary.lines,
        {
          channel: item.channel,
          phoneNumber: item.phoneNumber,
          liquidityBalance: item.liquidityAfter || 0,
          walletBalance: item.walletAfter || 0,
        },
      ],
    }),
    { liquidity: 0, walletBalance: 0, walletBalanceByChannel: {}, lines: [] }
  );
}

export async function getMyBalanceHistory(userId, limit = 100) {
  return BalanceAdjustment.find({
    $or: [
      { ownerType: "User", owner: userId },
      { createdBy: userId },
    ],
  })
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .lean();
}
