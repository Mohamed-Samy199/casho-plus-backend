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
    idempotencyKey: req.get("Idempotency-Key"),
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

export const settleTransactionHandler = asyncHandler(async (req, res) => {
  const result = await transactionService.settleTransaction(
    req.params.id,
    req.body.amount,
    req.user._id,
    req.get("Idempotency-Key")
  );
  return ApiResponse.ok(res, "تم تسجيل السداد بنجاح.", result);
});
 
export const reverseTransactionHandler = asyncHandler(async (req, res) => {
  const result = await transactionService.reverseTransaction(
    req.params.id,
    req.user._id,
    req.body.reason,
    req.get("Idempotency-Key")
  );
  return ApiResponse.created(res, "تم عكس العملية وتسجيل القيد المقابل.", result);
});

export const correctTransactionHandler = asyncHandler(async (req, res) => {
  const result = await transactionService.reverseTransaction(
    req.params.id,
    req.user._id,
    req.body.reason,
    req.get("Idempotency-Key"),
    req.body.targetStage
  );
  return ApiResponse.created(res, "تم تصحيح العملية وتسجيل القيود المرتبطة.", result);
});
