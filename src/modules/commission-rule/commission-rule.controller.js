import * as commissionRuleService from "./commission-rule.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

/**
 * GET /api/commission-rules
 */
export const listCommissionRulesHandler = asyncHandler(async (req, res) => {
  const rules = await commissionRuleService.listCommissionRules(req.query);
  return ApiResponse.ok(res, "تم جلب قواعد العمولة بنجاح.", rules);
});

/**
 * PUT /api/commission-rules
 * (Upsert — إنشاء أو تعديل قاعدة عمولة لقناة/مرحلة معينة)
 */
export const upsertCommissionRuleHandler = asyncHandler(async (req, res) => {
  const rule = await commissionRuleService.upsertCommissionRule(req.body, req.user._id);
  return ApiResponse.ok(res, "تم حفظ قاعدة العمولة بنجاح.", rule);
});