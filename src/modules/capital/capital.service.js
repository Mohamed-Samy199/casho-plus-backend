import Wallet from "../../models/Wallet.model.js";
import Debt from "../../models/Debt.model.js";
import { DebtDirection, DebtStatus } from "../../utils/common/index.js";

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