import mongoose from "mongoose";
import Wallet from "../../models/Wallet.model.js";
import Partner from "../../models/Partner.model.js";
import User from "../../models/User.model.js";
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
        wallet = new Wallet({
          ...(ownerType === "User"
            ? { ownerType: "User", owner: actualOwnerId }
            : { partner: actualOwnerId, ownerType: "Partner" }),
          channel,
          phoneNumber,
        });
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
              : { partner: actualOwnerId }),
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

export async function getMyCapital(userId) {
  const wallets = await Wallet.find({ ownerType: "User", owner: userId }).lean();
  return wallets.reduce(
    (summary, wallet) => ({
      liquidity: summary.liquidity + wallet.liquidityBalance,
      walletBalance: summary.walletBalance + wallet.walletBalance,
      lines: [
        ...summary.lines,
        {
          channel: wallet.channel,
          phoneNumber: wallet.phoneNumber,
          liquidityBalance: wallet.liquidityBalance,
          walletBalance: wallet.walletBalance,
        },
      ],
    }),
    { liquidity: 0, walletBalance: 0, lines: [] }
  );
}

export async function getMyBalanceHistory(userId, limit = 100) {
  return BalanceAdjustment.find({ ownerType: "User", owner: userId })
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .lean();
}