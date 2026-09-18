import * as debtService from "./debt.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";

/**
 * POST /api/debts
 */
export const createDebtHandler = asyncHandler(async (req, res) => {
  const debt = await debtService.createDebt({
    ...req.body,
    userId: req.user._id,
  });
  return ApiResponse.created(res, "تم تسجيل الدين بنجاح.", debt);
});

/**
 * GET /api/debts
 */
export const listDebtsHandler = asyncHandler(async (req, res) => {
  const result = await debtService.listDebts(req.query);
  return ApiResponse.ok(res, "تم جلب الديون بنجاح.", result);
});

/**
 * GET /api/debts/:id
 */
export const getDebtHandler = asyncHandler(async (req, res) => {
  const debt = await debtService.getDebtById(req.params.id);
  return ApiResponse.ok(res, "تم جلب الدين بنجاح.", debt);
});

/**
 * POST /api/debts/:id/repay
 */
export const repayDebtHandler = asyncHandler(async (req, res) => {
  const payment = await debtService.repayDebt({
    debtId: req.params.id,
    ...req.body,
    userId: req.user._id,
  });
  return ApiResponse.created(res, "تم تسجيل السداد بنجاح.", payment);
});

/**
 * GET /api/debts/:id/payments
 */
export const listDebtPaymentsHandler = asyncHandler(async (req, res) => {
  const payments = await debtService.listDebtPayments(req.params.id);
  return ApiResponse.ok(res, "تم جلب سجل السداد بنجاح.", payments);
});

/**
 * POST /api/debts/:id/receipts
 * multipart/form-data — حقل الملفات اسمه "files"
 * الملفات بتتحفظ محليًا على السيرفر جوه /uploads/debts/
 */
export const uploadReceiptsHandler = asyncHandler(async (req, res) => {
  if (!req.files?.length) {
    throw ApiError.badRequest("لازم ترفع ملف واحد على الأقل.");
  }

  // بناء الرابط الكامل لكل ملف بناءً على عنوان السيرفر نفسه
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const urls = req.files.map((file) => `${baseUrl}/uploads/debts/${file.filename}`);

  const debt = await debtService.addReceipts(req.params.id, urls);
  return ApiResponse.ok(res, "تم رفع الإيصالات بنجاح.", debt);
});