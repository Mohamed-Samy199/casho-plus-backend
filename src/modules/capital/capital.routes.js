import { Router } from "express";
import * as capitalController from "./capital.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../../middlewares/role.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import validateQuery from "../../middlewares/validateQuery.middleware.js";
import {
  balanceAdjustmentSchema,
  balanceHistoryQuerySchema,
  myBalanceAdjustmentSchema,
  myBalanceHistoryQuerySchema,
} from "./capital.validation.js";

const router = Router();

// رأس المال الكلي معلومة حساسة — أدمن بس (زي ما اتفقنا: الموظف ميشوفش الأرباح الكاملة)
router.use(protect, isAdmin);

router.get("/summary", capitalController.getCapitalSummaryHandler);
router.get("/by-partner", capitalController.getCapitalByPartnerHandler);
router.get("/me", capitalController.getMyCapitalHandler);
router.post(
  "/me/balance-adjustments",
  validate(myBalanceAdjustmentSchema),
  capitalController.adjustMyBalanceHandler
);
router.get(
  "/me/balance-history",
  validateQuery(myBalanceHistoryQuerySchema),
  capitalController.getMyBalanceHistoryHandler
);
router.post(
  "/balance-adjustments",
  validate(balanceAdjustmentSchema),
  capitalController.adjustBalanceHandler
);
router.get(
  "/balance-history",
  validateQuery(balanceHistoryQuerySchema),
  capitalController.getBalanceHistoryHandler
);

export default router;