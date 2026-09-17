import { Router } from "express";
import * as transactionController from "./transaction.controller.js";
import { protect } from "../../middlewares/auth.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import validateQuery from "../../middlewares/validateQuery.middleware.js";
import {
  createTransactionSchema,
  listTransactionsSchema,
} from "./transaction.validation.js";

const router = Router();

// كل الراوتس هنا لازم يكون المستخدم عامل تسجيل دخول (أدمن أو موظف)
router.use(protect);

router.post("/", validate(createTransactionSchema), transactionController.createTransactionHandler);
router.get("/", validateQuery(listTransactionsSchema), transactionController.listTransactionsHandler);
router.get("/:id", transactionController.getTransactionHandler);

export default router;