import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import * as service from "./internal-transfer.service.js";

export const listAccountsHandler = asyncHandler(async (_req, res) => {
  return ApiResponse.ok(res, "تم جلب الحسابات والمحافظ بنجاح.", await service.listAccounts());
});

export const listTransfersHandler = asyncHandler(async (req, res) => {
  return ApiResponse.ok(res, "تم جلب التحويلات بنجاح.", await service.listTransfers(req.query));
});

export const createTransferHandler = asyncHandler(async (req, res) => {
  const transfer = await service.createTransfer({ ...req.body, userId: req.user._id });
  return ApiResponse.created(res, "تم تنفيذ التحويل الداخلي بنجاح.", transfer);
});
