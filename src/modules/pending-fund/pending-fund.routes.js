import { Router } from "express";
import { protect } from "../../middlewares/auth.middleware.js";
import { isAdmin } from "../../middlewares/role.middleware.js";
import validate from "../../middlewares/validate.middleware.js";
import validateQuery from "../../middlewares/validateQuery.middleware.js";
import * as controller from "./pending-fund.controller.js";
import { createPendingFundSchema, listPendingFundsSchema, returnPendingFundSchema, writeOffPendingFundSchema } from "./pending-fund.validation.js";

const router = Router();
router.use(protect, isAdmin);
router.get("/", validateQuery(listPendingFundsSchema), controller.listPendingFundsHandler);
router.post("/", validate(createPendingFundSchema), controller.createPendingFundHandler);
router.patch("/:id/return", validate(returnPendingFundSchema), controller.returnPendingFundHandler);
router.patch("/:id/write-off", validate(writeOffPendingFundSchema), controller.writeOffPendingFundHandler);
export default router;
