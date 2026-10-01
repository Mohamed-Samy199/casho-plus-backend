import mongoose from "mongoose";
import crypto from "crypto";
import Wallet from "../../models/Wallet.model.js";
import Transaction from "../../models/Transaction.model.js";
import TransactionSettlementRequest from "../../models/TransactionSettlementRequest.model.js";
import TransactionCreationRequest from "../../models/TransactionCreationRequest.model.js";
import TransactionReversalRequest from "../../models/TransactionReversalRequest.model.js";
import Client from "../../models/Client.model.js";
import Partner from "../../models/Partner.model.js";
import User from "../../models/User.model.js";
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

const REVERSE_STAGE = Object.freeze({
  [OperationStage.WITHDRAW_LIQUIDITY]: OperationStage.DEPOSIT_LIQUIDITY,
  [OperationStage.DEPOSIT_LIQUIDITY]: OperationStage.WITHDRAW_LIQUIDITY,
  [OperationStage.WITHDRAW_WALLET_BALANCE]: OperationStage.DEPOSIT_WALLET_BALANCE,
  [OperationStage.DEPOSIT_WALLET_BALANCE]: OperationStage.WITHDRAW_WALLET_BALANCE,
});

function createReferenceNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CP-${date}-${suffix}`;
}

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
  ownerType = "Partner",
  ownerId,
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
  idempotencyKey,
}) {
  const normalizedKey = String(idempotencyKey || "").trim();
  if (normalizedKey.length < 8 || normalizedKey.length > 128) {
    throw ApiError.badRequest("يجب إرسال Idempotency-Key صالح لتسجيل العملية.");
  }

  const requestHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        partnerId: partnerId || null,
        ownerType,
        ownerId: ownerId || null,
        channel,
        phoneNumber,
        stage,
        partyType,
        partyId: partyId || null,
        amount,
        commission: commission ?? null,
        lateCommissionPerThousand: lateCommissionPerThousand ?? null,
        agreedDueAt: agreedDueAt ? new Date(agreedDueAt).toISOString() : null,
        notes: notes || "",
        userId: String(userId),
      })
    )
    .digest("hex");

  const actualOwnerId = ownerId || partnerId;
  const actualOwnerType = ownerId ? ownerType : "Partner";
  if (!actualOwnerId) throw ApiError.badRequest("صاحب الحساب المالي مطلوب.");

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existingRequest = await TransactionCreationRequest.findOne({
        idempotencyKey: normalizedKey,
      })
        .session(session)
        .lean();

      if (existingRequest) {
        if (existingRequest.requestHash !== requestHash) {
          throw ApiError.conflict("مفتاح العملية مستخدم بالفعل مع بيانات مختلفة.");
        }

        const existingTransaction = await Transaction.findById(existingRequest.transaction)
          .session(session)
          .lean();
        if (!existingTransaction) {
          throw ApiError.internal("تعذر استرجاع العملية المرتبطة بطلب مكرر.");
        }

        result = existingTransaction;
        return;
      }

      const ownerModel = actualOwnerType === "User" ? User : Partner;
      const ownerRecord = await ownerModel.findById(actualOwnerId).select("name phoneNumbers isActive").lean();
      if (!ownerRecord) throw ApiError.notFound("صاحب الحساب المالي غير موجود.");
      if (ownerRecord.isActive === false) throw ApiError.badRequest("صاحب الحساب المالي غير نشط.");
      if (!ownerRecord.phoneNumbers?.includes(phoneNumber)) {
        throw ApiError.badRequest("الرقم/الشريحة غير تابع لصاحب الحساب المختار.");
      }

      const walletFilter = actualOwnerType === "User"
        ? { ownerType: "User", owner: actualOwnerId, channel, phoneNumber }
        : { partner: actualOwnerId, channel, phoneNumber };
      let wallet = await Wallet.findOne(walletFilter).session(session);
      if (!wallet) {
        const created = await Wallet.create(
          [actualOwnerType === "User"
            ? { ownerType: "User", owner: actualOwnerId, channel, phoneNumber }
            : { partner: actualOwnerId, ownerType: "Partner", owner: actualOwnerId, channel, phoneNumber }],
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
          partnerId: actualOwnerType === "Partner" ? actualOwnerId : undefined,
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
            referenceNumber: createReferenceNumber(),
            ...(actualOwnerType === "Partner" && { partner: actualOwnerId }),
            ownerType: actualOwnerType,
            owner: actualOwnerId,
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

      await TransactionCreationRequest.create(
        [
          {
            idempotencyKey: normalizedKey,
            requestHash,
            transaction: transaction._id,
            createdBy: userId,
          },
        ],
        { session }
      );

      result = transaction;
    });
    return result;
  } catch (error) {
    // Two concurrent requests with the same key can both pass the initial read.
    // The unique index makes one commit and the other safely replay the winner.
    if (error?.code === 11000) {
      const existingRequest = await TransactionCreationRequest.findOne({
        idempotencyKey: normalizedKey,
      }).lean();

      if (existingRequest) {
        if (existingRequest.requestHash !== requestHash) {
          throw ApiError.conflict("مفتاح العملية مستخدم بالفعل مع بيانات مختلفة.");
        }

        const existingTransaction = await Transaction.findById(existingRequest.transaction);
        if (!existingTransaction) {
          throw ApiError.internal("تعذر استرجاع العملية المرتبطة بطلب مكرر.");
        }

        return existingTransaction;
      }
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

export async function settleTransaction(transactionId, paymentAmount, userId, idempotencyKey) {
  const normalizedKey = String(idempotencyKey || "").trim();
  if (normalizedKey.length < 8 || normalizedKey.length > 128) {
    throw ApiError.badRequest("يجب إرسال Idempotency-Key صالح للسداد.");
  }

  const session = await mongoose.startSession();
  try {
    let result;

    await session.withTransaction(async () => {
      const existingRequest = await TransactionSettlementRequest.findOne({
        transaction: transactionId,
        idempotencyKey: normalizedKey,
      })
        .session(session)
        .lean();

      if (existingRequest) {
        if (existingRequest.amount !== paymentAmount) {
          throw ApiError.conflict("مفتاح السداد مستخدم بالفعل مع مبلغ مختلف.");
        }

        const existingTransaction = await Transaction.findById(transactionId).session(session);
        if (!existingTransaction) throw ApiError.notFound("العملية غير موجودة.");

        result = {
          transaction: existingTransaction,
          payment: {
            amount: existingRequest.amount,
            lateCommission: existingRequest.lateCommission,
            daysLate: existingRequest.daysLate,
          },
          idempotentReplay: true,
        };
        return;
      }

      const transaction = await Transaction.findById(transactionId).session(session);
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
      const paymentId = new mongoose.Types.ObjectId();

      // __v prevents an old snapshot from overwriting a newer settlement.
      const updatedTransaction = await Transaction.findOneAndUpdate(
        {
          _id: transactionId,
          __v: transaction.__v,
          remainingAmount: { $gte: paymentAmount },
        },
        {
          $inc: {
            paidAmount: paymentAmount,
            remainingAmount: -paymentAmount,
            lateCommission,
            __v: 1,
          },
          $push: {
            payments: {
              _id: paymentId,
              amount: paymentAmount,
              lateCommission,
              paidAt: now,
              createdBy: userId,
            },
          },
          ...(remainingAfter === 0 ? { $set: { settledAt: now } } : {}),
        },
        { new: true, session, runValidators: true }
      );

      if (!updatedTransaction) {
        throw ApiError.conflict("تم تحديث العملية بطلب آخر. راجع الرصيد المتبقي ثم حاول مرة أخرى.");
      }

      await TransactionSettlementRequest.create(
        [
          {
            transaction: transactionId,
            idempotencyKey: normalizedKey,
            amount: paymentAmount,
            paymentId,
            lateCommission,
            daysLate,
            createdBy: userId,
          },
        ],
        { session }
      );

      result = {
        transaction: updatedTransaction,
        payment: { amount: paymentAmount, lateCommission, daysLate },
        idempotentReplay: false,
      };
    });

    return result;
  } catch (error) {
    // The unique index handles two concurrent requests using the same key.
    if (error?.code === 11000) {
      const existingRequest = await TransactionSettlementRequest.findOne({
        transaction: transactionId,
        idempotencyKey: normalizedKey,
      }).lean();

      if (existingRequest) {
        if (existingRequest.amount !== paymentAmount) {
          throw ApiError.conflict("مفتاح السداد مستخدم بالفعل مع مبلغ مختلف.");
        }

        const existingTransaction = await Transaction.findById(transactionId);
        if (!existingTransaction) throw ApiError.notFound("العملية غير موجودة.");

        return {
          transaction: existingTransaction,
          payment: {
            amount: existingRequest.amount,
            lateCommission: existingRequest.lateCommission,
            daysLate: existingRequest.daysLate,
          },
          idempotentReplay: true,
        };
      }
    }

    throw error;
  } finally {
    await session.endSession();
  }
}

export async function reverseTransaction(transactionId, userId, reason, idempotencyKey, targetStage) {
  const normalizedKey = String(idempotencyKey || "").trim();
  const normalizedReason = String(reason || "").trim();
  if (normalizedKey.length < 8 || normalizedKey.length > 128) {
    throw ApiError.badRequest("يجب إرسال Idempotency-Key صالح للإجراء.");
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existingRequest = await TransactionReversalRequest.findOne({ idempotencyKey: normalizedKey })
        .session(session)
        .lean();
      if (existingRequest) {
        if (
          String(existingRequest.originalTransaction) !== String(transactionId) ||
          (existingRequest.reason || "") !== normalizedReason ||
          (existingRequest.targetStage || null) !== (targetStage || null)
        ) {
          throw ApiError.conflict("مفتاح الإجراء مستخدم بالفعل مع بيانات مختلفة.");
        }
        const reversal = await Transaction.findById(existingRequest.reversalTransaction).session(session).lean();
        if (!reversal) throw ApiError.internal("تعذر استرجاع الإجراء السابق.");
        const corrected = existingRequest.correctedTransaction
          ? await Transaction.findById(existingRequest.correctedTransaction).session(session).lean()
          : null;
        result = { originalTransaction: transactionId, reversalTransaction: reversal, correctedTransaction: corrected, replay: true };
        return;
      }

      const original = await Transaction.findById(transactionId).session(session);
      if (!original) throw ApiError.notFound("العملية الأصلية غير موجودة.");
      if (original.reversalOf) throw ApiError.badRequest("لا يمكن تنفيذ الإجراء على قيد عكسي.");
      if (original.reversedAt || original.reversalTransaction) {
        throw ApiError.conflict("تم التعامل مع هذه العملية من قبل.");
      }

      const reverseStage = REVERSE_STAGE[original.stage];
      if (!reverseStage) throw ApiError.badRequest("مرحلة العملية لا تدعم العكس.");
      if (targetStage && targetStage === original.stage) {
        throw ApiError.badRequest("المرحلة الجديدة يجب أن تكون مختلفة عن المرحلة الحالية.");
      }
      if (targetStage && !REVERSE_STAGE[targetStage]) {
        throw ApiError.badRequest("المرحلة الجديدة غير مدعومة.");
      }

      const wallet = await Wallet.findById(original.wallet).session(session);
      if (!wallet) throw ApiError.notFound("محفظة العملية الأصلية غير موجودة.");

      const balanceAfterReversal = {
        wallet: wallet.walletBalance - original.walletEffect,
        liquidity: wallet.liquidityBalance - original.liquidityEffect,
      };
      if (balanceAfterReversal.wallet < 0 || balanceAfterReversal.liquidity < 0) {
        throw ApiError.badRequest("لا يمكن تنفيذ الإجراء لأن الرصيد الحالي لا يسمح بإرجاع تأثير العملية.");
      }

      const reversal = (await Transaction.create([{
        referenceNumber: createReferenceNumber(),
        ...(original.partner && { partner: original.partner }),
        ownerType: original.ownerType,
        owner: original.owner,
        wallet: original.wallet,
        channel: original.channel,
        phoneNumber: original.phoneNumber,
        partyType: original.partyType,
        partyId: original.partyId,
        stage: reverseStage,
        amount: original.amount,
        commission: 0,
        walletEffect: -original.walletEffect,
        liquidityEffect: -original.liquidityEffect,
        walletBalanceAfter: balanceAfterReversal.wallet,
        liquidityBalanceAfter: balanceAfterReversal.liquidity,
        lateCommissionPerThousand: 0,
        paidAmount: 0,
        remainingAmount: 0,
        notes: normalizedReason ? `عكس العملية الأصلية: ${normalizedReason}` : "عكس العملية الأصلية",
        createdBy: userId,
        reversalOf: original._id,
      }], { session }))[0];

      let corrected = null;
      let finalWalletBalance = balanceAfterReversal.wallet;
      let finalLiquidityBalance = balanceAfterReversal.liquidity;
      if (targetStage) {
        const correctedEffects = calculateEffect({ stage: targetStage, amount: original.amount, commission: original.commission || 0 });
        finalWalletBalance += correctedEffects.walletEffect;
        finalLiquidityBalance += correctedEffects.liquidityEffect;
        if (finalWalletBalance < 0 || finalLiquidityBalance < 0) {
          throw ApiError.badRequest("لا يمكن التصحيح لأن المرحلة الجديدة ستجعل الرصيد سالبًا.");
        }
        corrected = (await Transaction.create([{
          referenceNumber: createReferenceNumber(),
          ...(original.partner && { partner: original.partner }),
          ownerType: original.ownerType,
          owner: original.owner,
          wallet: original.wallet,
          channel: original.channel,
          phoneNumber: original.phoneNumber,
          partyType: original.partyType,
          partyId: original.partyId,
          stage: targetStage,
          amount: original.amount,
          commission: original.commission || 0,
          walletEffect: correctedEffects.walletEffect,
          liquidityEffect: correctedEffects.liquidityEffect,
          walletBalanceAfter: finalWalletBalance,
          liquidityBalanceAfter: finalLiquidityBalance,
          agreedDueAt: original.agreedDueAt,
          settledAt: original.settledAt,
          lateCommissionPerThousand: original.lateCommissionPerThousand || 0,
          lateCommission: original.lateCommission || 0,
          paidAmount: original.paidAmount || 0,
          remainingAmount: original.remainingAmount ?? original.amount,
          payments: original.payments || [],
          notes: normalizedReason ? `تصحيح للعملية الأصلية: ${normalizedReason}` : "تصحيح للعملية الأصلية",
          createdBy: userId,
          correctionOf: original._id,
        }], { session }))[0];
      }

      const walletUpdate = await Wallet.updateOne(
        { _id: wallet._id, walletBalance: wallet.walletBalance, liquidityBalance: wallet.liquidityBalance },
        { $set: { walletBalance: finalWalletBalance, liquidityBalance: finalLiquidityBalance }, $inc: { __v: targetStage ? 2 : 1 } },
        { session }
      );
      if (walletUpdate.matchedCount !== 1) {
        throw ApiError.conflict("تم تحديث الرصيد بطلب آخر. راجع الرصيد ثم حاول مرة أخرى.");
      }

      const originalUpdate = await Transaction.updateOne(
        { _id: original._id, reversedAt: { $exists: false }, reversalTransaction: { $exists: false } },
        {
          $set: {
            reversedAt: new Date(),
            reversalTransaction: reversal._id,
            ...(corrected && { correctedTransaction: corrected._id, correctionStage: targetStage }),
            ...(normalizedReason && { reversalReason: normalizedReason }),
            reversedBy: userId,
          },
        },
        { session }
      );
      if (originalUpdate.matchedCount !== 1) throw ApiError.conflict("تم التعامل مع العملية بطلب آخر.");

      await TransactionReversalRequest.create([{
        idempotencyKey: normalizedKey,
        originalTransaction: original._id,
        reversalTransaction: reversal._id,
        correctedTransaction: corrected?._id,
        targetStage,
        reason: normalizedReason,
        createdBy: userId,
      }], { session });

      result = { originalTransaction: original._id, reversalTransaction: reversal, correctedTransaction: corrected, replay: false };
    });
    return result;
  } catch (error) {
    if (error?.code === 11000) {
      const existingRequest = await TransactionReversalRequest.findOne({ idempotencyKey: normalizedKey }).lean();
      if (existingRequest) {
        const reversal = await Transaction.findById(existingRequest.reversalTransaction);
        const corrected = existingRequest.correctedTransaction ? await Transaction.findById(existingRequest.correctedTransaction) : null;
        if (reversal) return { originalTransaction: transactionId, reversalTransaction: reversal, correctedTransaction: corrected, replay: true };
      }
      const originalRequest = await TransactionReversalRequest.findOne({ originalTransaction: transactionId }).lean();
      if (originalRequest) throw ApiError.conflict("تم التعامل مع هذه العملية من قبل.");
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function listTransactions({
  ownerType,
  ownerId,
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
  if (ownerId) {
    if ((ownerType || "Partner") === "Partner") {
      // بعض السجلات القديمة تعتمد على partner بدل owner؛ ندعم الصيغتين.
      filter.$or = [
        { ownerType: "Partner", owner: ownerId },
        { partner: ownerId },
      ];
    } else {
      filter.ownerType = "User";
      filter.owner = ownerId;
    }
  } else if (partnerId) {
    filter.partner = partnerId;
  }
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
      populate: [
        { path: "partner", select: "name" },
        { path: "owner", select: "name" },
      ],
      lean: true,
    },
  });
}

export async function getTransactionById(id) {
  const transaction = await findById({
    model: Transaction,
    id,
    options: {
      populate: [
        { path: "partner", select: "name" },
        { path: "owner", select: "name" },
      ],
      lean: true,
    },
  });
  if (!transaction) throw ApiError.notFound("العملية غير موجودة.");
  return transaction;
}
