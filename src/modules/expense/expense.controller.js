import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import * as service from "./expense.service.js";

export const listAccountsHandler = asyncHandler(async (_req, res) =>
  ApiResponse.ok(res, "تم جلب الحسابات والمحافظ بنجاح.", await service.listAccounts())
);

export const listExpensesHandler = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, "تم جلب سجل المصروفات بنجاح.", await service.listExpenses(req.query))
);

export const createExpenseHandler = asyncHandler(async (req, res) =>
  ApiResponse.created(res, "تم تسجيل المصروف بنجاح.", await service.createExpense({ ...req.body, userId: req.user._id }))
);

export const repayAdvanceHandler = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, "تم تسجيل رد السُلفة بنجاح.", await service.repayAdvance({ expenseId: req.params.id, ...req.body, userId: req.user._id }))
);

export const sellAssetHandler = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, "تم تسجيل بيع الأصل وإضافة قيمته للرصيد.", await service.sellAsset({ expenseId: req.params.id, ...req.body, userId: req.user._id }))
);
