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
        throw ApiError.badRequest("القناة غير مضافة لهذا الرقم. أضف القناة أولًا من تفاصيل الرقم.");
      }

      const finalCommission =
        commission !== undefined && commission !== null
          ? commission
          : await resolveDefaultCommission({ channel, stage, amount });

      let finalDueAt = agreedDueAt ? new Date(agreedDueAt) : undefined;
      let finalLateCommission = 0;
      if (partyType === PartyType.CLIENT) {
        const client = await Client.findById(partyId).select("type keyClientSettings").lean();
        if (!client) throw ApiError.notFound("العميل غير موجود.");
        if (client.type === ClientType.KEY_CLIENT) {
          const settings = client.keyClientSettings || {};
          // الاستحقاق يُحدد كتاريخ داخل العملية نفسها، ولا توجد عمولة تأخير تلقائية.
          finalLateCommission = 0;
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
      if (newWalletBalance < 0) {
        throw ApiError.badRequest("رصيد المحفظة غير كافٍ لإتمام هذه العملية.");
      }

      // السيولة النقدية مشتركة داخل المكتب، ولا تتقيد بقناة فودافون أو إنستا.
      // أما رصيد المحفظة الإلكتروني فيظل منفصلًا حسب القناة والرقم.
      const ownerWalletFilter = actualOwnerType === "User"
        ? { ownerType: "User", owner: actualOwnerId }
        : { partner: actualOwnerId };
      const ownerWallets = await Wallet.find(ownerWalletFilter).session(session);
      const liquidityDebit = Math.max(0, -liquidityEffect);
      const liquidityCredit = Math.max(0, liquidityEffect);
      let remainingDebit = liquidityDebit;
      const liquidityUpdates = new Map();

      if (liquidityDebit > 0) {
        for (const sourceWallet of [wallet, ...ownerWallets.filter((item) => String(item._id) !== String(wallet._id))]) {
          const used = Math.min(sourceWallet.liquidityBalance || 0, remainingDebit);
          if (used > 0) {
            liquidityUpdates.set(String(sourceWallet._id), (sourceWallet.liquidityBalance || 0) - used);
            remainingDebit -= used;
          }
          if (remainingDebit === 0) break;
        }
        if (remainingDebit > 0) {
          throw ApiError.badRequest("إجمالي السيولة النقدية المتاحة داخل المكتب غير كافٍ لإتمام هذه العملية.");
        }
      }

      const selectedLiquidityAfter = (liquidityUpdates.has(String(wallet._id))
        ? liquidityUpdates.get(String(wallet._id))
        : wallet.liquidityBalance) + liquidityCredit;
      liquidityUpdates.set(String(wallet._id), selectedLiquidityAfter);
      for (const [walletId, liquidityAfter] of liquidityUpdates) {
        await Wallet.updateOne(
          { _id: walletId },
          walletId === String(wallet._id)
            ? { walletBalance: newWalletBalance, liquidityBalance: liquidityAfter }
            : { liquidityBalance: liquidityAfter },
          { session }
        );
      }
      const newLiquidityBalance = selectedLiquidityAfter;

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

export async function settleTransaction(transactionId, payment, userId, idempotencyKey) {
  const data = typeof payment === "number" ? { amount: payment, commission: 0, paymentMethod: "liquidity" } : (payment || {});
  const paymentAmount = Number(data.amount);
  const settlementCommission = Number(data.commission || 0);
  const paymentMethod = data.paymentMethod || "liquidity";
  const normalizedKey = String(idempotencyKey || "").trim();
  if (normalizedKey.length < 8 || normalizedKey.length > 128) throw ApiError.badRequest("يجب إرسال Idempotency-Key صالح للسداد.");
  if (!Number.isInteger(paymentAmount) || paymentAmount < 1 || !Number.isInteger(settlementCommission) || settlementCommission < 0) throw ApiError.badRequest("بيانات السداد غير صحيحة.");
  if (!["liquidity", "vodafone_cash", "instapay"].includes(paymentMethod)) throw ApiError.badRequest("طريقة السداد غير مدعومة.");

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existing = await TransactionSettlementRequest.findOne({ transaction: transactionId, idempotencyKey: normalizedKey }).session(session).lean();
      const samePayment = (r) => r && r.amount === paymentAmount && (r.commission || 0) === settlementCommission && r.paymentMethod === paymentMethod && (!r.wallet || !data.walletId || String(r.wallet) === String(data.walletId));
      if (existing) {
        if (!samePayment(existing)) throw ApiError.conflict("مفتاح السداد مستخدم بالفعل مع بيانات مختلفة.");
        const tx = await Transaction.findById(transactionId).session(session); if (!tx) throw ApiError.notFound("العملية غير موجودة.");
        result = { transaction: tx, payment: { amount: existing.amount, commission: existing.commission || 0, lateCommission: existing.lateCommission || 0, daysLate: existing.daysLate, paymentMethod: existing.paymentMethod, walletId: existing.wallet }, idempotentReplay: true }; return;
      }
      const transaction = await Transaction.findById(transactionId).session(session);
      if (!transaction) throw ApiError.notFound("العملية غير موجودة.");
      const remainingBefore = transaction.remainingAmount > 0 ? transaction.remainingAmount : Math.max(0, transaction.amount - (transaction.paidAmount || 0));
      if (remainingBefore <= 0 || paymentAmount > remainingBefore) throw ApiError.badRequest("قيمة السداد أكبر من المبلغ المتبقي أو العملية مسددة بالكامل.");

      // العميل الرئيسي له تسوية آجلة خاصة: في عمليات السحب يسترد المكتب المال
      // فتزداد أرصدته، أما في عمليات الإيداع فيرد المكتب المال للعميل فتقل أرصدته.
      let settlementSign = 1;
      if (transaction.partyType === PartyType.CLIENT && transaction.partyId) {
        const client = await Client.findById(transaction.partyId).select("type").session(session).lean();
        if (client?.type === ClientType.KEY_CLIENT && [
          OperationStage.DEPOSIT_LIQUIDITY,
          OperationStage.DEPOSIT_WALLET_BALANCE,
        ].includes(transaction.stage)) {
          settlementSign = -1;
        }
      }
      const settlementTotal = paymentAmount + settlementCommission;

      let settlementWallet = null;
      if (paymentMethod === "liquidity") {
        const ownerFilter = transaction.ownerType === "User" ? { ownerType: "User", owner: transaction.owner } : { partner: transaction.owner || transaction.partner };
        settlementWallet = data.walletId ? await Wallet.findOne({ _id: data.walletId, ...ownerFilter }).session(session) : await Wallet.findOne(ownerFilter).session(session);
        if (!settlementWallet) throw ApiError.badRequest("محفظة السيولة المحددة غير موجودة.");
        const ownerWallets = await Wallet.find(ownerFilter).session(session);
        if (settlementSign > 0) {
          await Wallet.updateOne({ _id: settlementWallet._id }, { $inc: { liquidityBalance: settlementTotal } }, { session });
        } else {
          let left = settlementTotal;
          for (const wallet of [settlementWallet, ...ownerWallets.filter((item) => String(item._id) !== String(settlementWallet._id))]) {
            const used = Math.min(wallet.liquidityBalance || 0, left);
            if (used > 0) {
              await Wallet.updateOne({ _id: wallet._id }, { $inc: { liquidityBalance: -used } }, { session });
              left -= used;
            }
            if (left === 0) break;
          }
          if (left > 0) throw ApiError.badRequest("إجمالي السيولة غير كافٍ لرد المبلغ للعميل.");
        }
      } else {
        const ownerType = data.ownerType || transaction.ownerType;
        const ownerId = data.ownerId || transaction.owner || transaction.partner;
        const phoneNumber = data.phoneNumber || transaction.phoneNumber;
        if (!ownerId || !phoneNumber) throw ApiError.badRequest("يجب تحديد صاحب المحفظة ورقم الهاتف للسداد عبر قناة.");
        const filter = ownerType === "User" ? { _id: data.walletId, ownerType, owner: ownerId, channel: paymentMethod, phoneNumber } : { _id: data.walletId, partner: ownerId, channel: paymentMethod, phoneNumber };
        settlementWallet = data.walletId ? await Wallet.findOne(filter).session(session) : await Wallet.findOne({ ...(ownerType === "User" ? { ownerType, owner: ownerId } : { partner: ownerId }), channel: paymentMethod, phoneNumber }).session(session);
        if (!settlementWallet) throw ApiError.badRequest("محفظة قناة السداد غير موجودة.");
        if (settlementSign < 0 && (settlementWallet.walletBalance || 0) < settlementTotal) {
          throw ApiError.badRequest("رصيد المحفظة غير كافٍ لرد المبلغ للعميل.");
        }
        await Wallet.updateOne({ _id: settlementWallet._id }, { $inc: { walletBalance: settlementSign * settlementTotal } }, { session });
      }

      const now = new Date();
      const remainingAfter = remainingBefore - paymentAmount;
      const paymentId = new mongoose.Types.ObjectId();
      const updated = await Transaction.findOneAndUpdate({ _id: transactionId, __v: transaction.__v, remainingAmount: { $gte: paymentAmount } }, {
        $inc: { paidAmount: paymentAmount, remainingAmount: -paymentAmount, __v: 1 },
        $push: { payments: { _id: paymentId, amount: paymentAmount, commission: settlementCommission, lateCommission: 0, paymentMethod, wallet: settlementWallet._id, ownerType: settlementWallet.ownerType, owner: settlementWallet.owner, phoneNumber: settlementWallet.phoneNumber, paidAt: now, createdBy: userId } },
        ...(remainingAfter === 0 ? { $set: { settledAt: now } } : {}),
      }, { new: true, session, runValidators: true });
      if (!updated) throw ApiError.conflict("تم تحديث السداد بطلب آخر. راجع الرصيد المتبقي.");
      await TransactionSettlementRequest.create([{ transaction: transactionId, idempotencyKey: normalizedKey, amount: paymentAmount, commission: settlementCommission, paymentMethod, wallet: settlementWallet._id, ownerType: settlementWallet.ownerType, owner: settlementWallet.owner, phoneNumber: settlementWallet.phoneNumber, paymentId, lateCommission: 0, daysLate: 0, createdBy: userId }], { session });
      result = { transaction: updated, payment: { amount: paymentAmount, commission: settlementCommission, lateCommission: 0, daysLate: 0, paymentMethod, walletId: settlementWallet._id }, idempotentReplay: false };
    });
    return result;
  } catch (error) {
    if (error?.code === 11000) { const existing = await TransactionSettlementRequest.findOne({ transaction: transactionId, idempotencyKey: normalizedKey }).lean(); if (existing) { const tx = await Transaction.findById(transactionId); return { transaction: tx, payment: { amount: existing.amount, commission: existing.commission || 0, lateCommission: existing.lateCommission || 0, daysLate: existing.daysLate, paymentMethod: existing.paymentMethod, walletId: existing.wallet }, idempotentReplay: true }; } }
    throw error;
  } finally { await session.endSession(); }
}

async function applyWalletEffects({ ownerType, ownerId, selectedWallet, walletDelta, liquidityDelta, session }) {
  const ownerFilter = ownerType === "User" ? { ownerType: "User", owner: ownerId } : { partner: ownerId };
  const wallets = await Wallet.find(ownerFilter).session(session);
  const selected = wallets.find((wallet) => String(wallet._id) === String(selectedWallet._id));
  if (!selected) throw ApiError.badRequest("محفظة العملية لا تتبع المالك المحدد.");
  const updates = new Map();
  let remainingDebit = Math.max(0, -liquidityDelta);
  if (remainingDebit > 0) {
    for (const wallet of [selected, ...wallets.filter((item) => String(item._id) !== String(selected._id))]) {
      const used = Math.min(wallet.liquidityBalance || 0, remainingDebit);
      if (used > 0) {
        updates.set(String(wallet._id), (wallet.liquidityBalance || 0) - used);
        remainingDebit -= used;
      }
      if (remainingDebit === 0) break;
    }
    if (remainingDebit > 0) throw ApiError.badRequest("السيولة المشتركة غير كافية لتعديل العملية.");
  }
  const selectedLiquidity = (updates.has(String(selected._id)) ? updates.get(String(selected._id)) : selected.liquidityBalance || 0) + Math.max(0, liquidityDelta);
  const selectedBalance = (selected.walletBalance || 0) + walletDelta;
  if (selectedBalance < 0) throw ApiError.badRequest("رصيد المحفظة غير كافٍ لتعديل العملية.");
  updates.set(String(selected._id), selectedLiquidity);
  for (const [walletId, liquidityBalance] of updates) {
    await Wallet.updateOne(
      { _id: walletId },
      { $set: { liquidityBalance, ...(walletId === String(selected._id) ? { walletBalance: selectedBalance } : {}) }, $inc: { __v: 1 } },
      { session }
    );
  }
  return { walletBalanceAfter: selectedBalance, liquidityBalanceAfter: selectedLiquidity };
}

export async function updateTransaction(transactionId, userId, update, idempotencyKey) {
  const normalizedKey = String(idempotencyKey || "").trim();
  if (normalizedKey.length < 8 || normalizedKey.length > 128) throw ApiError.badRequest("يجب إرسال Idempotency-Key صالح للتعديل.");
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existing = await TransactionReversalRequest.findOne({ idempotencyKey: normalizedKey }).session(session).lean();
      if (existing) {
        if (String(existing.originalTransaction) !== String(transactionId) || existing.operation !== "update") throw ApiError.conflict("مفتاح التعديل مستخدم بالفعل مع عملية أخرى.");
        result = { transaction: await Transaction.findById(transactionId).session(session), replay: true };
        return;
      }
      const original = await Transaction.findById(transactionId).session(session);
      if (!original) throw ApiError.notFound("العملية الأصلية غير موجودة.");
      if (original.reversalOf || original.correctionOf || original.reversedAt || original.reversalTransaction || original.correctedTransaction) throw ApiError.conflict("لا يمكن تعديل عملية عولجت من قبل.");
      if ((original.paidAmount || 0) !== 0 || (original.payments || []).length > 0) throw ApiError.badRequest("لا يمكن تعديل عملية لها سداد سابق.");

      const ownerType = update.ownerType || original.ownerType;
      const ownerId = update.ownerId || update.partnerId || original.owner || original.partner;
      const channel = update.channel || original.channel;
      const phoneNumber = update.phoneNumber || original.phoneNumber;
      if (!ownerId) throw ApiError.badRequest("صاحب الحساب المالي مطلوب.");
      const ownerModel = ownerType === "User" ? User : Partner;
      const owner = await ownerModel.findById(ownerId).select("isActive phoneNumbers").session(session).lean();
      if (!owner) throw ApiError.notFound("صاحب الحساب المالي غير موجود.");
      if (owner.isActive === false) throw ApiError.badRequest("صاحب الحساب المالي غير نشط.");
      if (!owner.phoneNumbers?.includes(phoneNumber)) throw ApiError.badRequest("الرقم/الشريحة غير تابع لصاحب الحساب المختار.");
      const walletFilter = ownerType === "User" ? { ownerType: "User", owner: ownerId, channel, phoneNumber } : { partner: ownerId, channel, phoneNumber };
      const newWallet = await Wallet.findOne(walletFilter).session(session);
      if (!newWallet) throw ApiError.badRequest("المحفظة الجديدة غير موجودة.");
      const stage = update.targetStage || update.stage || original.stage;
      const amount = update.amount ?? original.amount;
      const commission = update.commission ?? original.commission ?? 0;
      const partyType = update.partyType || original.partyType;
      const partyId = update.partyId !== undefined ? update.partyId : original.partyId;
      const effects = calculateEffect({ stage, amount, commission });
      const before = original.toObject();
      const oldWallet = await Wallet.findById(original.wallet).session(session);
      if (!oldWallet) throw ApiError.notFound("محفظة العملية الأصلية غير موجودة.");
      await applyWalletEffects({ ownerType: original.ownerType, ownerId: original.owner || original.partner, selectedWallet: oldWallet, walletDelta: -original.walletEffect, liquidityDelta: -original.liquidityEffect, session });
      const balances = await applyWalletEffects({ ownerType, ownerId, selectedWallet: newWallet, walletDelta: effects.walletEffect, liquidityDelta: effects.liquidityEffect, session });
      const now = new Date();
      const updated = await Transaction.findOneAndUpdate(
        { _id: original._id, __v: original.__v, paidAmount: 0, payments: { $size: 0 } },
        { $set: { ...(ownerType === "Partner" ? { partner: ownerId } : {}), ownerType, owner: ownerId, wallet: newWallet._id, channel, phoneNumber, partyType, partyId, stage, amount, commission, walletEffect: effects.walletEffect, liquidityEffect: effects.liquidityEffect, walletBalanceAfter: balances.walletBalanceAfter, liquidityBalanceAfter: balances.liquidityBalanceAfter, remainingAmount: amount, agreedDueAt: original.agreedDueAt, lateCommissionPerThousand: original.lateCommissionPerThousand || 0, notes: update.notes ?? original.notes, updatedBy: userId, updateReason: update.reason || "تعديل العملية", updatedAt: now }, ...(ownerType === "User" ? { $unset: { partner: 1 } } : {}), $inc: { __v: 1 } },
        { new: true, session, runValidators: true }
      );
      if (!updated) throw ApiError.conflict("تم تعديل العملية بطلب آخر.");
      const after = updated.toObject();
      const auditEntry = { idempotencyKey: normalizedKey, before, after, reason: update.reason, updatedAt: now, createdBy: userId };
      await TransactionReversalRequest.findOneAndUpdate(
        { originalTransaction: original._id, operation: "update" },
        {
          $set: {
            idempotencyKey: normalizedKey,
            updatedTransaction: updated._id,
            before,
            after,
            reason: update.reason,
            createdBy: userId,
          },
          $push: { history: auditEntry },
          $setOnInsert: { originalTransaction: original._id, operation: "update" },
        },
        { session, upsert: true, new: true, setDefaultsOnInsert: true }
      );
      result = { transaction: updated, replay: false };
    });
    return result;
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await TransactionReversalRequest.findOne({ idempotencyKey: normalizedKey, operation: "update" }).lean();
      if (existing) return { transaction: await Transaction.findById(transactionId), replay: true };
    }
    throw error;
  } finally { await session.endSession(); }
}

export async function reverseTransaction(transactionId, userId, reason, idempotencyKey, targetStage, correction = {}) {
  const normalizedKey = String(idempotencyKey || "").trim();
  const normalizedReason = String(reason || correction.reason || "").trim();
  if (normalizedKey.length < 8 || normalizedKey.length > 128) throw ApiError.badRequest("يجب إرسال Idempotency-Key صالح للإجراء.");
  const isCorrection = Boolean(targetStage || Object.keys(correction).some((key) => ["stage", "amount", "commission", "ownerType", "ownerId", "partnerId", "phoneNumber", "channel", "partyType", "partyId", "notes"].includes(key)));
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existing = await TransactionReversalRequest.findOne({ idempotencyKey: normalizedKey }).session(session).lean();
      if (existing) { if (String(existing.originalTransaction) !== String(transactionId)) throw ApiError.conflict("مفتاح الإجراء مستخدم بالفعل مع عملية أخرى."); const reversal = await Transaction.findById(existing.reversalTransaction).session(session); const corrected = existing.correctedTransaction ? await Transaction.findById(existing.correctedTransaction).session(session) : null; result = { originalTransaction: transactionId, reversalTransaction: reversal, correctedTransaction: corrected, replay: true }; return; }
      const original = await Transaction.findById(transactionId).session(session);
      if (!original) throw ApiError.notFound("العملية الأصلية غير موجودة.");
      if (original.reversalOf || original.reversedAt || original.reversalTransaction) throw ApiError.conflict("تم التعامل مع هذه العملية من قبل.");
      if (isCorrection && ((original.paidAmount || 0) > 0 || (original.payments || []).length > 0)) throw ApiError.badRequest("لا يمكن تصحيح عملية لها تسويات سابقة؛ اعكسها أو أنشئ عملية جديدة.");
      const reverseStage = REVERSE_STAGE[original.stage]; if (!reverseStage) throw ApiError.badRequest("مرحلة العملية لا تدعم العكس.");
      const newStage = targetStage || correction.stage;
      if (newStage && newStage === original.stage) throw ApiError.badRequest("المرحلة الجديدة يجب أن تكون مختلفة عن المرحلة الحالية.");
      if (newStage && !REVERSE_STAGE[newStage]) throw ApiError.badRequest("المرحلة الجديدة غير مدعومة.");
      const oldWallet = await Wallet.findById(original.wallet).session(session); if (!oldWallet) throw ApiError.notFound("محفظة العملية الأصلية غير موجودة.");
      const oldOwnerFilter = original.ownerType === "User" ? { ownerType: "User", owner: original.owner } : { partner: original.owner || original.partner };
      const oldWallets = await Wallet.find(oldOwnerFilter).session(session);
      const debit = Math.max(0, original.liquidityEffect); const credit = Math.max(0, -original.liquidityEffect);
      let left = debit; const updates = new Map();
      for (const w of [oldWallet, ...oldWallets.filter((x) => String(x._id) !== String(oldWallet._id))]) { const used = Math.min(w.liquidityBalance || 0, left); if (used) { updates.set(String(w._id), (w.liquidityBalance || 0) - used); left -= used; } if (!left) break; }
      if (left) throw ApiError.badRequest("لا يمكن العكس لأن السيولة الحالية لا تسمح بإرجاع تأثير العملية.");
      updates.set(String(oldWallet._id), (updates.get(String(oldWallet._id)) ?? oldWallet.liquidityBalance) + credit);
      const reversedWalletBalance = oldWallet.walletBalance - original.walletEffect;
      if (reversedWalletBalance < 0) throw ApiError.badRequest("رصيد المحفظة الحالي لا يسمح بإرجاع تأثير العملية.");
      await Wallet.updateOne({ _id: oldWallet._id }, { $set: { walletBalance: reversedWalletBalance, liquidityBalance: updates.get(String(oldWallet._id)) }, $inc: { __v: 1 } }, { session });
      for (const [id, value] of updates) if (id !== String(oldWallet._id)) await Wallet.updateOne({ _id: id }, { $set: { liquidityBalance: value }, $inc: { __v: 1 } }, { session });
      const reversal = (await Transaction.create([{ referenceNumber: createReferenceNumber(), ...(original.partner && { partner: original.partner }), ownerType: original.ownerType, owner: original.owner, wallet: original.wallet, channel: original.channel, phoneNumber: original.phoneNumber, partyType: original.partyType, partyId: original.partyId, stage: reverseStage, amount: original.amount, commission: 0, walletEffect: -original.walletEffect, liquidityEffect: -original.liquidityEffect, walletBalanceAfter: reversedWalletBalance, liquidityBalanceAfter: updates.get(String(oldWallet._id)), remainingAmount: 0, notes: normalizedReason || "عكس العملية الأصلية", createdBy: userId, reversalOf: original._id }], { session }))[0];
      let corrected = null;
      if (isCorrection) {
        const ownerType = correction.ownerType || original.ownerType; const ownerId = correction.ownerId || correction.partnerId || original.owner || original.partner; const channel = correction.channel || original.channel; const phoneNumber = correction.phoneNumber || original.phoneNumber;
        const walletFilter = ownerType === "User" ? { ownerType: "User", owner: ownerId, channel, phoneNumber } : { partner: ownerId, channel, phoneNumber };
        const newWallet = await Wallet.findOne(walletFilter).session(session); if (!newWallet) throw ApiError.badRequest("محفظة التصحيح غير موجودة.");
        const amount = correction.amount ?? original.amount; const commission = correction.commission ?? original.commission ?? 0; const stage = newStage || original.stage; const effects = calculateEffect({ stage, amount, commission });
        const newBalance = newWallet.walletBalance + effects.walletEffect; if (newBalance < 0) throw ApiError.badRequest("رصيد المحفظة غير كافٍ للتصحيح.");
        const newOwnerWallets = await Wallet.find(ownerType === "User" ? { ownerType: "User", owner: ownerId } : { partner: ownerId }).session(session);
        const liquidityUpdates = new Map();
        let remainingLiquidityDebit = Math.max(0, -effects.liquidityEffect);
        if (remainingLiquidityDebit > 0) {
          for (const sourceWallet of [newWallet, ...newOwnerWallets.filter((item) => String(item._id) !== String(newWallet._id))]) {
            const used = Math.min(sourceWallet.liquidityBalance || 0, remainingLiquidityDebit);
            if (used > 0) {
              liquidityUpdates.set(String(sourceWallet._id), (sourceWallet.liquidityBalance || 0) - used);
              remainingLiquidityDebit -= used;
            }
            if (remainingLiquidityDebit === 0) break;
          }
          if (remainingLiquidityDebit > 0) throw ApiError.badRequest("السيولة المشتركة غير كافية للتصحيح.");
        }
        const selectedLiquidityAfter = (liquidityUpdates.has(String(newWallet._id)) ? liquidityUpdates.get(String(newWallet._id)) : newWallet.liquidityBalance) + Math.max(0, effects.liquidityEffect);
        liquidityUpdates.set(String(newWallet._id), selectedLiquidityAfter);
        for (const [walletId, liquidityAfter] of liquidityUpdates) {
          await Wallet.updateOne({ _id: walletId }, { $set: { liquidityBalance: liquidityAfter, ...(walletId === String(newWallet._id) ? { walletBalance: newBalance } : {}) }, $inc: { __v: 1 } }, { session });
        }
        const newLiquidity = selectedLiquidityAfter;
        corrected = (await Transaction.create([{ referenceNumber: createReferenceNumber(), ...(ownerType === "Partner" && { partner: ownerId }), ownerType, owner: ownerId, wallet: newWallet._id, channel, phoneNumber, partyType: correction.partyType || original.partyType, partyId: correction.partyId ?? original.partyId, stage, amount, commission, walletEffect: effects.walletEffect, liquidityEffect: effects.liquidityEffect, walletBalanceAfter: newBalance, liquidityBalanceAfter: newLiquidity, agreedDueAt: original.agreedDueAt, lateCommissionPerThousand: original.lateCommissionPerThousand || 0, remainingAmount: amount, notes: correction.notes ?? normalizedReason ?? "تصحيح للعملية الأصلية", createdBy: userId, correctionOf: original._id }], { session }))[0];
      }
      await Transaction.updateOne({ _id: original._id }, { $set: { reversedAt: new Date(), reversalTransaction: reversal._id, ...(corrected && { correctedTransaction: corrected._id, correctionStage: corrected.stage }), ...(normalizedReason && { reversalReason: normalizedReason }), reversedBy: userId } }, { session });
      await TransactionReversalRequest.create([{ idempotencyKey: normalizedKey, originalTransaction: original._id, reversalTransaction: reversal._id, correctedTransaction: corrected?._id, targetStage: newStage, correction: isCorrection ? correction : undefined, reason: normalizedReason, createdBy: userId }], { session });
      result = { originalTransaction: original._id, reversalTransaction: reversal, correctedTransaction: corrected, replay: false };
    }); return result;
  } catch (error) { if (error?.code === 11000) { const existing = await TransactionReversalRequest.findOne({ idempotencyKey: normalizedKey }).lean(); if (existing) return { originalTransaction: transactionId, reversalTransaction: await Transaction.findById(existing.reversalTransaction), correctedTransaction: existing.correctedTransaction ? await Transaction.findById(existing.correctedTransaction) : null, replay: true }; } throw error; }
  finally { await session.endSession(); }
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
