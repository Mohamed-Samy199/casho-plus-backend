import * as transactionService from "./transaction.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

/**
 * POST /api/transactions
 * Protected (admin + employee)
 */
export const createTransactionHandler = asyncHandler(async (req, res) => {
  const transaction = await transactionService.createTransaction({
    ...req.body,
    userId: req.user._id,
  });
  return ApiResponse.created(res, "تم تسجيل العملية بنجاح.", transaction);
});

/**
 * GET /api/transactions
 * Protected (admin + employee)
 */
export const listTransactionsHandler = asyncHandler(async (req, res) => {
  const result = await transactionService.listTransactions(req.query);
  return ApiResponse.ok(res, "تم جلب العمليات بنجاح.", result);
});

/**
 * GET /api/transactions/:id
 * Protected (admin + employee)
 */
export const getTransactionHandler = asyncHandler(async (req, res) => {
  const transaction = await transactionService.getTransactionById(req.params.id);
  return ApiResponse.ok(res, "تم جلب العملية بنجاح.", transaction);
});