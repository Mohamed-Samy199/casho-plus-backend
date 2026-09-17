import CommissionRule from "../../models/CommissionRule.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { findOne, find, findOneAndUpdate } from "../../db/database.repository.js";

/**
 * بيرجع قيمة العمولة الافتراضية لقناة/مرحلة معينة ومبلغ معين.
 * لو مفيش قاعدة متسجلة، بيرجع 0 (مفيش عمولة افتراضية).
 */
export async function resolveDefaultCommission({ channel, stage, amount }) {
  const rule = await findOne({
    model: CommissionRule,
    filter: { channel, stage, isActive: true },
    options: { lean: true },
  });

  if (!rule) return 0;

  if (rule.type === "flat") return rule.flatAmount;

  // proportional
  if (rule.proportionalThreshold > 0 && amount >= rule.proportionalThreshold) {
    return Math.round((amount / 100000) * rule.proportionalRate);
  }
  return rule.flatAmount;
}

export async function listCommissionRules({ channel } = {}) {
  const filter = {};
  if (channel) filter.channel = channel;
  return find({ model: CommissionRule, filter, options: { sort: { channel: 1, stage: 1 } } });
}

export async function upsertCommissionRule(data, userId) {
  const { channel, stage } = data;
  const rule = await findOneAndUpdate({
    model: CommissionRule,
    filter: { channel, stage },
    update: { ...data, updatedBy: userId },
    options: { upsert: true, lean: true },
  });
  if (!rule) throw ApiError.internal("حدث خطأ أثناء حفظ قاعدة العمولة.");
  return rule;
}