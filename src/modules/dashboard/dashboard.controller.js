import * as dashboardService from "./dashboard.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

/**
 * GET /api/dashboard
 * Protected — المحتوى بيختلف حسب دور المستخدم (أدمن/موظف)
 */
export const getDashboardHandler = asyncHandler(async (req, res) => {
  const dashboard = await dashboardService.getDashboard(req.user);
  return ApiResponse.ok(res, "تم جلب بيانات لوحة التحكم بنجاح.", dashboard);
});