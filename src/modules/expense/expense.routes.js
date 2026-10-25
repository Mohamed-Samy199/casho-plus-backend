import { Router } from "express";
import * as controller from "./expense.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../../middlewares/role.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import validateQuery from "../../middlewares/validateQuery.middleware.js";
import {
  createExpenseSchema,
  listExpensesSchema,
  repayExpenseSchema,
  sellAssetSchema,
} from "./expense.validation.js";

const router = Router();
router.use(protect, isAdmin);
router.get("/accounts", controller.listAccountsHandler);
router.get("/", validateQuery(listExpensesSchema), controller.listExpensesHandler);
router.post("/", validate(createExpenseSchema), controller.createExpenseHandler);
router.patch("/:id/repay", validate(repayExpenseSchema), controller.repayAdvanceHandler);
router.patch("/:id/sell", validate(sellAssetSchema), controller.sellAssetHandler);
export default router;
