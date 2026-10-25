import mongoose from "mongoose";
import Expense from "../../models/Expense.model.js";
import Wallet from "../../models/Wallet.model.js";
import User from "../../models/User.model.js";
import Partner from "../../models/Partner.model.js";
import { ApiError } from "../../utils/ApiError.js";

const OWNER_MODELS = { User, Partner };
const balanceKey = (type) => (type === "wallet" ? "walletBalance" : "liquidityBalance");

function ownsWallet(wallet, ownerType, ownerId) {
  return ownerType === "User"
    ? wallet.ownerType === "User" && String(wallet.owner) === String(ownerId)
    : (wallet.ownerType === "Partner" || !wallet.ownerType) && String(wallet.partner || wallet.owner) === String(ownerId);
}

export async function listAccounts() {
  const [users, partners, wallets] = await Promise.all([
    User.find({ isActive: { $ne: false } }).select("name phoneNumbers role").sort({ name: 1 }).lean(),
    Partner.find({ isActive: { $ne: false } }).select("name phoneNumbers").sort({ name: 1 }).lean(),
    Wallet.find({}).select("ownerType owner partner channel phoneNumber liquidityBalance walletBalance").lean(),
  ]);
  const result = [];
  const addOwner = (record, type) => {
    const ownerWallets = wallets.filter((wallet) => type === "User"
      ? wallet.ownerType === "User" && String(wallet.owner) === String(record._id)
      : (wallet.ownerType === "Partner" || !wallet.ownerType) && String(wallet.partner || wallet.owner) === String(record._id));
    result.push({
      type,
      id: record._id,
      name: record.name,
      role: record.role,
      phoneNumbers: record.phoneNumbers || [],
      wallets: ownerWallets.map((wallet) => ({
        id: wallet._id,
        channel: wallet.channel,
        phoneNumber: wallet.phoneNumber,
        liquidityBalance: wallet.liquidityBalance || 0,
        walletBalance: wallet.walletBalance || 0,
      })),
    });
  };
  users.forEach((user) => addOwner(user, "User"));
  partners.forEach((partner) => addOwner(partner, "Partner"));
  return result;
}

export async function listExpenses({ category, status, page = 1, size = 20 } = {}) {
  const filter = {};
  if (category) filter.category = category;
  if (status) filter.status = status;
  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(size) || 20));
  const [result, total] = await Promise.all([
    Expense.find(filter)
      .populate("sourceOwner", "name")
      .populate("borrower", "name")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Expense.countDocuments(filter),
  ]);
  return { result, total, currentPage, pages: Math.ceil(total / pageSize), limit: pageSize };
}

async function getOwner(modelName, id, session) {
  const owner = await OWNER_MODELS[modelName]?.findById(id).select("name isActive phoneNumbers").session(session).lean();
  if (!owner) throw ApiError.notFound("الحساب المحدد غير موجود.");
  if (owner.isActive === false) throw ApiError.badRequest("لا يمكن استخدام حساب غير نشط.");
  return owner;
}

export async function createExpense({ category, description, sourceOwnerType, sourceOwnerId, sourceWalletId, balanceType, amount, borrowerType, borrowerId, notes, userId }) {
  const numericAmount = Number(amount);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const sourceOwner = await getOwner(sourceOwnerType, sourceOwnerId, session);
      const sourceWallet = await Wallet.findById(sourceWalletId).session(session);
      if (!sourceWallet || !ownsWallet(sourceWallet, sourceOwnerType, sourceOwnerId)) throw ApiError.badRequest("المحفظة لا تتبع الحساب المصدر.");
      const key = balanceKey(balanceType);
      const before = sourceWallet[key] || 0;
      if (!Number.isInteger(numericAmount) || numericAmount < 1) throw ApiError.badRequest("المبلغ يجب أن يكون أكبر من صفر وبالقروش.");
      if (before < numericAmount) throw ApiError.badRequest("الرصيد المتاح في الحساب المصدر غير كافٍ.");
      let borrower;
      if (category === "advance") {
        borrower = await getOwner(borrowerType, borrowerId, session);
        if (sourceOwnerType === borrowerType && String(sourceOwnerId) === String(borrowerId)) throw ApiError.badRequest("لا يمكن تسجيل سُلفة للحساب نفسه.");
      }
      const after = before - numericAmount;
      sourceWallet[key] = after;
      await sourceWallet.save({ session });
      const [expense] = await Expense.create([{
        category,
        description,
        sourceOwnerType,
        sourceOwner: sourceOwnerId,
        sourceWallet: sourceWalletId,
        sourcePhoneNumber: sourceWallet.phoneNumber,
        balanceType,
        amount: numericAmount,
        returnedAmount: 0,
        remainingAmount: category === "advance" ? numericAmount : 0,
        borrowerType: category === "advance" ? borrowerType : undefined,
        borrower: category === "advance" ? borrowerId : undefined,
        borrowerName: borrower?.name,
        status: "active",
        createdBy: userId,
        notes,
        movements: [{ type: "outflow", amount: numericAmount, createdBy: userId, notes }],
      }], { session });
      result = { ...expense.toObject(), sourceBalanceBefore: before, sourceBalanceAfter: after };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function repayAdvance({ expenseId, amount, notes, userId }) {
  return settleAdvance({ expenseId, amount, notes, userId, action: "repay" });
}

export async function sellAsset({ expenseId, amount, notes, userId }) {
  return settleAdvance({ expenseId, amount, notes, userId, action: "sell" });
}

async function settleAdvance({ expenseId, amount, notes, userId, action }) {
  const numericAmount = Number(amount);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const expense = await Expense.findById(expenseId).session(session);
      if (!expense) throw ApiError.notFound("المصروف غير موجود.");
      if (action === "repay" && expense.category !== "advance") throw ApiError.badRequest("هذا السجل ليس سُلفة.");
      if (action === "sell" && expense.category !== "asset") throw ApiError.badRequest("هذا السجل ليس أصلًا.");
      if (expense.status === "sold" || expense.status === "repaid") throw ApiError.badRequest("تم إغلاق هذا السجل من قبل.");
      const sourceWallet = await Wallet.findById(expense.sourceWallet).session(session);
      if (!sourceWallet) throw ApiError.notFound("محفظة المصدر غير موجودة.");
      const key = balanceKey(expense.balanceType);
      const before = sourceWallet[key] || 0;
      if (!Number.isInteger(numericAmount) || numericAmount < 1) throw ApiError.badRequest("المبلغ يجب أن يكون أكبر من صفر وبالقروش.");
      if (action === "repay" && numericAmount > expense.remainingAmount) throw ApiError.badRequest("قيمة الرد أكبر من المتبقي من السُلفة.");
      sourceWallet[key] = before + numericAmount;
      await sourceWallet.save({ session });
      if (action === "repay") {
        expense.returnedAmount += numericAmount;
        expense.remainingAmount -= numericAmount;
        expense.status = expense.remainingAmount === 0 ? "repaid" : "partially_repaid";
        if (expense.remainingAmount === 0) expense.repaidAt = new Date();
      } else {
        expense.status = "sold";
        expense.soldAt = new Date();
        expense.soldAmount = numericAmount;
        expense.returnedAmount = numericAmount;
        expense.remainingAmount = 0;
      }
      expense.movements.push({ type: "inflow", amount: numericAmount, createdBy: userId, notes });
      expense.notes = notes ? [expense.notes, notes].filter(Boolean).join("\n") : expense.notes;
      await expense.save({ session });
      result = { ...expense.toObject(), sourceBalanceBefore: before, sourceBalanceAfter: sourceWallet[key] };
    });
    return result;
  } finally {
    await session.endSession();
  }
}
