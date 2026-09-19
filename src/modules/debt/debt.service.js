import mongoose from "mongoose";
import Debt from "../../models/Debt.model.js";
import DebtPayment from "../../models/DebtPayment.model.js";
import Wallet from "../../models/Wallet.model.js";
import Client from "../../models/Client.model.js";
import Partner from "../../models/Partner.model.js";
import { DebtStatus, DebtDirection, BalanceType } from "../../utils/common/index.js";
import { ApiError } from "../../utils/ApiError.js";
import { create, findById, paginate } from "../../db/database.repository.js";

export async function createDebt({
  partyType,
  partyId,
  direction,
  amount,
  description,
  dueDate,
  userId,
}) {
  const partyModel = partyType === "Client" ? Client : Partner;
  const party = await partyModel.findById(partyId).select("_id").lean();
  if (!party) {
    throw ApiError.notFound(
      partyType === "Client" ? "العميل المرتبط بالدين غير موجود." : "الشريك المرتبط بالدين غير موجود."
    );
  }

  return create({
    model: Debt,
    data: {
      partyType,
      partyId,
      direction,
      amount,
      remainingAmount: amount,
      description,
      dueDate,
      createdBy: userId,
    },
  });
}

export async function listDebts({
  partyType,
  partyId,
  direction,
  status,
  page = "all",
  size = 20,
}) {
  const filter = {};
  if (partyType) filter.partyType = partyType;
  if (partyId) filter.partyId = partyId;
  if (direction) filter.direction = direction;
  if (status) filter.status = status;

  return paginate({
    model: Debt,
    filter,
    page,
    size,
    options: { sort: { createdAt: -1 }, lean: true },
  });
}

export async function getDebtById(id) {
  const debt = await findById({ model: Debt, id });
  if (!debt) throw ApiError.notFound("الدين غير موجود.");
  return debt;
}

/**
 * تسديد جزئي أو كامل لدين — بيتسجل في DebtPayment كسجل تدقيق (ledger)
 * ويحدّث remainingAmount + status على Debt بنفس المعاملة (atomic)
 *
 * مرن في حالتين:
 * 1) affectsCapital = false (الديفولت) → السداد بيتسجل كـ "حصل" فقط،
 *    من غير ما يأثر على أي رصيد فعلي (فلوس شخصية بره رأس مال الشغل)
 * 2) affectsCapital = true → لازم partnerId + channel + balanceType،
 *    والسداد بيأثر فعليًا على رصيد سيولة/محفظة الشريك المحدد:
 *    - دين "عليا" (owed_by_me): بيدفع من رأس المال → الرصيد يقل
 *    - دين "ليا" (owed_to_me): بيدخل رأس المال → الرصيد يزيد
 */
export async function repayDebt({
  debtId,
  amount,
  notes,
  userId,
  affectsCapital = false,
  partnerId,
  channel,
  phoneNumber,
  balanceType,
}) {
  if (affectsCapital && (!partnerId || !channel || !phoneNumber || !balanceType)) {
    throw ApiError.badRequest(
      "لازم تحدد الشريك والوسيلة والرقم ونوع الرصيد لو السداد هيأثر على رأس المال."
    );
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const debt = await Debt.findById(debtId).session(session);
      if (!debt) throw ApiError.notFound("الدين غير موجود.");
      if (debt.status === DebtStatus.SETTLED) {
        throw ApiError.badRequest("هذا الدين تم تسديده بالكامل بالفعل.");
      }
      if (amount > debt.remainingAmount) {
        throw ApiError.badRequest("قيمة السداد أكبر من المتبقي على الدين.");
      }

      let walletEffectInfo = null;

      if (affectsCapital) {
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

        // دين عليا → بيقل الرصيد (بدفعه من عندي). دين ليا → بيزيد الرصيد (بحصله).
        const sign = debt.direction === DebtDirection.OWED_BY_ME ? -1 : 1;
        const field =
          balanceType === BalanceType.LIQUIDITY ? "liquidityBalance" : "walletBalance";

        const newValue = wallet[field] + sign * amount;
        if (newValue < 0) {
          throw ApiError.badRequest("الرصيد غير كافٍ لإتمام هذا السداد.");
        }

        await Wallet.updateOne({ _id: wallet._id }, { [field]: newValue }, { session });

        walletEffectInfo = {
          wallet: wallet._id,
          balanceType,
          balanceAfter: newValue,
        };
      }

      const remainingAfter = debt.remainingAmount - amount;
      const isSettled = remainingAfter === 0;

      await Debt.updateOne(
        { _id: debt._id },
        {
          remainingAmount: remainingAfter,
          status: isSettled ? DebtStatus.SETTLED : DebtStatus.OPEN,
          ...(isSettled && { settledAt: new Date() }),
        },
        { session }
      );

      const [payment] = await DebtPayment.create(
        [
          {
            debt: debt._id,
            amount,
            remainingAfter,
            notes,
            affectsCapital,
            ...(walletEffectInfo && {
              wallet: walletEffectInfo.wallet,
              balanceType: walletEffectInfo.balanceType,
              balanceAfter: walletEffectInfo.balanceAfter,
            }),
            createdBy: userId,
          },
        ],
        { session }
      );

      result = payment;
    });
    return result;
  } finally {
    session.endSession();
  }
}

export async function listDebtPayments(debtId) {
  return DebtPayment.find({ debt: debtId }).sort({ createdAt: -1 }).lean();
}

/**
 * إضافة إيصالات/مستندات إثبات لدين موجود
 */
export async function addReceipts(debtId, urls) {
  const debt = await Debt.findByIdAndUpdate(
    debtId,
    { $push: { receiptUrls: { $each: urls } } },
    { new: true }
  );
  if (!debt) throw ApiError.notFound("الدين غير موجود.");
  return debt;
}
