import * as attendanceService from "./attendance.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { UserRole } from "../../utils/common/index.js";
import { ApiError } from "../../utils/ApiError.js";

export const checkInHandler = asyncHandler(async (req, res) => {
  const record = await attendanceService.checkIn(req.user._id);
  return ApiResponse.created(res, "تم تسجيل الحضور بنجاح.", record);
});

export const checkOutHandler = asyncHandler(async (req, res) => {
  const record = await attendanceService.checkOut(req.user._id);
  return ApiResponse.ok(res, "تم تسجيل الانصراف بنجاح.", record);
});

export const getTodayStatusHandler = asyncHandler(async (req, res) => {
  const record = await attendanceService.getTodayStatus(req.user._id);
  return ApiResponse.ok(res, "تم جلب حالة اليوم بنجاح.", record);
});

/**
 * GET /api/attendance
 * الموظف يشوف سجله هو بس، الأدمن يقدر يشوف سجل أي حد
 */
export const listAttendanceHandler = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === UserRole.ADMIN;
  const userId = isAdmin ? req.query.userId : req.user._id;

  const result = await attendanceService.listAttendance({ ...req.query, userId });
  return ApiResponse.ok(res, "تم جلب سجل الحضور بنجاح.", result);
});

/**
 * PUT /api/attendance/manual
 * أدمن بس — إضافة/تعديل سجل حضور لموظف نسي يسجل
 */
export const adminUpsertAttendanceHandler = asyncHandler(async (req, res) => {
  const record = await attendanceService.adminUpsertAttendance(req.body, req.user._id);
  return ApiResponse.ok(res, "تم حفظ سجل الحضور بنجاح.", record);
});

/**
 * GET /api/attendance/monthly-report?year=2026&month=9
 * أدمن بس
 */
export const getMonthlyReportHandler = asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    throw ApiError.badRequest("السنة والشهر مطلوبين.");
  }
  const report = await attendanceService.getMonthlyReport({
    year: Number(year),
    month: Number(month),
  });
  return ApiResponse.ok(res, "تم جلب التقرير الشهري بنجاح.", report);
});