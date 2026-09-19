import mongoose from "mongoose";
import Wallet from "../../models/Wallet.model.js";
import Partner from "../../models/Partner.model.js";
import Debt from "../../models/Debt.model.js";
import BalanceAdjustment from "../../models/BalanceAdjustment.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { Channel, DebtDirection, DebtStatus } from "../../utils/common/index.js";

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

  const totalLiquidity = walletsAgg[0]?.totalLiquidity || 0;
  const totalWalletBalance = walletsAgg[0]?.totalWalletBalance || 0;

  const debtsAgg = await Debt.aggregate([
    { $match: { status: DebtStatus.OPEN } },
    { $group: { _id: "$direction", total: { $sum: "$remainingAmount" } } },
  ]);

  const owedToMe = debtsAgg.find((d) => d._id === DebtDirection.OWED_TO_ME)?.total || 0;
  const owedByMe = debtsAgg.find((d) => d._id === DebtDirection.OWED_BY_ME)?.total || 0;
  const netDebts = owedToMe - owedByMe;

  const totalCapital = totalLiquidity + totalWalletBalance + netDebts;
  const outsideCapital = totalWalletBalance + owedToMe;

  return {
    totalCapital,
    readyLiquidity: totalLiquidity,
    outsideCapital,
    breakdown: {
      totalWalletBalance,
      owedToMe,
      owedByMe,
      netDebts,
    },
  };
}

/**
 * تفاصيل رأس المال مقسّمة لكل شريك، ولكل رقم/شريحة على حدة
 */
export async function getCapitalByPartner() {
  const wallets = await Wallet.find().populate("partner", "name phoneNumbers").lean();

  const byPartner = new Map();

  for (const wallet of wallets) {
    const partnerId = wallet.partner?._id?.toString();
    if (!partnerId) continue;

    if (!byPartner.has(partnerId)) {
      byPartner.set(partnerId, {
        partner: wallet.partner,
        totalLiquidity: 0,
        totalWalletBalance: 0,
        lines: [],
      });
    }

    const entry = byPartner.get(partnerId);
    entry.lines.push({
      channel: wallet.channel,
      phoneNumber: wallet.phoneNumber,
      liquidityBalance: wallet.liquidityBalance,
      walletBalance: wallet.walletBalance,
    });
    entry.totalLiquidity += wallet.liquidityBalance;
    entry.totalWalletBalance += wallet.walletBalance;
  }

  return Array.from(byPartner.values());
}

/**
 * تعيين الرصيد الافتتاحي لرقم شريك.
 * القيم هنا بالقرش، والعملية متاحة للأدمن فقط من خلال الـ route.
 */
export async function adjustBalance({
  partnerId,
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
  const partner = await Partner.findById(partnerId).lean();
  if (!partner) throw ApiError.notFound("الشريك غير موجود.");
  if (!partner.phoneNumbers?.includes(phoneNumber)) {
    throw ApiError.badRequest("رقم التلفون غير تابع لهذا الشريك.");
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      let wallet = await Wallet.findOne({ partner: partnerId, channel, phoneNumber }).session(
        session
      );
      if (!wallet) {
        wallet = new Wallet({ partner: partnerId, channel, phoneNumber });
      }

      const liquidityBefore = wallet.liquidityBalance || 0;
      const walletBefore = wallet.walletBalance || 0;
      const hasPreviousHistory = await BalanceAdjustment.exists({
        partner: partnerId,
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
            partner: partnerId,
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