import mongoose from "mongoose";
import PendingFund from "../../models/PendingFund.model.js";
import Wallet from "../../models/Wallet.model.js";
import User from "../../models/User.model.js";
import Partner from "../../models/Partner.model.js";
import { ApiError } from "../../utils/ApiError.js";

const OWNER_MODELS = { User, Partner };

function ownsWallet(wallet, ownerType, ownerId) {
  return ownerType === "User"
    ? wallet.ownerType === "User" && String(wallet.owner) === String(ownerId)
    : (wallet.ownerType === "Partner" || !wallet.ownerType) && String(wallet.partner || wallet.owner) === String(ownerId);
}

async function validateSource(sourceOwnerType, sourceOwnerId, sourceWalletId, session) {
  const owner = await OWNER_MODELS[sourceOwnerType]?.findById(sourceOwnerId).select("name isActive").session(session).lean();
  if (!owner) throw ApiError.notFound("الحساب المحدد غير موجود.");
  if (owner.isActive === false) throw ApiError.badRequest("لا يمكن استخدام حساب غير نشط.");
  const wallet = await Wallet.findById(sourceWalletId).session(session);
  if (!wallet || !ownsWallet(wallet, sourceOwnerType, sourceOwnerId)) throw ApiError.badRequest("المحفظة لا تتبع الحساب المصدر.");
  return { owner, wallet };
}

export async function listPendingFunds({ status, page = 1, size = 20 } = {}) {
  const filter = status ? { status } : {};
  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(size) || 20));
  const [result, total] = await Promise.all([
    PendingFund.find(filter)
      .populate("sourceOwner", "name")
      .populate("createdBy", "name")
      .sort({ status: 1, expectedReturnAt: 1, createdAt: -1 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    PendingFund.countDocuments(filter),
  ]);
  return { result, total, currentPage, pages: Math.ceil(total / pageSize), limit: pageSize };
}

export async function createPendingFund({ sourceOwnerType, sourceOwnerId, sourceWalletId, amount, reason, recoveryOwner, expectedReturnAt, transactionReference, notes, userId }) {
  const numericAmount = Number(amount);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const { wallet } = await validateSource(sourceOwnerType, sourceOwnerId, sourceWalletId, session);
      if (!Number.isInteger(numericAmount) || numericAmount < 1) throw ApiError.badRequest("المبلغ يجب أن يكون أكبر من صفر وبالقروش.");
      const before = wallet.walletBalance || 0;
      if (before < numericAmount) throw ApiError.badRequest("رصيد المحفظة غير كافٍ لتسجيل المبلغ المعلق.");
      wallet.walletBalance = before - numericAmount;
      await wallet.save({ session });
      const [pending] = await PendingFund.create([{
        sourceOwnerType, sourceOwner: sourceOwnerId, sourceWallet: wallet._id,
        channel: wallet.channel, phoneNumber: wallet.phoneNumber, amount: numericAmount,
        remainingAmount: numericAmount, reason, recoveryOwner, expectedReturnAt: expectedReturnAt || undefined,
        transactionReference, notes, createdBy: userId,
        movements: [{ type: "outflow", amount: numericAmount, createdBy: userId, notes }],
      }], { session });
      result = { ...pending.toObject(), sourceBalanceBefore: before, sourceBalanceAfter: wallet.walletBalance };
    });
    return result;
  } finally { await session.endSession(); }
}

export async function returnPendingFund({ id, amount, notes, userId }) {
  const numericAmount = Number(amount);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const pending = await PendingFund.findById(id).session(session);
      if (!pending) throw ApiError.notFound("الأموال المعلقة غير موجودة.");
      if (["returned", "written_off"].includes(pending.status)) throw ApiError.badRequest("لا يمكن تعديل هذا السجل بعد إغلاقه.");
      if (!Number.isInteger(numericAmount) || numericAmount < 1 || numericAmount > pending.remainingAmount) throw ApiError.badRequest("قيمة الإرجاع غير صحيحة.");
      const wallet = await Wallet.findById(pending.sourceWallet).session(session);
      if (!wallet) throw ApiError.notFound("محفظة المصدر غير موجودة.");
      const before = wallet.walletBalance || 0;
      wallet.walletBalance = before + numericAmount;
      await wallet.save({ session });
      pending.returnedAmount += numericAmount;
      pending.remainingAmount -= numericAmount;
      pending.status = pending.remainingAmount === 0 ? "returned" : "partially_returned";
      if (pending.status === "returned") pending.closedAt = new Date();
      pending.movements.push({ type: "inflow", amount: numericAmount, createdBy: userId, notes });
      if (notes) pending.notes = [pending.notes, notes].filter(Boolean).join("\n");
      await pending.save({ session });
      result = { ...pending.toObject(), sourceBalanceBefore: before, sourceBalanceAfter: wallet.walletBalance };
    });
    return result;
  } finally { await session.endSession(); }
}

export async function writeOffPendingFund({ id, notes }) {
  const pending = await PendingFund.findById(id);
  if (!pending) throw ApiError.notFound("الأموال المعلقة غير موجودة.");
  if (["returned", "written_off"].includes(pending.status)) throw ApiError.badRequest("هذا السجل مغلق بالفعل.");
  pending.status = "written_off";
  pending.closedAt = new Date();
  if (notes) pending.notes = [pending.notes, notes].filter(Boolean).join("\n");
  await pending.save();
  return pending.toObject();
}
