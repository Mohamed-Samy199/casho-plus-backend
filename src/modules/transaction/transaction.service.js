import mongoose from "mongoose";
import Wallet from "../../models/Wallet.model.js";
import Transaction from "../../models/Transaction.model.js";
import Client from "../../models/Client.model.js";
import { ClientType, OperationStage, PartyType } from "../../utils/common/index.js";
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
  partnerId,
  channel,
  phoneNumber,
  stage,
  partyType,
  partyId,
  amount,
  commission,
  lateCommissionPerThousand,
  agreedDueAt,
  notes,
  userId,
}) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      let wallet = await Wallet.findOne({ partner: partnerId, channel, phoneNumber }).session(
        session
      );
      if (!wallet) {
        const created = await Wallet.create(
          [{ partner: partnerId, channel, phoneNumber }],
          { session }
        );
        wallet = created[0];
      }

      const finalCommission =
        commission !== undefined && commission !== null
          ? commission
          : await resolveDefaultCommission({ channel, stage, amount });

      let finalDueAt = agreedDueAt ? new Date(agreedDueAt) : undefined;
      let finalLateCommission = lateCommissionPerThousand ?? 0;
      if (partyType === PartyType.CLIENT) {
        const client = await Client.findById(partyId).select("type keyClientSettings").lean();
        if (!client) throw ApiError.notFound("العميل غير موجود.");
        if (client.type === ClientType.KEY_CLIENT) {
          const settings = client.keyClientSettings || {};
          if (!finalDueAt && settings.defaultAgreedHours) {
            finalDueAt = new Date(Date.now() + settings.defaultAgreedHours * 60 * 60 * 1000);
          }
          if (lateCommissionPerThousand === undefined) {
            finalLateCommission = settings.defaultLateCommission ?? 500;
          }
        }
      } else if (partyType === PartyType.WALK_IN) {
        // العميل العابر لا يملك سجلًا أو partyId؛ العملية تُسجل ماليًا فقط.
        finalDueAt = undefined;
        finalLateCommission = 0;
      }

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
          partnerId,
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
            partner: partnerId,
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
            agreedDueAt: finalDueAt,
            lateCommissionPerThousand: finalLateCommission,
            paidAmount: 0,
            remainingAmount: amount,
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

export async function settleTransaction(transactionId, paymentAmount, userId) {
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) throw ApiError.notFound("العملية غير موجودة.");

  const remainingBefore =
    transaction.remainingAmount > 0
      ? transaction.remainingAmount
      : Math.max(0, transaction.amount - (transaction.paidAmount || 0));
  if (remainingBefore <= 0) throw ApiError.badRequest("العملية مسددة بالكامل بالفعل.");
  if (paymentAmount > remainingBefore) {
    throw ApiError.badRequest("قيمة السداد أكبر من المبلغ المتبقي.");
  }

  const now = new Date();
  const daysLate = transaction.agreedDueAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(transaction.agreedDueAt).getTime()) / 86400000))
    : 0;
  const dailyFee =
    Math.ceil(remainingBefore / 100000) * (transaction.lateCommissionPerThousand || 0);
  const lateCommission = daysLate * dailyFee;
  const remainingAfter = remainingBefore - paymentAmount;

  transaction.paidAmount = (transaction.paidAmount || 0) + paymentAmount;
  transaction.remainingAmount = remainingAfter;
  transaction.lateCommission = (transaction.lateCommission || 0) + lateCommission;
  transaction.payments.push({ amount: paymentAmount, lateCommission, paidAt: now, createdBy: userId });
  if (remainingAfter === 0) transaction.settledAt = now;
  await transaction.save();

  return {
    transaction,
    payment: { amount: paymentAmount, lateCommission, daysLate },
  };
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
