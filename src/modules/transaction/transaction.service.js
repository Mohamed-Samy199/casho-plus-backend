import mongoose from "mongoose";
import Wallet from "../../models/Wallet.model.js";
import User from "../../models/User.model.js";
import Partner from "../../models/Partner.model.js";
import Transaction from "../../models/Transaction.model.js";
import { OperationStage } from "../../utils/common/index.js";
import { ApiError } from "../../utils/ApiError.js";
import { paginate, findById } from "../../db/database.repository.js";
import { resolveDefaultCommission } from "../commission-rule/commission-rule.service.js";
import { checkLowBalanceAndNotify } from "../notification/notification.service.js";

// المراحل اللي بيزيد فيها رصيد المحفظة وبيقل فيها رصيد السيولة
const WALLET_UP_STAGES = [
  OperationStage.WITHDRAW_LIQUIDITY,
  OperationStage.DEPOSIT_WALLET_BALANCE,
];

// ── الصيغة الموحّدة المؤكدة ────────────────────────────────────
// amount: القيمة الكاملة المنقولة (بدون خصم)
// commission: مكسب المكتب، حقل منفصل، دايمًا موجب
export function calculateEffect({ stage, amount, commission = 0 }) {
  const isWalletUp = WALLET_UP_STAGES.includes(stage);
  const walletEffect = isWalletUp ? amount : -amount;
  const liquidityEffect = isWalletUp ? -amount + commission : amount + commission;
  return { walletEffect, liquidityEffect };
}

export async function createTransaction({
  accountType = "Partner",
  partnerId,
  channel,
  phoneNumber,
  stage,
  partyType,
  partyId,
  amount,
  commission,
  agreedDueAt,
  notes,
  userId,
}) {
  const accountId = accountType === "User" ? userId : partnerId;
  const AccountModel = accountType === "User" ? User : Partner;
  const account = await AccountModel.findById(accountId).lean();
  if (!account) throw ApiError.notFound(accountType === "User" ? "حساب الأدمن غير موجود." : "الشريك غير موجود.");
  if (!account.phoneNumbers?.includes(phoneNumber)) {
    throw ApiError.badRequest("رقم التلفون غير تابع للحساب المختار.");
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const walletFilter = accountType === "User"
        ? { ownerType: "User", owner: accountId, channel, phoneNumber }
        : { partner: accountId, channel, phoneNumber };
      let wallet = await Wallet.findOne(walletFilter).session(session);
      if (!wallet) {
        const created = await Wallet.create(
          [accountType === "User"
            ? { ownerType: "User", owner: accountId, channel, phoneNumber }
            : { partner: accountId, channel, ownerType: "Partner", phoneNumber }],
          { session }
        );
        wallet = created[0];
      }

      const finalCommission =
        commission !== undefined && commission !== null
          ? commission
          : await resolveDefaultCommission({ channel, stage, amount });

      const { walletEffect, liquidityEffect } = calculateEffect({
        stage,
        amount,
        commission: finalCommission,
      });

      const newWalletBalance = wallet.walletBalance + walletEffect;
      const newLiquidityBalance = wallet.liquidityBalance + liquidityEffect;

      if (newLiquidityBalance < 0) {
        throw ApiError.badRequest("السيولة المتاحة غير كافية لإتمام هذه العملية.");
      }
      if (newWalletBalance < 0) {
        throw ApiError.badRequest("رصيد المحفظة غير كافٍ لإتمام هذه العملية.");
      }

      await Wallet.updateOne(
        { _id: wallet._id },
        { walletBalance: newWalletBalance, liquidityBalance: newLiquidityBalance },
        { session }
      );

      await checkLowBalanceAndNotify(
        {
          partnerId: accountType === "Partner" ? accountId : null,
          accountType,
          accountId,
          accountName: account.name,
          wallet: wallet._id,
          channel,
          phoneNumber,
          newLiquidityBalance,
          newWalletBalance,
        },
        session
      );

      const [transaction] = await Transaction.create(
        [
          {
            ...(accountType === "User" ? {} : { partner: accountId }),
            accountType,
            account: accountId,
            wallet: wallet._id,
            channel,
            phoneNumber,
            partyType,
            partyId,
            stage,
            amount,
            commission: finalCommission,
            walletEffect,
            liquidityEffect,
            walletBalanceAfter: newWalletBalance,
            liquidityBalanceAfter: newLiquidityBalance,
            agreedDueAt,
            notes,
            createdBy: userId,
          },
        ],
        { session }
      );

      result = transaction;
    });
    return result;
  } finally {
    session.endSession();
  }
}

export async function listTransactions({
  partnerId,
  partyType,
  partyId,
  channel,
  phoneNumber,
  stage,
  from,
  to,
  page = "all",
  size = 20,
}) {
  const filter = {};
  if (partnerId) filter.partner = partnerId;
  if (partyType) filter.partyType = partyType;
  if (partyId) filter.partyId = partyId;
  if (channel) filter.channel = channel;
  if (phoneNumber) filter.phoneNumber = phoneNumber;
  if (stage) filter.stage = stage;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  return paginate({
    model: Transaction,
    filter,
    page,
    size,
    options: {
      sort: { createdAt: -1 },
      populate: [{ path: "partner", select: "name" }],
      lean: true,
    },
  });
}

export async function getTransactionById(id) {
  const transaction = await findById({
    model: Transaction,
    id,
    options: {
      populate: [{ path: "partner", select: "name" }],
      lean: true,
    },
  });
  if (!transaction) throw ApiError.notFound("العملية غير موجودة.");
  return transaction;
}