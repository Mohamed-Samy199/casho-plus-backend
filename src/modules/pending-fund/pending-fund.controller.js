import * as pendingFundService from "./pending-fund.service.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";

export const listPendingFundsHandler = asyncHandler(async (req, res) =>
  ApiResponse.ok(
    res,
    "تم جلب الأموال المعلقة.",
    await pendingFundService.listPendingFunds(req.query),
  ),
);
export const createPendingFundHandler = asyncHandler(async (req, res) =>
  ApiResponse.created(
    res,
    "تم تسجيل المبلغ كأموال معلقة.",
    await pendingFundService.createPendingFund({
      ...req.body,
      userId: req.user._id,
    }),
  ),
);
export const returnPendingFundHandler = asyncHandler(async (req, res) =>
  ApiResponse.ok(
    res,
    "تم تسجيل إرجاع المبلغ وتحديث الرصيد.",
    await pendingFundService.returnPendingFund({
      id: req.params.id,
      ...req.body,
      userId: req.user._id,
    }),
  ),
);
export const writeOffPendingFundHandler = asyncHandler(async (req, res) =>
  ApiResponse.ok(
    res,
    "تم اعتبار المبلغ غير قابل للاسترداد.",
    await pendingFundService.writeOffPendingFund({
      id: req.params.id,
      ...req.body,
    }),
  ),
);
