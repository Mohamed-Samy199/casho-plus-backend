import { Router } from "express";
import * as debtController from "./debt.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import validateQuery from "../../middlewares/validateQuery.middleware.js";
import { createUploader } from "../../middlewares/upload.middleware.js";
import {
  createDebtSchema,
  repayDebtSchema,
  listDebtsSchema,
} from "./debt.validation.js";

const router = Router();
const uploadDebtReceipts = createUploader("debts");

router.use(protect);

router.post("/", validate(createDebtSchema), debtController.createDebtHandler);
router.get("/", validateQuery(listDebtsSchema), debtController.listDebtsHandler);
router.get("/:id", debtController.getDebtHandler);
router.post("/:id/repay", validate(repayDebtSchema), debtController.repayDebtHandler);
router.get("/:id/payments", debtController.listDebtPaymentsHandler);
router.post("/:id/receipts", uploadDebtReceipts, debtController.uploadReceiptsHandler);

export default router;