import * as capitalService from "./capital.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

/**
 * GET /api/capital/summary
 * Admin only
 */
export const getCapitalSummaryHandler = asyncHandler(async (req, res) => {
  const summary = await capitalService.getCapitalSummary();
  return ApiResponse.ok(res, "تم جلب ملخص رأس المال بنجاح.", summary);
});

/**
 * GET /api/capital/by-partner
 * Admin only
 */
export const getCapitalByPartnerHandler = asyncHandler(async (req, res) => {
  const breakdown = await capitalService.getCapitalByPartner();
  return ApiResponse.ok(res, "تم جلب تفاصيل رأس المال لكل شريك بنجاح.", breakdown);
});

export const adjustBalanceHandler = asyncHandler(async (req, res) => {
  const result = await capitalService.adjustBalance({
    ...req.body,
    userId: req.user._id,
  });
  return ApiResponse.ok(res, "تم تعديل الرصيد وتسجيل العملية بنجاح.", result);
});

export const getBalanceHistoryHandler = asyncHandler(async (req, res) => {
  const history = await capitalService.getBalanceHistory(req.query);
  return ApiResponse.ok(res, "تم جلب سجل تعديلات الأرصدة بنجاح.", history);
});

export const getMyCapitalHandler = asyncHandler(async (req, res) => {
  const summary = await capitalService.getMyCapital(req.user._id);
  return ApiResponse.ok(res, "تم جلب رصيدك المالي بنجاح.", summary);
});

export const adjustMyBalanceHandler = asyncHandler(async (req, res) => {
  const result = await capitalService.adjustBalance({
    ...req.body,
    ownerType: "User",
    ownerId: req.user._id,
    userId: req.user._id,
  });
  return ApiResponse.ok(res, "تم إضافة الرصيد إلى حسابك بنجاح.", result);
});

export const getMyBalanceHistoryHandler = asyncHandler(async (req, res) => {
  const history = await capitalService.getMyBalanceHistory(req.user._id, req.query.limit);
  return ApiResponse.ok(res, "تم جلب سجل رصيدك المالي بنجاح.", history);
});