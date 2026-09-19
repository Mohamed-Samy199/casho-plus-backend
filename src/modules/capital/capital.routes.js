import { Router } from "express";
import * as capitalController from "./capital.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../../middlewares/role.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import validateQuery from "../../middlewares/validateQuery.middleware.js";
import {
  balanceAdjustmentSchema,
  balanceHistoryQuerySchema,
} from "./capital.validation.js";

const router = Router();

// رأس المال الكلي معلومة حساسة — أدمن بس
router.use(protect, isAdmin);

router.get("/summary", capitalController.getCapitalSummaryHandler);

router.get(
  "/by-partner",
  capitalController.getCapitalByPartnerHandler
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
